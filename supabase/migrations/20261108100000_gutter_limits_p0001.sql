-- Gutters M7a (docs/specs/33-gutters-settings.md П22.2 №17): the per-measurement limits answer P0001, not 54000.
-- PostgREST sends 54* as HTTP 500 («too complex»): the phone's queue took it for «try later» and retried for ever.
-- P0001 is HTTP 400 — the server's «no»: the op is dropped after its tries and the card «не сохранено» shows.
-- hint 'limit_reached' lets the app tell this refusal apart. Only the function body changes (no rename, rule 16);
-- the trigger t06_limits keeps calling it. Rights stay as in 20261107180000: nobody executes it directly (rule 18).
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
    select count(*) into n from public.gutter_measurement_revisions where measurement_id = new.measurement_id;
    if n >= 100 then
      raise exception 'a measurement has at most 100 revisions' using errcode = 'P0001', hint = 'limit_reached';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_gutter_limits() from public, anon, authenticated;
