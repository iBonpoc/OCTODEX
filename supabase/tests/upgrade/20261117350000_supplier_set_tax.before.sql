-- Before #1834: a company whose supplier has a rate of 8,25 % and an item that still carries ITS OWN rate (5 %, the old copy),
-- with a cost history row written by hand.
insert into auth.users (id, email, raw_user_meta_data) values
  ('cf5c0000-0000-0000-0000-0000000000aa', 'upgrade1834o@x.test', '{"full_name":"Upgrade Owner 1834"}');
insert into public.companies (id, name) values ('cf5c0000-0000-0000-0000-000000000001', 'Upgrade Tax Co');
insert into public.memberships (company_id, user_id, role, status) values
  ('cf5c0000-0000-0000-0000-000000000001', 'cf5c0000-0000-0000-0000-0000000000aa', 'owner', 'active');
insert into public.suppliers (id, company_id, name, purchase_tax_bps) values
  ('cf5c0000-0000-0000-0000-0000000000d1', 'cf5c0000-0000-0000-0000-000000000001', 'Upgrade Supplier', 825);
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, supplier_id) values
  ('cf5c0000-0000-0000-0000-0000000000c1', 'cf5c0000-0000-0000-0000-000000000001', 'material', 'Upgrade tax item', 'ea', 0, 'cf5c0000-0000-0000-0000-0000000000d1');
insert into public.catalog_item_costs (item_id, company_id, unit_cost_cents, vendor_tax_bps, markup_bps) values
  ('cf5c0000-0000-0000-0000-0000000000c1', 'cf5c0000-0000-0000-0000-000000000001', 1000, 500, 3000);
