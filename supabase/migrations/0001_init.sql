-- DikhaDo schema. Run in the Supabase SQL editor (or `supabase db push`), then run seed.sql.
create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ── People ───────────────────────────────────────────────────────────────────
create table profiles (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid unique,                       -- auth.users.id; null for seeded demo people
  role        text not null check (role in ('customer','worker','sahayak')),
  name        text not null,
  phone       text,
  lang        text not null default 'en',
  village     text,
  pincode     text,
  photo_url   text,
  created_at  timestamptz not null default now()
);

create table workers (
  profile_id          uuid primary key references profiles(id) on delete cascade,
  skills              text[] not null default '{}',     -- top-level category codes
  languages           text[] not null default '{en}',
  on_duty             boolean not null default false,
  last_seen           timestamptz,
  geog                geography(point, 4326),
  upi_id              text,
  call_before_coming  boolean not null default true,
  verified            boolean not null default false,
  verified_by         uuid references profiles(id),
  rating_avg          numeric(3,2) not null default 0,
  rating_count        int not null default 0,
  jobs_done           int not null default 0,
  tier                text not null default 'new' check (tier in ('new','trusted','star'))
);
create index workers_geog_idx on workers using gist (geog);
create index workers_skills_idx on workers using gin (skills);

-- ── Catalog: a new service is a row here, never a screen ─────────────────────
create table categories (
  code          text primary key,
  parent_code   text references categories(code),
  icon          text not null,                   -- icon name bundled in the app
  name_en       text not null,
  name_hi       text not null,
  name_te       text not null,
  vision_class  text,                            -- on-device model class that maps here
  rail          text not null default 'worker' check (rail in ('worker','civic')),
  sort          int not null default 0
);

create table rate_cards (
  category_code text not null references categories(code),
  region        text not null default 'default',
  min_inr       int not null,
  max_inr       int not null,
  primary key (category_code, region)
);

-- ── Jobs ─────────────────────────────────────────────────────────────────────
create sequence request_serial_seq;

create table requests (
  id            uuid primary key default gen_random_uuid(),
  serial        text unique not null
                default 'DKD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('request_serial_seq')::text, 6, '0'),
  client_id     text unique,                     -- id minted offline on the phone: makes retries idempotent
  customer_id   uuid not null references profiles(id),
  worker_id     uuid references profiles(id),
  booked_by     uuid references profiles(id),    -- sahayak, when booking for someone else
  category_code text not null references categories(code),
  diagnosis     text,
  vision_conf   real,
  photo_url     text,
  voice_url     text,
  geog          geography(point, 4326),
  address_hint  text,
  status        text not null default 'requested' check (status in
                ('requested','accepted','on_the_way','working','done','paid','rated','declined','cancelled','disputed')),
  price_agreed  int,
  pay_method    text check (pay_method in ('cash','upi')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index requests_worker_idx on requests (worker_id, status);
create index requests_customer_idx on requests (customer_id, created_at desc);

create table request_events (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references requests(id) on delete cascade,
  status      text not null,
  at          timestamptz not null default now()
);

create table ratings (
  request_id  uuid primary key references requests(id) on delete cascade,
  worker_id   uuid not null references profiles(id),
  stars       int not null check (stars between 1 and 5),
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create table verifications (
  id            uuid primary key default gen_random_uuid(),
  worker_id     uuid not null references profiles(id) on delete cascade,
  id_photo_url  text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by   uuid references profiles(id),
  created_at    timestamptz not null default now()
);

-- ── Triggers: timeline + reputation are derived, never written by clients ────
create function log_request_status() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    insert into request_events (request_id, status) values (new.id, new.status);
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger requests_status_log_upd before update on requests
  for each row execute function log_request_status();

-- Inserts log after the row exists, so the child foreign key holds.
create function log_request_insert() returns trigger language plpgsql as $$
begin
  insert into request_events (request_id, status) values (new.id, new.status);
  return null;
end $$;
create trigger requests_status_log_ins after insert on requests
  for each row execute function log_request_insert();

create function apply_rating() returns trigger language plpgsql as $$
begin
  update workers w set
    rating_count = w.rating_count + 1,
    rating_avg   = round(((w.rating_avg * w.rating_count) + new.stars)::numeric / (w.rating_count + 1), 2),
    jobs_done    = w.jobs_done + 1
  where w.profile_id = new.worker_id;
  update workers set tier = case
      when jobs_done >= 25 and rating_avg >= 4.5 and verified then 'star'
      when jobs_done >= 5  and rating_avg >= 4.0 then 'trusted'
      else 'new' end
  where profile_id = new.worker_id;
  update requests set status = 'rated' where id = new.request_id;
  return null;
end $$;
create trigger ratings_apply after insert on ratings
  for each row execute function apply_rating();

-- ── Matching ─────────────────────────────────────────────────────────────────
-- Workers who are on duty *right now*, have the skill, and are within reach.
-- Rank: closer, higher tier, better rated, speaks the customer's language.
create function nearby_workers(
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
    and w.last_seen > now() - interval '2 minutes'
    and w.skills @> array[coalesce((select parent_code from categories where code = p_category), p_category)]
    and st_dwithin(w.geog, st_makepoint(p_lng, p_lat)::geography, p_radius_km * 1000)
  order by
    st_distance(w.geog, st_makepoint(p_lng, p_lat)::geography) / 1000.0
      - (case w.tier when 'star' then 3 when 'trusted' then 1.5 else 0 end)
      - w.rating_avg * 0.5
      - (case when p_lang = any (w.languages) then 1 else 0 end)
      - (case when w.verified then 1 else 0 end)
  limit 20;
$$;

-- Heartbeat from the worker phone: one cheap call keeps presence and location fresh.
create function worker_heartbeat(p_profile uuid, p_lat double precision, p_lng double precision, p_on_duty boolean)
returns void language sql as $$
  update workers set on_duty = p_on_duty, last_seen = now(),
         geog = st_makepoint(p_lng, p_lat)::geography
  where profile_id = p_profile;
$$;

-- ── Realtime + access ────────────────────────────────────────────────────────
alter publication supabase_realtime add table requests, workers, verifications;

-- HACKATHON POLICY: open anon access so two demo phones and the console work without SMS OTP.
-- Before any real launch: bind profiles.auth_id to auth.uid() and restrict rows to their owners.
do $$ declare t text; begin
  foreach t in array array['profiles','workers','categories','rate_cards','requests','request_events','ratings','verifications'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to anon, authenticated using (true) with check (true)', t || '_open', t);
  end loop;
end $$;
