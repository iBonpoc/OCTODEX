-- Before #2227 (variants): a company with per-colour gutter items in one price group (the founder's case) — white and brown,
-- each with its own supplier sku.
insert into auth.users (id, email, raw_user_meta_data) values
  ('cf227000-0000-0000-0000-0000000000aa', 'upgrade2227o@x.test', '{"full_name":"Upgrade Owner 2227"}');
insert into public.companies (id, name) values ('cf227000-0000-0000-0000-000000000001', 'Upgrade Variants Co');
insert into public.memberships (company_id, user_id, role, status) values
  ('cf227000-0000-0000-0000-000000000001', 'cf227000-0000-0000-0000-0000000000aa', 'owner', 'active');
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, supplier_sku, attributes) values
  ('cf227000-0000-0000-0000-0000000000c1', 'cf227000-0000-0000-0000-000000000001', 'material', 'Gutter · White', 'ft', 800, 'W-1',
   '{"part":"gutter","color":"white","priceGroup":"gutters:v1:upgrade2227aaaa"}'),
  ('cf227000-0000-0000-0000-0000000000c2', 'cf227000-0000-0000-0000-000000000001', 'material', 'Gutter · Brown', 'ft', 800, 'B-1',
   '{"part":"gutter","color":"brown","priceGroup":"gutters:v1:upgrade2227aaaa"}');
