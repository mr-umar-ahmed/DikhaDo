-- Everything the remaining phases need, in one run: photo + voice on a job, worker verification,
-- Proof of Work, and the civic ("Report to panchayat") rail. Safe to run once on top of 0001-0003.

-- ── 1. Job media and what the customer said ─────────────────────────────────
alter table requests
  add column if not exists transcript text,                 -- on-device speech, if the phone could do it
  add column if not exists urgent boolean not null default false,
  add column if not exists proof_before_url text,
  add column if not exists proof_after_url text,
  add column if not exists proof_verdict text check (proof_verdict in ('fixed','still_broken','unclear'));

-- Public bucket for job photos and voice notes; private bucket for ID documents.
insert into storage.buckets (id, name, public) values ('job-media', 'job-media', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('kyc', 'kyc', false) on conflict (id) do nothing;

-- HACKATHON POLICY (same spirit as the table RLS in 0001): anon may read and write these two buckets.
-- Before any real launch: job-media write = the job's customer only; kyc read = staff only.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'dikhado_media_open') then
    create policy dikhado_media_open on storage.objects for all to anon, authenticated
      using (bucket_id in ('job-media', 'kyc')) with check (bucket_id in ('job-media', 'kyc'));
  end if;
end $$;

-- ── 2. Worker verification: approve / reject from the console flips the badge ─
alter table verifications add column if not exists selfie_url text, add column if not exists note text;

create or replace function apply_verification() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    update workers set verified = (new.status = 'approved'), verified_by = new.reviewed_by where profile_id = new.worker_id;
    perform refresh_tier(new.worker_id);
  end if;
  return new;
end $$;
drop trigger if exists verifications_apply on verifications;
create trigger verifications_apply after update on verifications for each row execute function apply_verification();

-- ── 3. Civic rail: a public problem goes to a department, with a clock ────────
create sequence if not exists civic_serial_seq;

create table if not exists civic_tickets (
  id           uuid primary key default gen_random_uuid(),
  serial       text unique not null
               default 'CIV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('civic_serial_seq')::text, 6, '0'),
  reporter_id  uuid references profiles(id),
  kind         text not null check (kind in ('garbage','drain','pothole','streetlight','water')),
  department   text not null,
  sla_hours    int  not null,
  severity     int  not null check (severity between 1 and 5),
  lat          double precision not null,
  lng          double precision not null,
  geog         geography(point, 4326),
  photo_url    text,
  note         text,
  signature    real[],                      -- on-device scene signature, for duplicate and before/after checks
  signatures   int  not null default 1,     -- how many citizens reported the same thing: collective weight
  status       text not null default 'open' check (status in ('open','resolved_claimed','verified_fixed','reopened')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists civic_geog_idx on civic_tickets using gist (geog);

-- Every change to a ticket is kept. A closure that a citizen's re-scan contradicts stays on the record.
create table if not exists civic_events (
  id         bigint generated always as identity primary key,
  ticket_id  uuid not null references civic_tickets(id) on delete cascade,
  what       text not null,       -- reported, signed, resolved_claimed, verified_fixed, reopened_false_closure
  by_whom    text,
  at         timestamptz not null default now()
);

-- The routing table. Deterministic: the phone proposes a kind, this decides department, SLA and severity.
create or replace function civic_route(p_kind text, out department text, out sla_hours int, out severity int)
language sql immutable as $$
  -- Exactly the three OUT columns, in order: `select *` would also return `kind` and fail the type check.
  select t.department, t.sla_hours, t.severity from (values
    ('garbage',     'Sanitation (Gram Panchayat / ULB ward office)', 12, 3),
    ('drain',       'Sewerage and drainage',                        24, 4),
    ('pothole',     'Roads and works',                              72, 3),
    ('streetlight', 'Street lighting',                              48, 2),
    ('water',       'Water supply',                                 24, 3)
  ) as t(kind, department, sla_hours, severity) where t.kind = p_kind;
$$;

-- Report, or add a signature to the same problem if one is already open within 60 m.
create or replace function report_civic(
  p_reporter uuid, p_kind text, p_lat double precision, p_lng double precision,
  p_photo_url text default null, p_note text default null, p_signature real[] default null
) returns civic_tickets language plpgsql as $$
declare
  existing civic_tickets;
  made civic_tickets;
  r record;
begin
  select * into existing from civic_tickets t
  where t.kind = p_kind and t.status in ('open', 'reopened', 'resolved_claimed')
    and st_dwithin(t.geog, st_makepoint(p_lng, p_lat)::geography, 60)
  order by st_distance(t.geog, st_makepoint(p_lng, p_lat)::geography) limit 1;

  if found then
    update civic_tickets set signatures = signatures + 1, updated_at = now() where id = existing.id returning * into made;
    insert into civic_events (ticket_id, what, by_whom) values (made.id, 'signed', coalesce(p_reporter::text, 'citizen'));
    return made;
  end if;

  select * into r from civic_route(p_kind);
  insert into civic_tickets (reporter_id, kind, department, sla_hours, severity, lat, lng, geog, photo_url, note, signature)
  values (p_reporter, p_kind, r.department, r.sla_hours, r.severity, p_lat, p_lng,
          st_makepoint(p_lng, p_lat)::geography, p_photo_url, p_note, p_signature)
  returning * into made;
  insert into civic_events (ticket_id, what, by_whom) values (made.id, 'reported', coalesce(p_reporter::text, 'citizen'));
  return made;
end $$;

-- A citizen's re-scan is the last word. "fixed" closes the ticket; "still_broken" on a ticket the
-- department marked resolved reopens it and records the false closure.
create or replace function verify_civic(p_ticket uuid, p_verdict text) returns civic_tickets language plpgsql as $$
declare t civic_tickets;
begin
  select * into t from civic_tickets where id = p_ticket;
  if not found then raise exception 'no such ticket'; end if;
  if p_verdict = 'fixed' then
    update civic_tickets set status = 'verified_fixed', updated_at = now() where id = p_ticket returning * into t;
    insert into civic_events (ticket_id, what, by_whom) values (p_ticket, 'verified_fixed', 'citizen re-scan');
  elsif p_verdict = 'still_broken' and t.status = 'resolved_claimed' then
    update civic_tickets set status = 'reopened', updated_at = now() where id = p_ticket returning * into t;
    insert into civic_events (ticket_id, what, by_whom) values (p_ticket, 'reopened_false_closure', 'citizen re-scan');
  end if;
  return t;
end $$;

-- ── 4. Realtime + hackathon access for the new tables ────────────────────────
do $$ begin
  begin alter publication supabase_realtime add table civic_tickets; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table civic_events;  exception when duplicate_object then null; end;
end $$;

do $$ declare t text; begin
  foreach t in array array['civic_tickets', 'civic_events'] loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_open') then
      execute format('create policy %I on %I for all to anon, authenticated using (true) with check (true)', t || '_open', t);
    end if;
  end loop;
end $$;
