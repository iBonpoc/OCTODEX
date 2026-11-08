-- Lead intake hardening: the old way in still works, its journal stays, the new columns are empty
do $$
begin
  if not exists (select 1 from public.intake_endpoints where id = 'c1250000-0000-4000-8000-0000000000e1' and prev_token_hash is null and prev_rotated_at is null) then
    raise exception 'T125 upgrade: an old way in keeps its token, no previous one';
  end if;
  if not exists (select 1 from public.intake_events where event_key = 'old-ev' and net_hash is null and status = 'accepted') then
    raise exception 'T125 upgrade: the old journal row stays';
  end if;
  if (app.intake_form_info(repeat('c', 64)) ->> 'company') is distinct from 'T125 upgrade co' then
    raise exception 'T125 upgrade: the old form still opens';
  end if;
end $$;
do $$
declare r record;
begin
  set local session_replication_role = replica;
  for r in select c.conrelid::regclass as tbl, a.attname as col
             from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid = 'public.companies'::regclass loop
    execute format('delete from %s where %I = %L', r.tbl, r.col, 'c1250000-0000-4000-8000-000000000001');
  end loop;
  delete from public.companies where id = 'c1250000-0000-4000-8000-000000000001';
  set local session_replication_role = origin;
end $$;
\echo 'upgrade 20261108233000_lead_intake_hold ok'
