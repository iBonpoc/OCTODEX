-- 3b-3 «Работы и выезды» (docs/specs/17-job.md §11.1, S9/S9a): «Весь день» у выезда.
-- * visits.all_day — the visit takes the whole day: kept as 00:00–24:00 (one or more days) in the company's time zone,
--   like calendar_events / tasks (planFeed eventRange). Not «late» (the app), no time in «Сообщить клиенту».
-- * t03_visit_all_day — all_day stays true only on a whole-day range at the company's midnight. An old app version moving
--   such a visit writes only starts_at / ends_at (ops visit.reschedule): the new range is not whole days → all_day goes
--   back to false by itself, so a timed visit never keeps the flag (rule 16: the column is only added, old phones work).
-- * t05_visit_tech_guard — the technician does not change all_day (the time of a visit is the office's).
-- db T70 (column, normalizer, guard), T71 (old app move, insert from an old app without the column).

alter table public.visits add column if not exists all_day boolean not null default false;

create or replace function app.tg_visit_all_day()
returns trigger language plpgsql set search_path = '' as $$
-- invoker: whoever writes the visit reads their own company's zone (RLS); nothing else is needed
declare tz text := 'America/Los_Angeles'; s timestamp; e timestamp;
begin
  if not new.all_day then return new; end if;
  select coalesce(nullif(co.timezone, ''), tz) into tz from public.companies co where co.id = new.company_id;
  -- a zone Postgres does not know ('Pacific Time') must not stop the save (an offline op would retry forever):
  -- Los Angeles, as the app's validZone does
  if tz is null or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = tz) then tz := 'America/Los_Angeles'; end if;
  if new.starts_at is null or new.ends_at is null then new.all_day := false; return new; end if;
  s := new.starts_at at time zone tz;
  e := new.ends_at at time zone tz;
  if s <> date_trunc('day', s) or e <> date_trunc('day', e) or e <= s then new.all_day := false; end if;
  return new;
end;
$$;
revoke all on function app.tg_visit_all_day() from public, anon, authenticated;
drop trigger if exists t03_visit_all_day on public.visits;
create trigger t03_visit_all_day before insert or update of all_day, starts_at, ends_at on public.visits
  for each row execute function app.tg_visit_all_day();

-- the technician's guard (20261105300000) + all_day
create or replace function app.tg_visit_tech_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or app.is_staff(old.company_id) then return new; end if;
  if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
     or new.all_day is distinct from old.all_day
     or new.job_id is distinct from old.job_id or new.lead_id is distinct from old.lead_id
     or new.property_id is distinct from old.property_id
     or new.company_id is distinct from old.company_id or new.kind is distinct from old.kind
     or new.deleted_at is distinct from old.deleted_at
     or new.arrival_window_start is distinct from old.arrival_window_start or new.arrival_window_end is distinct from old.arrival_window_end
     or new.notify_customer is distinct from old.notify_customer or new.customer_notified_at is distinct from old.customer_notified_at
     or new.crew_id is distinct from old.crew_id
     or new.subcontractor_assignment_id is distinct from old.subcontractor_assignment_id or new.schedule_mode is distinct from old.schedule_mode
     or new.flex_week_start is distinct from old.flex_week_start or new.sequence_in_route is distinct from old.sequence_in_route
     or new.cancel_reason is distinct from old.cancel_reason or new.cancel_reason_text is distinct from old.cancel_reason_text
     or new.cancelled_at is distinct from old.cancelled_at or new.cancelled_by is distinct from old.cancelled_by
     or new.legacy_no_property is distinct from old.legacy_no_property then
    raise exception 'only the office changes the time, job or place of a visit' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and new.status in ('cancelled', 'no_show') then
    raise exception 'only the office cancels a visit' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_visit_tech_guard() from public, anon, authenticated;
