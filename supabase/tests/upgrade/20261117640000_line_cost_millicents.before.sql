-- Before #1926 PR 2/4: line costs, a tech's kept cost and a template's cost in whole cents. The migration must give each
-- its exact value (cents × 1000) without touching anything else (a sent version's cost too — t40 would refuse a write).
insert into public.companies (id, name) values ('cacc0000-0000-4000-8000-000000000460', 'Upgrade Line Millicents Co');
insert into public.customers (id, company_id, display_name) values
  ('cacc0000-0000-4000-8000-0000000004e9', 'cacc0000-0000-4000-8000-000000000460', 'UPG460 customer');
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
  ('cacc0000-0000-4000-8000-0000000004e8', 'cacc0000-0000-4000-8000-000000000460', 'cacc0000-0000-4000-8000-0000000004e9', '1 Upgrade St', 'Pasadena');
insert into public.estimates (id, company_id, customer_id, property_id, title) values
  ('cacc0000-0000-4000-8000-0000000004e1', 'cacc0000-0000-4000-8000-000000000460', 'cacc0000-0000-4000-8000-0000000004e9', 'cacc0000-0000-4000-8000-0000000004e8', 'UPG460');
insert into public.estimate_versions (id, company_id, estimate_id, version_no) values
  ('cacc0000-0000-4000-8000-0000000004d1', 'cacc0000-0000-4000-8000-000000000460', 'cacc0000-0000-4000-8000-0000000004e1', 1);
insert into public.estimate_options (id, company_id, version_id, name) values
  ('cacc0000-0000-4000-8000-0000000004a1', 'cacc0000-0000-4000-8000-000000000460', 'cacc0000-0000-4000-8000-0000000004d1', 'A');
insert into public.estimate_line_items (id, company_id, option_id, name, quantity, unit_price_cents) values
  ('cacc0000-0000-4000-8000-0000000004b1', 'cacc0000-0000-4000-8000-000000000460', 'cacc0000-0000-4000-8000-0000000004a1', 'UPG460 rivet', 37, 25);
insert into public.estimate_line_costs (line_item_id, company_id, unit_cost_cents) values
  ('cacc0000-0000-4000-8000-0000000004b1', 'cacc0000-0000-4000-8000-000000000460', 23);
insert into public.estimate_line_costs_kept (line_item_id, company_id, version_id, unit_cost_cents, currency) values
  ('cacc0000-0000-4000-8000-0000000004b9', 'cacc0000-0000-4000-8000-000000000460', 'cacc0000-0000-4000-8000-0000000004d1', 7, 'USD');
insert into public.estimate_templates (id, company_id, name, doc) values
  ('cacc0000-0000-4000-8000-0000000004f1', 'cacc0000-0000-4000-8000-000000000460', 'UPG460', '{"options":[{"id":"o1","name":"A","lines":[
  {"id":"l1","name":"Rivet","group":"material","quantity":"1","unit":"ea","unitPriceCents":25,"unitCostCents":23}]}],
 "settings":{"discount":null,"tax":{"enabled":false,"rateBps":0,"groups":{"service":false,"labor":false,"material":false}},"deposit":{"kind":"none"}}}');
-- the version is sent: its cost must still get its exact value (the migration writes without the triggers)
update public.estimate_versions set locked_at = now() where id = 'cacc0000-0000-4000-8000-0000000004d1';
create table if not exists public._upg460 as
  select c.line_item_id, c.updated_at, c.row_version from public.estimate_line_costs c where c.company_id = 'cacc0000-0000-4000-8000-000000000460';
