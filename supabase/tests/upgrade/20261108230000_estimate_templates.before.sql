-- Old-shape data right before E3a: an estimate whose version already says «from a template» (core allowed
-- source = 'template' and any template_id) — the new used_count trigger must not trip over it.
insert into public.companies (id, name, timezone) values ('cfe30000-0000-0000-0000-000000000000', 'Upgrade Templates Co', 'America/Los_Angeles');
insert into public.customers (id, company_id, display_name) values ('cfe30000-0000-0000-0000-000000000001', 'cfe30000-0000-0000-0000-000000000000', 'Old Client');
insert into public.properties (id, company_id, customer_id, address_line1, address_city)
values ('cfe30000-0000-0000-0000-000000000002', 'cfe30000-0000-0000-0000-000000000000', 'cfe30000-0000-0000-0000-000000000001', '1 Old St', 'Pasadena');
insert into public.estimates (id, company_id, number, customer_id, property_id, title) values
  ('cfe30000-0000-0000-0000-000000000003', 'cfe30000-0000-0000-0000-000000000000', '', 'cfe30000-0000-0000-0000-000000000001', 'cfe30000-0000-0000-0000-000000000002', 'Old from template');
insert into public.estimate_versions (id, company_id, estimate_id, version_no, source, template_id) values
  ('cfe30000-0000-0000-0000-000000000004', 'cfe30000-0000-0000-0000-000000000000', 'cfe30000-0000-0000-0000-000000000003', 1, 'template', 'cfe30000-0000-0000-0000-0000000000ff');
