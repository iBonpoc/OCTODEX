-- After: no price is re-counted by the migration (an off-formula price stays until its cost changes, spec 53 §5.3б п.2);
-- price_from_cost — only the material with a cost.
do $$
begin
  if (select array_agg(unit_price_cents::text || ':' || price_from_cost::text order by name) from public.catalog_items
       where company_id = 'cacc0000-0000-4000-8000-000000000322') is distinct from array['9000:false', '700:false', '1500:true'] then
    raise exception 'UPGRADE 322: the migration re-counted a price or set price_from_cost wrong: %',
      (select array_agg(name || '=' || unit_price_cents || ':' || price_from_cost order by name) from public.catalog_items
        where company_id = 'cacc0000-0000-4000-8000-000000000322');
  end if;
  if exists (select 1 from public.catalog_price_history where company_id = 'cacc0000-0000-4000-8000-000000000322' and unit_price_cents is not null)
     or exists (select 1 from public.catalog_price_recalc where company_id = 'cacc0000-0000-4000-8000-000000000322') then
    raise exception 'UPGRADE 322: the migration wrote a price row';
  end if;
  if exists (select 1 from public.catalog_items i join public._upg322 u on u.id = i.id
              where i.updated_at is distinct from u.updated_at or i.row_version is distinct from u.row_version) then
    raise exception 'UPGRADE 322: the backfill moved updated_at / row_version (an item would look changed)';
  end if;
end $$;
do $$
declare r record;
begin
  set local session_replication_role = replica;
  for r in select c.conrelid::regclass as tbl, a.attname as col
             from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid = 'public.companies'::regclass loop
    execute format('delete from %s where %I = %L', r.tbl, r.col, 'cacc0000-0000-4000-8000-000000000322');
  end loop;
  delete from public.companies where id = 'cacc0000-0000-4000-8000-000000000322';
  drop table public._upg322;
  set local session_replication_role = origin;
end $$;
