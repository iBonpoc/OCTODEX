-- After #1834: the old data is as it was (the migration rewrites nothing), the first change of the supplier's rate brings the
-- item to the supplier's rate and writes history with the new source; the history that was there is untouched.
do $$
begin
  if (select vendor_tax_bps from public.catalog_item_costs where item_id = 'cf5c0000-0000-0000-0000-0000000000c1') is distinct from 500 then
    raise exception 'FAILED upgrade 20261117350000: the migration changed the rate of an old item';
  end if;
end $$;
select set_config('request.jwt.claim.sub', 'cf5c0000-0000-0000-0000-0000000000aa', false);
set role authenticated;
select public.supplier_set_tax('cf5c0000-0000-0000-0000-0000000000d1', 900, 825);
reset role;
reset request.jwt.claim.sub;
do $$
begin
  if (select vendor_tax_bps from public.catalog_item_costs where item_id = 'cf5c0000-0000-0000-0000-0000000000c1') is distinct from 900 then
    raise exception 'FAILED upgrade 20261117350000: the old item did not follow the supplier';
  end if;
  if not exists (select 1 from public.catalog_cost_history where item_id = 'cf5c0000-0000-0000-0000-0000000000c1' and source = 'supplier_tax' and vendor_tax_bps = 900) then
    raise exception 'FAILED upgrade 20261117350000: no history row of the supplier tax';
  end if;
end $$;
-- clean up: the main tests count users and companies
delete from public.catalog_cost_history where company_id = 'cf5c0000-0000-0000-0000-000000000001';
delete from public.catalog_item_costs where company_id = 'cf5c0000-0000-0000-0000-000000000001';
delete from public.catalog_price_history where company_id = 'cf5c0000-0000-0000-0000-000000000001';
delete from public.catalog_items where company_id = 'cf5c0000-0000-0000-0000-000000000001';
delete from public.suppliers where company_id = 'cf5c0000-0000-0000-0000-000000000001';
delete from public.memberships where company_id = 'cf5c0000-0000-0000-0000-000000000001';
delete from auth.users where id = 'cf5c0000-0000-0000-0000-0000000000aa';
