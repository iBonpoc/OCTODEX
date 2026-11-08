-- Old-shape data right before «the tech does not see our costs» (rule 15): an item with cost and markup, an item
-- without, a draft version and a SENT (locked) version with totals.marginPct, a lead with an old cost copied to
-- lead_costs, a source with a default cost.
insert into public.companies (id, name) values ('c1300000-0000-4000-8000-000000000001', 'T99 upgrade co');
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, unit_cost_cents, vendor_tax_bps, markup_bps) values
  ('c1300000-0000-4000-8000-0000000000a1', 'c1300000-0000-4000-8000-000000000001', 'material', 'T99 old item (test)', 'ft', 1213, 1000, 1025, 1000),
  ('c1300000-0000-4000-8000-0000000000a2', 'c1300000-0000-4000-8000-000000000001', 'labor', 'T99 no cost (test)', 'hr', 5000, null, null, null);
insert into public.customers (id, company_id, display_name) values ('c1300000-0000-4000-8000-0000000000c1', 'c1300000-0000-4000-8000-000000000001', 'T99 client');
insert into public.properties (id, company_id, customer_id, address_line1, address_city)
  values ('c1300000-0000-4000-8000-0000000000d1', 'c1300000-0000-4000-8000-000000000001', 'c1300000-0000-4000-8000-0000000000c1', '1 Elm', 'Pasadena');
insert into public.estimates (id, company_id, number, customer_id, property_id, title) values
  ('c1300000-0000-4000-8000-0000000000e1', 'c1300000-0000-4000-8000-000000000001', 'T99-1', 'c1300000-0000-4000-8000-0000000000c1', 'c1300000-0000-4000-8000-0000000000d1', 'T99');
insert into public.estimate_versions (id, company_id, estimate_id, version_no, totals, calc_inputs) values
  ('c1300000-0000-4000-8000-0000000000f1', 'c1300000-0000-4000-8000-000000000001', 'c1300000-0000-4000-8000-0000000000e1', 1,
   '{"total": 100000, "deposit": 10000, "marginPct": "41.2"}', '{"options":[]}'),
  ('c1300000-0000-4000-8000-0000000000f2', 'c1300000-0000-4000-8000-000000000001', 'c1300000-0000-4000-8000-0000000000e1', 2,
   '{"total": 90000, "deposit": 9000, "marginPct": "38.5"}', '{"options":[]}');
update public.estimate_versions set locked_at = now(), sent_at = now() where id = 'c1300000-0000-4000-8000-0000000000f2';
insert into public.leads (id, company_id, source_id, contact_name, phone, cost_cents)
select 'c1300000-0000-4000-8000-0000000000b1', 'c1300000-0000-4000-8000-000000000001', s.id, 'T99 lead', '(818) 555-0399', 4500
  from public.lead_sources s where s.company_id = 'c1300000-0000-4000-8000-000000000001' order by position, name limit 1;
insert into public.lead_costs (lead_id, company_id, cost_cents) values ('c1300000-0000-4000-8000-0000000000b1', 'c1300000-0000-4000-8000-000000000001', 4500);
update public.lead_sources set default_cost_cents = 3000 where company_id = 'c1300000-0000-4000-8000-000000000001' and name = 'Thumbtack';
