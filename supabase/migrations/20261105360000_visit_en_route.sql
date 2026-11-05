-- П3c (docs/specs/03 «П3c — этап 0», решение 3): when the tech left for the visit — for «Опаздывает · в пути с HH:MM».
-- «Опаздывает» itself is computed in the app (visitLate / lateKind) and never stored; only this time is.
-- The time comes from the phone with the step (so the offline queue does not move it to the sync time).
-- Rules for everyone with a user (service role, cron and server functions are free):
--   * set only together with the step to en_route (or while the visit is already en_route and has none — a replay);
--   * once set, it does not change: a repeat of the step keeps the first time quietly, any other change is refused;
--   * a time the server cannot believe becomes now() instead of a refusal (a refusal would jam the offline queue):
--     later than now() + 5 min (phone clock), earlier than the visit was created, or older than 3 days (the longest
--     an offline phone is expected to hold a step). An old build that sends no time gets now() too.
--   The phone time can still be shaded inside that window; the status journal (status_events) keeps the server time
--   of the step for a check.
-- Test: supabase/tests/core_rls.sql T36.

alter table public.visits add column if not exists en_route_at timestamptz;

create or replace function app.tg_visit_en_route_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.en_route_at is not null then
      raise exception 'en_route_at is set only with the step «on the way»' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  -- an old build moves to en_route without a time: the server notes it
  if new.status = 'en_route' and old.status is distinct from 'en_route' and new.en_route_at is null and old.en_route_at is null then
    new.en_route_at := now();
  end if;
  -- a repeat of «on the way» (the offline queue, or the second person on the visit with older data): the first time stays
  if old.en_route_at is not null and new.status = 'en_route' then
    new.en_route_at := old.en_route_at;
  end if;
  if new.en_route_at is distinct from old.en_route_at then
    if old.en_route_at is not null then
      raise exception 'en_route_at does not change once set' using errcode = 'check_violation';
    end if;
    if new.status <> 'en_route' then
      raise exception 'en_route_at is set only with the step «on the way»' using errcode = 'check_violation';
    end if;
    if new.en_route_at is null then
      raise exception 'en_route_at does not change once set' using errcode = 'check_violation';
    end if;
    if new.en_route_at > now() + interval '5 minutes' or new.en_route_at < greatest(old.created_at, now() - interval '3 days') then
      new.en_route_at := now();
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_visit_en_route_at() from public, anon, authenticated;

drop trigger if exists t06_visit_en_route_at on public.visits;
create trigger t06_visit_en_route_at before insert or update on public.visits
  for each row execute function app.tg_visit_en_route_at();
