-- checks of 20261110000000_suppliers.before.sql (T146), then clean up
do $$
declare hd uuid; abc uuid;
begin
  if (select count(*) from public.suppliers where company_id = 'c1460000-0000-4000-8000-0000000000c1') <> 2 then
    raise exception 'FAILED: T146 two suppliers (Home Depot in three spellings, ABC); none for a deleted item or a blank vendor';
  end if;
  select id into hd from public.suppliers where company_id = 'c1460000-0000-4000-8000-0000000000c1' and lower(name) = 'home depot';
  select id into abc from public.suppliers where company_id = 'c1460000-0000-4000-8000-0000000000c1' and name = 'ABC Supply';
  if hd is null or abc is null then raise exception 'FAILED: T146 the supplier names'; end if;
  if (select purchase_tax_bps from public.suppliers where id = hd) is distinct from 1025 then
    raise exception 'FAILED: T146 the tax of Home Depot is the most common of its items (10.25%%)';
  end if;
  if (select purchase_tax_bps from public.suppliers where id = abc) is not null then raise exception 'FAILED: T146 no tax known — null'; end if;
  if (select count(*) from public.catalog_items where supplier_id = hd) <> 3
     or (select supplier_id from public.catalog_items where id = 'c1460000-0000-4000-8000-000000000004') is distinct from abc
     or (select supplier_id from public.catalog_items where id = 'c1460000-0000-4000-8000-000000000005') is not null
     or (select supplier_id from public.catalog_items where id = 'c1460000-0000-4000-8000-000000000006') is not null then
    raise exception 'FAILED: T146 the items point to their supplier';
  end if;
  if (select vendor from public.catalog_items where id = 'c1460000-0000-4000-8000-000000000002') <> ' home depot ' then
    raise exception 'FAILED: T146 the vendor text stays as it was (old phones)';
  end if;
  if (select count(*) from public.catalog_cost_history where company_id = 'c1460000-0000-4000-8000-0000000000c1' and source = 'initial' and supplier_id = hd) <> 3 then
    raise exception 'FAILED: T146 the history starts with the three stored costs';
  end if;
end $$;
delete from public.catalog_items where company_id = 'c1460000-0000-4000-8000-0000000000c1';
delete from public.suppliers where company_id = 'c1460000-0000-4000-8000-0000000000c1';
\echo 'T146 upgrade: vendor texts became suppliers ok'
