-- After #1926: every stored cost has its exact value = cents × 1000 (the history too); an empty cost stays empty; nothing
-- else moved — no stamp, no price (the off-formula one included), no history row (the backfill ran without the triggers).
do $$
declare bad text;
begin
  select string_agg(format('%s: %s / %s', c.item_id, c.unit_cost_cents, c.unit_cost_millicents), '; ') into bad
    from public.catalog_item_costs c
   where c.company_id = 'cacc0000-0000-4000-8000-000000000450'
     and c.unit_cost_millicents is distinct from c.unit_cost_cents * 1000;
  if bad is not null then raise exception 'UPG450 the exact cost is not cents × 1000: %', bad; end if;
  if exists (select 1 from public.catalog_cost_history h where h.unit_cost_cents is not null and h.unit_cost_millicents is distinct from h.unit_cost_cents * 1000) then
    raise exception 'UPG450 a history row without its exact cost';
  end if;
  if (select unit_cost_millicents from public.catalog_item_costs where item_id = 'cacc0000-0000-4000-8000-0000000004c2') is not null then
    raise exception 'UPG450 an empty cost got a value';
  end if;
  select string_agg(u.id::text, ', ') into bad
    from public._upg450 u join public.catalog_items i on i.id = u.id
    left join public.catalog_item_costs c on c.item_id = u.id
   where i.updated_at is distinct from u.updated_at or i.row_version is distinct from u.row_version
      or i.unit_price_cents is distinct from u.unit_price_cents or c.updated_at is distinct from u.cost_at
      or (select count(*) from public.catalog_cost_history h where h.item_id = u.id) <> u.hist;
  if bad is not null then raise exception 'UPG450 the migration moved a row: %', bad; end if;
  -- after the migration the off-formula price stays until the item is saved, then counts from the exact cost
  if (select unit_price_cents from public.catalog_items where id = 'cacc0000-0000-4000-8000-0000000004c3') <> 1500 then
    raise exception 'UPG450 the off-formula price was rewritten by the migration';
  end if;
end $$;
\echo 'UPG450 the stored costs got their exact value, nothing else moved'
do $$
declare r record;
begin
  set local session_replication_role = replica;
  for r in select c.conrelid::regclass as tbl, a.attname as col
             from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid = 'public.companies'::regclass loop
    execute format('delete from %s where %I = %L', r.tbl, r.col, 'cacc0000-0000-4000-8000-000000000450');
  end loop;
  delete from public.companies where id = 'cacc0000-0000-4000-8000-000000000450';
  drop table public._upg450;
  set local session_replication_role = origin;
end $$;
