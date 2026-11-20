-- After #1926 PR 2/4: every stored line cost, kept cost and template cost has its exact value = cents × 1000; nothing
-- else moved (no stamp, no version) — the sent version's cost included.
do $$
begin
  if (select unit_cost_millicents from public.estimate_line_costs where line_item_id = 'cacc0000-0000-4000-8000-0000000004b1') is distinct from 23000 then
    raise exception 'UPG460 the line cost is not 23 000';
  end if;
  if (select unit_cost_millicents from public.estimate_line_costs_kept where line_item_id = 'cacc0000-0000-4000-8000-0000000004b9') is distinct from 7000 then
    raise exception 'UPG460 the kept cost is not 7 000';
  end if;
  if (select unit_cost_millicents from public.estimate_template_line_costs where template_id = 'cacc0000-0000-4000-8000-0000000004f1' and line_id = 'l1') is distinct from 23000 then
    raise exception 'UPG460 the template cost is not 23 000';
  end if;
  if exists (select 1 from public._upg460 u join public.estimate_line_costs c on c.line_item_id = u.line_item_id
              where c.updated_at is distinct from u.updated_at or c.row_version is distinct from u.row_version) then
    raise exception 'UPG460 the migration moved a line cost';
  end if;
end $$;
\echo 'UPG460 the stored line costs got their exact value, nothing else moved'
do $$
declare r record;
begin
  set local session_replication_role = replica;
  for r in select c.conrelid::regclass as tbl, a.attname as col
             from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid = 'public.companies'::regclass loop
    execute format('delete from %s where %I = %L', r.tbl, r.col, 'cacc0000-0000-4000-8000-000000000460');
  end loop;
  delete from public.companies where id = 'cacc0000-0000-4000-8000-000000000460';
  drop table public._upg460;
  set local session_replication_role = origin;
end $$;
