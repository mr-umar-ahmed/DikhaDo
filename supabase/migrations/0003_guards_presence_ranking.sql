-- Fixes from the Phase 2 review. Safe to run once on top of 0001 + 0002.

-- ── 1. Job status transitions are validated in the database ──────────────────
-- Two phones write the same row. Without a guard, a late "Accept" overwrites the customer's
-- "Cancel", and a stale screen can reopen a finished job. The client also sends the status it
-- believes the job is in, but this is the line that cannot be bypassed.
create or replace function refresh_tier(p_worker uuid) returns void language sql as $$
  update workers set tier = case
      when jobs_done >= 25 and rating_avg >= 4.5 and verified then 'star'
      when jobs_done >= 5  and rating_avg >= 4.0 then 'trusted'
      else 'new' end
  where profile_id = p_worker;
$$;

create or replace function log_request_status() returns trigger language plpgsql as $$
declare
  allowed text[];
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  allowed := case old.status
    when 'requested'  then array['accepted','declined','cancelled']
    when 'accepted'   then array['on_the_way','working','cancelled','declined']
    when 'on_the_way' then array['working','cancelled','declined']
    when 'working'    then array['done','disputed']
    when 'done'       then array['paid','disputed']
    when 'paid'       then array['rated','disputed']
    else array[]::text[]                       -- rated, declined, cancelled, disputed are final
  end;
  if not (new.status = any (allowed)) then
    raise exception 'job is already %, it cannot become %', old.status, new.status using errcode = 'P0001';
  end if;
  if new.status = 'done' and coalesce(new.price_agreed, 0) <= 0 then
    raise exception 'a finished job needs the amount charged' using errcode = 'P0001';
  end if;
  if new.status = 'paid' and new.pay_method is null then
    raise exception 'a paid job needs a payment method' using errcode = 'P0001';
  end if;

  -- A job counts for the worker once it is paid, whether or not the customer goes on to rate it.
  if new.status = 'paid' then
    update workers set jobs_done = jobs_done + 1 where profile_id = new.worker_id;
    perform refresh_tier(new.worker_id);
  end if;

  insert into request_events (request_id, status) values (new.id, new.status);
  new.updated_at := now();
  return new;
end $$;

create or replace function apply_rating() returns trigger language plpgsql as $$
begin
  -- Fails (and rolls the rating back) unless the job is currently 'paid'.
  update requests set status = 'rated' where id = new.request_id;
  update workers w set
    rating_count = w.rating_count + 1,
    rating_avg   = round(((w.rating_avg * w.rating_count) + new.stars)::numeric / (w.rating_count + 1), 2)
  where w.profile_id = new.worker_id;
  perform refresh_tier(new.worker_id);
  return null;
end $$;

-- ── 2. Presence survives a locked screen; heartbeat reports a missing worker ──
-- The phone keeps its screen on while on duty, but a manual lock or a dead zone must not delist
-- a worker within two minutes. Going off duty still delists at once (on_duty = false).
drop function if exists worker_heartbeat(uuid, double precision, double precision, boolean);
create function worker_heartbeat(p_profile uuid, p_lat double precision, p_lng double precision, p_on_duty boolean)
returns boolean language plpgsql as $$
begin
  update workers set on_duty = p_on_duty, last_seen = now(),
         geog = st_makepoint(p_lng, p_lat)::geography
  where profile_id = p_profile;
  return found;          -- false: this phone's saved worker no longer exists on the server
end $$;

-- ── 3. Matching: 10-minute presence window, and "no ratings yet" is not "zero stars" ──
create or replace function nearby_workers(
  p_lat double precision, p_lng double precision,
  p_category text, p_lang text default 'en', p_radius_km double precision default 15
) returns table (
  profile_id uuid, name text, phone text, photo_url text, village text,
  languages text[], verified boolean, tier text, rating_avg numeric, rating_count int,
  jobs_done int, call_before_coming boolean, distance_m double precision,
  min_inr int, max_inr int
) language sql stable as $$
  select w.profile_id, p.name, p.phone, p.photo_url, p.village,
         w.languages, w.verified, w.tier, w.rating_avg, w.rating_count,
         w.jobs_done, w.call_before_coming,
         st_distance(w.geog, st_makepoint(p_lng, p_lat)::geography) as distance_m,
         rc.min_inr, rc.max_inr
  from workers w
  join profiles p on p.id = w.profile_id
  left join rate_cards rc on rc.category_code = p_category and rc.region = 'default'
  where w.on_duty
    and w.geog is not null
    and w.last_seen > now() - interval '10 minutes'
    and w.skills @> array[coalesce((select parent_code from categories where code = p_category), p_category)]
    and st_dwithin(w.geog, st_makepoint(p_lng, p_lat)::geography, p_radius_km * 1000)
  order by
    -- Score in "kilometres saved": each bonus is how much farther we would send the customer for it.
    st_distance(w.geog, st_makepoint(p_lng, p_lat)::geography) / 1000.0
      - (case w.tier when 'star' then 3 when 'trusted' then 1.5 else 0 end)
      - (case when w.rating_count = 0 then 4.0 else w.rating_avg end) * 0.5   -- unrated = neutral prior
      - (case when p_lang = any (w.languages) then 1 else 0 end)
      - (case when w.verified then 1 else 0 end)
  limit 20;
$$;

-- ── 4. Move the 12 seeded demo workers to wherever the demo is ───────────────
--   select move_demo_workers(17.4474, 78.3762);
-- Keeps their scatter, recentres it on the point given. Seeded workers are the ones with
-- +9190000000xx phone numbers. Callable by anyone while the hackathon RLS is open.
create or replace function move_demo_workers(p_lat double precision, p_lng double precision)
returns int language plpgsql as $$
declare
  c geometry;
  n int;
begin
  select st_centroid(st_collect(w.geog::geometry)) into c
  from workers w join profiles p on p.id = w.profile_id
  where p.phone like '+9190000000__';
  if c is null then return 0; end if;

  update workers w
  set geog = st_translate(w.geog::geometry, p_lng - st_x(c), p_lat - st_y(c))::geography
  from profiles p
  where p.id = w.profile_id and p.phone like '+9190000000__';
  get diagnostics n = row_count;
  return n;
end $$;
