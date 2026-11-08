-- Lead intake: old leads and their feed are untouched; the new activity kind is accepted (the check is «not valid» until 210200)
do $$
begin
  if not exists (select 1 from public.leads where id = 'c1120000-0000-4000-8000-0000000000b1' and contact_name = 'Old Lead' and language = 'es'
                   and provider is null and provider_ref is null and parse_status is null and intake_event_id is null) then
    raise exception 'T112 upgrade: an old lead keeps its fields, the new ones are empty';
  end if;
  if (select count(*) from public.activities where subject_id = 'c1120000-0000-4000-8000-0000000000b1' and kind = 'call') <> 1 then
    raise exception 'T112 upgrade: the old feed stays';
  end if;
  insert into public.activities (company_id, subject_type, subject_id, kind, direction, actor_id) values
    ('c1120000-0000-4000-8000-000000000001', 'lead', 'c1120000-0000-4000-8000-0000000000b1', 'intake', 'in', null);
  begin
    insert into public.activities (company_id, subject_type, subject_id, kind) values
      ('c1120000-0000-4000-8000-000000000001', 'lead', 'c1120000-0000-4000-8000-0000000000b1', 'bogus');
    raise exception 'T112 upgrade: an unknown activity kind passed';
  exception when check_violation then null;
  end;
end $$;
do $$
declare r record;
begin
  set local session_replication_role = replica;
  for r in select c.conrelid::regclass as tbl, a.attname as col
             from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid = 'public.companies'::regclass loop
    execute format('delete from %s where %I = %L', r.tbl, r.col, 'c1120000-0000-4000-8000-000000000001');
  end loop;
  delete from public.companies where id = 'c1120000-0000-4000-8000-000000000001';
  set local session_replication_role = origin;
end $$;
\echo 'upgrade 20261108210000_lead_intake ok'
