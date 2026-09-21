-- Five fixes from the review of 0004 (docs/review-migration-0004.json). Safe to run more than once.
-- Every statement here was written against the exact failure a reviewer described, and
-- mobile/scripts/civic-test.mjs checks each one after you run it.

-- ── 1. Tickets inserted with plain lat/lng (seed script, console) get their geography too ──
-- requests_sync_geog (0002) reads new.lat / new.lng and writes new.geog; civic_tickets has the same three columns.
drop trigger if exists civic_tickets_geog on civic_tickets;
create trigger civic_tickets_geog before insert or update of lat, lng on civic_tickets
  for each row execute function requests_sync_geog();

update civic_tickets set geog = st_makepoint(lng, lat)::geography where geog is null;

-- ── 2-4. report_civic: vanished reporter, simultaneous reports, retried reports ────────────
create or replace function report_civic(
  p_reporter uuid, p_kind text, p_lat double precision, p_lng double precision,
  p_photo_url text default null, p_note text default null, p_signature real[] default null
) returns civic_tickets language plpgsql as $$
declare
  existing civic_tickets;
  made civic_tickets;
  r record;
  who uuid;
begin
  -- A phone whose saved profile was deleted is an anonymous citizen, not a foreign-key error.
  select p.id into who from profiles p where p.id = p_reporter;

  -- One report of a kind at a time: two phones reporting the same heap in the same instant
  -- become one ticket with two signatures, not two tickets with one each. Released at commit.
  perform pg_advisory_xact_lock(hashtext('dikhado.civic.' || p_kind));

  select * into existing from civic_tickets t
  where t.kind = p_kind and t.status in ('open', 'reopened', 'resolved_claimed')
    and st_dwithin(t.geog, st_makepoint(p_lng, p_lat)::geography, 60)
  order by st_distance(t.geog, st_makepoint(p_lng, p_lat)::geography) limit 1;

  if found then
    -- A retry after a lost reply must not count the same citizen twice.
    if who is not null and exists (
      select 1 from civic_events e
      where e.ticket_id = existing.id and e.by_whom = who::text and e.what in ('reported', 'signed')
    ) then
      return existing;
    end if;
    update civic_tickets set signatures = signatures + 1, updated_at = now() where id = existing.id returning * into made;
    insert into civic_events (ticket_id, what, by_whom) values (made.id, 'signed', coalesce(who::text, 'citizen'));
    return made;
  end if;

  select * into r from civic_route(p_kind);
  if r.department is null then
    raise exception 'unknown kind of public problem: %', p_kind using errcode = 'P0001';
  end if;

  insert into civic_tickets (reporter_id, kind, department, sla_hours, severity, lat, lng, photo_url, note, signature)
  values (who, p_kind, r.department, r.sla_hours, r.severity, p_lat, p_lng, p_photo_url, p_note, p_signature)
  returning * into made;
  insert into civic_events (ticket_id, what, by_whom) values (made.id, 'reported', coalesce(who::text, 'citizen'));
  return made;
end $$;

-- ── 5. The badge reflects ALL of a worker's submissions, not just the last one touched ─────
-- Rejecting a blurry duplicate must not remove a badge earned by an approved submission.
create or replace function apply_verification() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    update workers set
      verified = exists (select 1 from verifications v where v.worker_id = new.worker_id and v.status = 'approved'),
      verified_by = case when new.status = 'approved' then new.reviewed_by else verified_by end
    where profile_id = new.worker_id;
    perform refresh_tier(new.worker_id);
  end if;
  return new;
end $$;
