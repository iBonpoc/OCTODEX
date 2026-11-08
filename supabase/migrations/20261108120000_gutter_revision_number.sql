-- Gutters M8b (docs/specs/33-gutters-estimate.md П23.8; debt of M2 №3): the server numbers a measurement's revisions.
-- A revision is the drawing and its parts as they were when «Смета» / «Обновить смету» was pressed. Phones work offline
-- and two of them can make an estimate from one measurement: the number they send is ignored — the server takes the
-- measurement's row lock and gives the next one, and keeps gutter_measurements.revision = the newest number.
-- A replay of the same write (the queue retries; the app inserts `on conflict (id) do nothing`) never moves the number
-- nor hits the limit: BEFORE INSERT runs before ON CONFLICT (lesson of «Модуль Gutters» №3), so an id that is already
-- there is left alone — checked AFTER the lock, so two replays at once see each other (security-check / review M8b).
-- Rule 16: nothing renamed or dropped; new functions and triggers, and the limits function's body (same name).
-- Rule 18: nobody executes them directly.

create or replace function app.tg_gutter_revision_number()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_last integer;
begin
  -- a stranger gets one answer whatever ids he sends, before anything is looked up or locked (no probing whether a
  -- measurement exists; security-check M8b №1–2). The server (no JWT) writes as it is.
  if auth.uid() is not null and not (app.is_staff(new.company_id) or app.gutter_sees_measurement(new.measurement_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select revision into v_last from public.gutter_measurements
   where id = new.measurement_id and company_id = new.company_id
   for no key update;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- a replay (also one running at the same time: it waited for the lock): the row is there, the insert will do
  -- nothing — the number and the measurement stay as they are
  if exists (select 1 from public.gutter_measurement_revisions where id = new.id) then
    return new;
  end if;
  -- past the newest revision too: a counter set back never makes a number that is taken
  new.revision := greatest(v_last, coalesce((select max(revision) from public.gutter_measurement_revisions where measurement_id = new.measurement_id), 0)) + 1;
  perform set_config('app.gutter_numbering', 'on', true);
  update public.gutter_measurements set revision = new.revision where id = new.measurement_id and company_id = new.company_id;
  perform set_config('app.gutter_numbering', 'off', true);
  return new;
end;
$$;
revoke all on function app.tg_gutter_revision_number() from public, anon, authenticated;

-- t03: before the limits (t06) and the standard service fields; runs for every row
create trigger t03_revision_number before insert on public.gutter_measurement_revisions
  for each row execute function app.tg_gutter_revision_number();

-- the counter is the server's: a phone (or a direct API call) that sends another revision keeps the old one — never an
-- error (an old phone's full write must still go through), never a number that would break the next revision
create or replace function app.tg_gutter_revision_kept()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.revision is distinct from old.revision and coalesce(current_setting('app.gutter_numbering', true), '') <> 'on' then
    new.revision := old.revision;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_gutter_revision_kept() from public, anon, authenticated;
create trigger t02_revision_kept before update of revision on public.gutter_measurements
  for each row execute function app.tg_gutter_revision_kept();

-- the limits (20261108100000) with one change: a replay of a revision that is there is not counted — the 100th
-- revision's lost answer must not turn its retry into «limit reached» (security-check M8b №4)
create or replace function app.tg_gutter_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if tg_table_name = 'gutter_measurement_elements' then
    select count(*) into n from public.gutter_measurement_elements where measurement_id = new.measurement_id;
    if n >= 1000 then
      raise exception 'a measurement has at most 1000 elements' using errcode = 'P0001', hint = 'limit_reached';
    end if;
  else
    if exists (select 1 from public.gutter_measurement_revisions where id = new.id) then
      return new;
    end if;
    select count(*) into n from public.gutter_measurement_revisions where measurement_id = new.measurement_id;
    if n >= 100 then
      raise exception 'a measurement has at most 100 revisions' using errcode = 'P0001', hint = 'limit_reached';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_gutter_limits() from public, anon, authenticated;
