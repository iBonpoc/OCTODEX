-- Before #1807 (53-0б): a material with a cost and a hand price off the formula ($10.00 × 1.1025 × 1.10 = $12.13, the
-- price says $15.00), a material without a cost, a labor item with a cost.
insert into public.companies (id, name) values ('cacc0000-0000-4000-8000-000000000322', 'Upgrade Server Price Co');
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents) values
  ('cacc0000-0000-4000-8000-0000000003c1', 'cacc0000-0000-4000-8000-000000000322', 'material', 'UPG322 off formula', 'ea', 1500),
  ('cacc0000-0000-4000-8000-0000000003c2', 'cacc0000-0000-4000-8000-000000000322', 'material', 'UPG322 no cost', 'ea', 700),
  ('cacc0000-0000-4000-8000-0000000003c3', 'cacc0000-0000-4000-8000-000000000322', 'labor', 'UPG322 labor', 'hr', 9000);
insert into public.catalog_item_costs (item_id, company_id, unit_cost_cents, vendor_tax_bps, markup_bps) values
  ('cacc0000-0000-4000-8000-0000000003c1', 'cacc0000-0000-4000-8000-000000000322', 1000, 1025, 1000),
  ('cacc0000-0000-4000-8000-0000000003c3', 'cacc0000-0000-4000-8000-000000000322', 4500, 0, 500);
-- the rows' stamps before the migration (the backfill must not move them)
create table if not exists public._upg322 as
  select id, updated_at, row_version from public.catalog_items where company_id = 'cacc0000-0000-4000-8000-000000000322';
