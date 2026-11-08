-- SUP1 (spec 36 §5) on a database that already has items with a vendor text: two spellings of one supplier, one other,
-- one item without a vendor, a deleted item. After the migration: one supplier per name (case- and space-insensitive),
-- its tax the most common of its items, every item points to it, the history starts with what was stored (T146).
insert into public.companies (id, name) values ('c1460000-0000-4000-8000-0000000000c1', 'T146 upgrade co');
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, vendor, unit_cost_cents, vendor_tax_bps) values
  ('c1460000-0000-4000-8000-000000000001', 'c1460000-0000-4000-8000-0000000000c1', 'material', 'U146 a (test)', 'ea', 0, 'Home Depot', 1000, 1025),
  ('c1460000-0000-4000-8000-000000000002', 'c1460000-0000-4000-8000-0000000000c1', 'material', 'U146 b (test)', 'ea', 0, ' home depot ', 2000, 1025),
  ('c1460000-0000-4000-8000-000000000003', 'c1460000-0000-4000-8000-0000000000c1', 'material', 'U146 c (test)', 'ea', 0, 'HOME DEPOT', 3000, 0),
  ('c1460000-0000-4000-8000-000000000004', 'c1460000-0000-4000-8000-0000000000c1', 'material', 'U146 d (test)', 'ea', 0, 'ABC Supply', null, null),
  ('c1460000-0000-4000-8000-000000000005', 'c1460000-0000-4000-8000-0000000000c1', 'service', 'U146 e (test)', 'ea', 100, null, null, null),
  ('c1460000-0000-4000-8000-000000000006', 'c1460000-0000-4000-8000-0000000000c1', 'material', 'U146 f (test)', 'ea', 0, 'Gone Supply', null, null);
update public.catalog_items set deleted_at = now() where id = 'c1460000-0000-4000-8000-000000000006';
