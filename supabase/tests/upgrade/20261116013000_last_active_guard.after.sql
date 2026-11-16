-- After: the hand-written value is cleared, the right one stays, nothing else of the rows moved.
do $$
begin
  if (select last_active_company_id from public.users where id = 'cacc0000-0000-4000-8000-0000000002a1') is not null then
    raise exception 'UPGRADE 285: a company the person is not in stays in last_active_company_id';
  end if;
  if (select last_active_company_id from public.users where id = 'cacc0000-0000-4000-8000-0000000002a2') is distinct from 'cacc0000-0000-4000-8000-000000000285'
     or (select full_name from public.users where id = 'cacc0000-0000-4000-8000-0000000002a1') is distinct from 'Out Sider' then
    raise exception 'UPGRADE 285: the migration moved a right value or another field';
  end if;
end $$;
do $$
declare r record;
begin
  set local session_replication_role = replica;
  for r in select c.conrelid::regclass as tbl, a.attname as col
             from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid = 'public.companies'::regclass loop
    execute format('delete from %s where %I = %L', r.tbl, r.col, 'cacc0000-0000-4000-8000-000000000285');
  end loop;
  delete from public.companies where id = 'cacc0000-0000-4000-8000-000000000285';
  delete from public.users where id in ('cacc0000-0000-4000-8000-0000000002a1', 'cacc0000-0000-4000-8000-0000000002a2');
  delete from auth.users where id in ('cacc0000-0000-4000-8000-0000000002a1', 'cacc0000-0000-4000-8000-0000000002a2');
  set local session_replication_role = origin;
end $$;
