-- П4a (docs/specs/03-visit-and-plan.md «П4 — этап 0», §6.1): «Ещё → Компания → Расписание».
-- * companies.schedule_settings — default length by visit kind, slot step, the arrival window the client sees, the «late»
--   threshold. The app (features/scheduleSettings.ts) fills missing keys with defaults; the check below refuses junk with
--   the same limits.
-- * companies.business_hours (core, unused until now) — working hours by weekday: {"mon": [480, 1080], …, "sun": null},
--   minutes from midnight, [start, end); null for the whole column = the defaults (Mon–Sat 8:00–18:00).
-- Rights do not change: members read the company, owner / admin change it (companies_update).
-- Test: supabase/tests/core_rls.sql T38; old rows: upgrade/20261105370000_*.

alter table public.companies add column if not exists schedule_settings jsonb not null default '{}'::jsonb;

create or replace function app.valid_schedule_settings(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
       where e.key not in ('inspectionMin', 'jobMin', 'serviceMin', 'followUpMin', 'stepMin', 'arrivalWindowMin', 'lateAfterMin')
          or jsonb_typeof(e.value) <> 'number'
          or (e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric)
          or case
               when e.key in ('inspectionMin', 'jobMin', 'serviceMin', 'followUpMin')
                 then not ((e.value #>> '{}')::numeric between 15 and 720 and (e.value #>> '{}')::numeric % 15 = 0)
               when e.key = 'stepMin' then (e.value #>> '{}')::numeric not in (15, 30, 60)
               when e.key = 'arrivalWindowMin' then (e.value #>> '{}')::numeric not in (0, 60, 120, 180)
               else not ((e.value #>> '{}')::numeric between 5 and 60 and (e.value #>> '{}')::numeric % 5 = 0)
             end)
$$;

create or replace function app.valid_business_hours(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and not exists (
      select 1 from jsonb_each(p) e
      where e.key not in ('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat')
         or not (
           jsonb_typeof(e.value) = 'null'
           or (jsonb_typeof(e.value) = 'array' and jsonb_array_length(e.value) = 2
               and jsonb_typeof(e.value -> 0) = 'number' and jsonb_typeof(e.value -> 1) = 'number'
               and (e.value ->> 0)::numeric = trunc((e.value ->> 0)::numeric)
               and (e.value ->> 1)::numeric = trunc((e.value ->> 1)::numeric)
               and (e.value ->> 0)::numeric >= 0 and (e.value ->> 1)::numeric <= 1440
               and (e.value ->> 0)::numeric < (e.value ->> 1)::numeric))))
$$;

revoke all on function app.valid_schedule_settings(jsonb) from public, anon, authenticated;
revoke all on function app.valid_business_hours(jsonb) from public, anon, authenticated;
-- the check runs as the user who saves the company (owner / admin): a pure validator, nothing else to reach
grant execute on function app.valid_schedule_settings(jsonb) to authenticated;
grant execute on function app.valid_business_hours(jsonb) to authenticated;
-- and for server code that writes companies without a user (the check runs for it too)
grant execute on function app.valid_schedule_settings(jsonb) to service_role;
grant execute on function app.valid_business_hours(jsonb) to service_role;

-- business_hours was never written by the app: a stray old shape becomes null (= defaults) instead of blocking the check
update public.companies set business_hours = null where not app.valid_business_hours(business_hours);

alter table public.companies drop constraint if exists companies_schedule_settings_valid;
alter table public.companies add constraint companies_schedule_settings_valid check (app.valid_schedule_settings(schedule_settings));
alter table public.companies drop constraint if exists companies_business_hours_valid;
alter table public.companies add constraint companies_business_hours_valid check (app.valid_business_hours(business_hours));
