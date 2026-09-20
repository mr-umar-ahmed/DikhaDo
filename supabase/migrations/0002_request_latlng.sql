-- Plain coordinates on a job, so phones can read them without parsing PostGIS binary.
-- `geog` stays the source for spatial queries and is kept in step by the trigger.
alter table requests add column lat double precision, add column lng double precision;

create function requests_sync_geog() returns trigger language plpgsql as $$
begin
  if new.lat is not null and new.lng is not null then
    new.geog := st_makepoint(new.lng, new.lat)::geography;
  end if;
  return new;
end $$;
create trigger requests_geog before insert or update of lat, lng on requests
  for each row execute function requests_sync_geog();

-- Realtime filters on UPDATE need the full old row.
alter table requests replica identity full;
