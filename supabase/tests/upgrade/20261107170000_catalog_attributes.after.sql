-- every old row gets {} and no purchase unit; nothing else changed; the checks are validated (not left NOT VALID)
do $$
begin
  if (select count(*) from public.catalog_items where company_id = 'c9100000-0000-4000-8000-000000000001'
        and attributes = '{}'::jsonb and purchase_unit is null and pack_size is null) <> 3
     or (select components->0->>'qty' from public.catalog_items where id = 'c9100000-0000-4000-8000-0000000000a2') <> '2'
     or exists (select 1 from pg_constraint where conname in ('catalog_items_attributes_check', 'catalog_items_purchase_check') and not convalidated)
     or (select count(*) from pg_constraint where conname in ('catalog_items_attributes_check', 'catalog_items_purchase_check')) <> 2 then
    raise exception 'FAILED: C3 upgrade — old items get {} and no purchase unit, checks validated';
  end if;
end $$;
delete from public.catalog_items where company_id = 'c9100000-0000-4000-8000-000000000001';
\echo 'C3 upgrade: old price-list items get empty properties, checks validated ok'
