-- П3c (docs/specs/03 «П3c — этап 0», решение 3): when the tech left for the visit — for «Опаздывает · в пути с HH:MM».
-- «Опаздывает» itself is computed in the app (visitLate / lateKind) and never stored; only this time is.
-- The time comes from the phone with the step (so the offline queue does not move it to the sync time).
-- Rules for everyone with a user (service role, cron and server functions are free):
--   * set only together with the step to en_route (or while the visit is already en_route and has none — a replay);
--   * once set, it does not change;
--   * not later than now() + 5 min (phone clock drift); an old build that sends no time gets now().
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
  if new.en_route_at is distinct from old.en_route_at then
    if old.en_route_at is not null then
      raise exception 'en_route_at does not change once set' using errcode = 'check_violation';
    end if;
    if new.status <> 'en_route' then
      raise exception 'en_route_at is set only with the step «on the way»' using errcode = 'check_violation';
    end if;
    if new.en_route_at > now() + interval '5 minutes' then
      raise exception 'en_route_at is in the future' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_visit_en_route_at() from public, anon, authenticated;

drop trigger if exists t06_visit_en_route_at on public.visits;
create trigger t06_visit_en_route_at before insert or update on public.visits
  for each row execute function app.tg_visit_en_route_at();
