-- Refunds: an old payment refunded before 20д (refunded_cents 500, no rows) still takes a new refund by its owner,
-- up to what it brings (2000 − 500); a direct UPDATE is refused now.
set request.jwt.claim.sub = 'c1330000-0000-4000-8000-0000000000a1';
set role authenticated;
do $$
begin
  if (public.refund_record('c1330000-0000-4000-8000-0000000000f1', 100, 'goodwill', null, 'u133-new-1') ->> 'status') <> 'succeeded' then
    raise exception 'T133 upgrade: an old refunded payment takes a new refund';
  end if;
  begin
    perform public.refund_record('c1330000-0000-4000-8000-0000000000f1', 1401, 'goodwill', null, 'u133-new-2');
    raise exception 'T133 upgrade: the old refund counts in the limit';
  exception when check_violation then null;
  end;
  begin
    update public.payments set refunded_cents = 900 where id = 'c1330000-0000-4000-8000-0000000000f1';
    raise exception 'T133 upgrade: a direct update is refused now';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
reset request.jwt.claim.sub;
do $$
declare r record;
begin
  if not exists (select 1 from public.payments where id = 'c1330000-0000-4000-8000-0000000000f1' and refunded_cents = 600 and status = 'partially_refunded') then
    raise exception 'T133 upgrade: 500 old + 100 new';
  end if;
  set local session_replication_role = replica;
  for r in select c.conrelid::regclass as tbl, a.attname as col
             from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid = 'public.companies'::regclass loop
    execute format('delete from %s where %I = %L', r.tbl, r.col, 'c1330000-0000-4000-8000-0000000000c1');
  end loop;
  delete from public.companies where id = 'c1330000-0000-4000-8000-0000000000c1';
  delete from public.users where id = 'c1330000-0000-4000-8000-0000000000a1';
  delete from auth.users where id = 'c1330000-0000-4000-8000-0000000000a1';
  set local session_replication_role = origin;
end $$;
\echo 'upgrade 20261109050000_refunds ok'
