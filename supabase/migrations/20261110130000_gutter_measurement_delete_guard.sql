-- docs/specs/33-gutters-workflow.md П24 Б6 (founder 09.11, #690): a gutter measurement is deleted softly (deleted_at),
-- and not while a signed estimate (awaiting countersign or approved) stands on it — its lines carry
-- source.measurementId in the current version's calc_inputs (as the app's signedOn reads it). The app refuses first; the server refuses too, whatever
-- an old app version or a stale queue sends. Only a trigger is added: no column, no grant changes.
-- rule16: small (no index; a delete of a measurement is rare: the company's signed estimates, their current version only)
create or replace function app.tg_gutter_measurement_delete_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.deleted_at is null and new.deleted_at is not null and exists (
       select 1
         from public.estimates e
         join public.estimate_versions v on v.company_id = e.company_id and v.id = e.current_version_id
        cross join lateral jsonb_array_elements(coalesce(v.calc_inputs -> 'options', '[]'::jsonb)) o
        cross join lateral jsonb_array_elements(coalesce(o -> 'lines', '[]'::jsonb)) l
        where e.company_id = new.company_id
          and e.deleted_at is null
          and e.status in ('awaiting_countersign', 'approved')
          and l -> 'source' ->> 'module' = 'gutters'
          and lower(l -> 'source' ->> 'measurementId') = new.id::text) then
    raise exception 'a signed estimate stands on this measurement' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_gutter_measurement_delete_guard() from public, anon, authenticated;
create trigger t06_delete_guard before update of deleted_at on public.gutter_measurements
  for each row execute function app.tg_gutter_measurement_delete_guard();
