-- After #2227 PR1: T447 — the old items are as they were (the migration rewrites nothing: no variants, the same price, sku,
-- attributes); the old build's edit of a sku still works; the new write of a variant works on an old item.
do $$
begin
  if exists (select 1 from public.catalog_items where company_id = 'cf227000-0000-0000-0000-000000000001' and variant_skus is not null) then
    raise exception 'FAILED T447 upgrade 20261117620000: the migration wrote variants of old items';
  end if;
  if (select string_agg(supplier_sku || ':' || unit_price_cents || ':' || (attributes ->> 'color'), ',' order by id)
        from public.catalog_items where company_id = 'cf227000-0000-0000-0000-000000000001') is distinct from 'W-1:800:white,B-1:800:brown' then
    raise exception 'FAILED T447 upgrade 20261117620000: an old item changed';
  end if;
end $$;
select set_config('request.jwt.claim.sub', 'cf227000-0000-0000-0000-0000000000aa', false);
set role authenticated;
update public.catalog_items set supplier_sku = 'B-2' where id = 'cf227000-0000-0000-0000-0000000000c2';
select public.catalog_set_variant('cf227000-0000-0000-0000-0000000000c1', 'color', 'white', '{"sku":"W-1"}');
reset role;
reset request.jwt.claim.sub;
do $$
begin
  if (select supplier_sku from public.catalog_items where id = 'cf227000-0000-0000-0000-0000000000c2') is distinct from 'B-2' then
    raise exception 'FAILED T447 upgrade 20261117620000: an old build''s sku edit does not work';
  end if;
  if (select variant_skus from public.catalog_items where id = 'cf227000-0000-0000-0000-0000000000c1') is distinct from '{"color":{"white":{"sku":"W-1"}}}'::jsonb then
    raise exception 'FAILED T447 upgrade 20261117620000: the variant write on an old item';
  end if;
end $$;
-- clean up: the main tests count users and companies
delete from public.catalog_price_history where company_id = 'cf227000-0000-0000-0000-000000000001';
delete from public.catalog_items where company_id = 'cf227000-0000-0000-0000-000000000001';
delete from public.memberships where company_id = 'cf227000-0000-0000-0000-000000000001';
delete from auth.users where id = 'cf227000-0000-0000-0000-0000000000aa';
