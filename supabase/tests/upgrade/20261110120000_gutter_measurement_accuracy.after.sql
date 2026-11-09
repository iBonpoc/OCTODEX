-- After: the old measurement is «rough» (not good to cut by until someone says it was taped), nothing else moved.
do $$
begin
  if (select accuracy from public.gutter_measurements where id = 'cacc0000-0000-4000-8000-0000000001a1') is distinct from 'rough'
     or (select label from public.gutter_measurements where id = 'cacc0000-0000-4000-8000-0000000001a1') is distinct from 'Old drawing' then
    raise exception 'UPGRADE 160: an old measurement is not rough after the migration';
  end if;
end $$;
do $$
declare r record;
begin
  set local session_replication_role = replica;
  for r in select c.conrelid::regclass as tbl, a.attname as col
             from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid = 'public.companies'::regclass loop
    execute format('delete from %s where %I = %L', r.tbl, r.col, 'cacc0000-0000-4000-8000-000000000160');
  end loop;
  delete from public.companies where id = 'cacc0000-0000-4000-8000-000000000160';
  set local session_replication_role = origin;
end $$;
