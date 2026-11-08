-- Gutters M8b (docs/specs/33-gutters-estimate.md П23.8; debt of M2 №3): the server numbers a measurement's revisions.
-- A revision is the drawing and its parts as they were when «Смета» / «Обновить смету» was pressed. Phones work offline
-- and two of them can make an estimate from one measurement: the number they send is ignored — the server takes the
-- measurement's row lock and gives the next one, and keeps gutter_measurements.revision = the newest number.
-- A replay of the same write (the queue retries; the app inserts `on conflict (id) do nothing`) never moves the number:
-- BEFORE INSERT runs before ON CONFLICT (lesson of «Модуль Gutters» №3), so an id that is already there is left alone.
-- Rule 16: nothing renamed or dropped; one new function and one new trigger. Rule 18: nobody executes it directly.
create or replace function app.tg_gutter_revision_number()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_last integer;
begin
  -- a replay: the row is there, the insert will do nothing — the number and the measurement stay as they are
  if exists (select 1 from public.gutter_measurement_revisions where id = new.id) then
    return new;
  end if;
  select revision into v_last from public.gutter_measurements
   where id = new.measurement_id and company_id = new.company_id
   for update;
  if not found then
    -- the foreign key answers the same; say it plainly (P0001 = the server's «no», not «try later»)
    raise exception 'no such measurement' using errcode = 'P0001';
  end if;
  -- past the newest revision too: a measurement row whose counter was set back (by hand, an old phone) never makes a
  -- number that is taken — the unique (measurement_id, revision) would refuse every next write for ever
  new.revision := greatest(v_last, coalesce((select max(revision) from public.gutter_measurement_revisions where measurement_id = new.measurement_id), 0)) + 1;
  update public.gutter_measurements set revision = new.revision where id = new.measurement_id and company_id = new.company_id;
  return new;
end;
$$;
revoke all on function app.tg_gutter_revision_number() from public, anon, authenticated;

-- t03: before the limits (t06) and the standard service fields; runs for every row
create trigger t03_revision_number before insert on public.gutter_measurement_revisions
  for each row execute function app.tg_gutter_revision_number();
