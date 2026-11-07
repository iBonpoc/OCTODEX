-- after 20261107050000: every stored zone is an exact IANA name; nothing else of the row changed
do $$
declare
  want constant jsonb := '{"1": "America/Chicago", "2": "America/Los_Angeles", "3": "America/Los_Angeles",
                           "4": "America/Los_Angeles", "5": "America/New_York", "6": "America/Denver",
                           "7": "America/Phoenix"}';
  r record;
begin
  for r in select right(id::text, 1) as k, timezone, phone, closed_at from public.companies
            where id::text like 'c7500000-0000-4000-8000-00000000000%' loop
    if r.timezone is distinct from want ->> r.k then
      raise exception 'FAILED: upgrade 050000 company % zone %, expected %', r.k, r.timezone, want ->> r.k;
    end if;
    if r.phone is distinct from '+1323555075' || r.k or r.closed_at is not null then
      raise exception 'FAILED: upgrade 050000 company % other fields changed', r.k;
    end if;
  end loop;
  if (select count(*) from public.companies where id::text like 'c7500000-0000-4000-8000-00000000000%') <> 7 then
    raise exception 'FAILED: upgrade 050000 rows lost';
  end if;
  if exists (select 1 from public.companies c where not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = c.timezone)) then
    raise exception 'FAILED: upgrade 050000 a company kept a zone the server does not know';
  end if;
end $$;
\echo 'upgrade 20261107050000 stored time zones are exact names ok'
