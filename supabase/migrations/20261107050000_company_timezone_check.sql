-- companies.timezone is checked when written (docs/specs/22 §1, «Каркас» №7, 07.11.2026).
-- The server decides «the company's day» with `now() at time zone <companies.timezone>` (deposit invoice when the client
-- signs on /p/, «valid until», emails, which visits a tech sees). A name Postgres does not know fails the whole function
-- (`time zone "X" not recognized`); a bare abbreviation it does know ('EST') has no daylight time — the day is an hour off
-- in summer. The app silently used Los Angeles. Now:
-- * app.zone_name(text) — the exact IANA name for what was written, or null: an exact name of pg_timezone_names of the
--   form Area/Location (or 'UTC'), not posix/ right/ Etc/ SystemV/; else the same name in another case; else an EXPLICIT
--   list of US abbreviations and old US/* names (no guessing — security-check and director, 07.11). Nothing else.
-- * the stored rows are fixed first (unknown → America/Los_Angeles, what the app already showed), then
-- * the trigger t89 (after every other before-trigger, so the final value is checked) puts the exact name in, or refuses
--   'unknown time zone' (22023; the value is not in the text). An old phone's queued company.save with 'america/chicago'
--   still saves (rule 16: old versions do not break).
-- Rule 18: the trigger function is executed by nobody; app.zone_name only by authenticated / service_role (the trigger).

create or replace function app.zone_name(p_tz text)
returns text language plpgsql stable set search_path = '' as $$
declare
  v text;
  ok constant text := '^(UTC|[A-Z][A-Za-z_]+(/[A-Za-z0-9_+-]+)+)$';
begin
  if p_tz is null or btrim(p_tz) = '' then
    return null;
  end if;
  -- the old abbreviations and US/* aliases: an explicit list, the same result on every tzdata build
  v := case upper(btrim(p_tz))
    when 'EST' then 'America/New_York' when 'EDT' then 'America/New_York' when 'EST5EDT' then 'America/New_York'
    when 'US/EASTERN' then 'America/New_York'
    when 'CST' then 'America/Chicago' when 'CDT' then 'America/Chicago' when 'CST6CDT' then 'America/Chicago'
    when 'US/CENTRAL' then 'America/Chicago'
    -- 'MST' in Postgres is a fixed UTC−7 without daylight time — Arizona (security-check 07.11)
    when 'MST' then 'America/Phoenix' when 'MDT' then 'America/Denver' when 'MST7MDT' then 'America/Denver'
    when 'US/MOUNTAIN' then 'America/Denver' when 'US/ARIZONA' then 'America/Phoenix'
    when 'PST' then 'America/Los_Angeles' when 'PDT' then 'America/Los_Angeles' when 'PST8PDT' then 'America/Los_Angeles'
    when 'US/PACIFIC' then 'America/Los_Angeles'
    when 'AKST' then 'America/Anchorage' when 'AKDT' then 'America/Anchorage' when 'US/ALASKA' then 'America/Anchorage'
    when 'HST' then 'Pacific/Honolulu' when 'US/HAWAII' then 'Pacific/Honolulu'
    else null end;
  if v is not null then
    return v;
  end if;
  select n.name into v from pg_catalog.pg_timezone_names n
   where n.name = btrim(p_tz) and n.name ~ ok and n.name !~ '^(posix|right|Etc|SystemV)/';
  if v is not null then
    return v;
  end if;
  select n.name into v from pg_catalog.pg_timezone_names n
   where lower(n.name) = lower(btrim(p_tz)) and n.name ~ ok and n.name !~ '^(posix|right|Etc|SystemV)/'
   order by n.name limit 1;
  return v;
end;
$$;
revoke all on function app.zone_name(text) from public, anon, authenticated;
-- the trigger below runs as the writer (owner / admin through PostgREST, service_role in edge functions) and calls it:
-- a nested call checks EXECUTE (the trigger function itself is not checked). Pure: reads the zone catalog only.
grant execute on function app.zone_name(text) to authenticated, service_role;

-- ---- 1. The stored rows (before the trigger): only those that are not an allowed exact name, one update ----
-- (07.11 on production: 0 such rows; the notice names each one for the founder)
do $$
declare
  r record;
begin
  for r in select id, timezone from public.companies c
            where not exists (select 1 from pg_catalog.pg_timezone_names n
                               where n.name = c.timezone and n.name ~ '^(UTC|[A-Z][A-Za-z_]+(/[A-Za-z0-9_+-]+)+)$'
                                 and n.name !~ '^(posix|right|Etc|SystemV)/') loop
    raise notice 'company % time zone: % -> %', r.id, r.timezone, coalesce(app.zone_name(r.timezone), 'America/Los_Angeles');
  end loop;
end $$;
update public.companies c set timezone = coalesce(app.zone_name(c.timezone), 'America/Los_Angeles')
 where not exists (select 1 from pg_catalog.pg_timezone_names n
                    where n.name = c.timezone and n.name ~ '^(UTC|[A-Z][A-Za-z_]+(/[A-Za-z0-9_+-]+)+)$'
                      and n.name !~ '^(posix|right|Etc|SystemV)/');

-- ---- 2. Every write from now on ----
create or replace function app.tg_company_timezone()
returns trigger language plpgsql set search_path = '' as $$
declare
  v text;
begin
  if tg_op = 'UPDATE' and new.timezone is not distinct from old.timezone then
    return new;
  end if;
  v := app.zone_name(new.timezone);
  if v is null then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;
  new.timezone := v;
  return new;
end;
$$;
revoke all on function app.tg_company_timezone() from public, anon, authenticated;
create trigger t89_company_timezone before insert or update on public.companies
  for each row execute function app.tg_company_timezone();
