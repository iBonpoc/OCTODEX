-- Old shape right before wave П-2a: a client and a job with a total the app wrote (no lines, no tax fields yet).
insert into public.companies (id, name) values ('cf410000-0000-0000-0000-000000000001', 'Upgrade Money Co');
insert into public.customers (id, company_id, display_name) values ('cf411000-0000-0000-0000-000000000001', 'cf410000-0000-0000-0000-000000000001', 'Upgrade money client');
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('cf412000-0000-0000-0000-000000000001', 'cf410000-0000-0000-0000-000000000001', 'cf411000-0000-0000-0000-000000000001', '41 Upgrade St', 'Pasadena');
insert into public.jobs (id, company_id, number, title, customer_id, property_id, contract_total_cents) values
  ('cf413000-0000-0000-0000-000000000001', 'cf410000-0000-0000-0000-000000000001', '', 'Old priced job', 'cf411000-0000-0000-0000-000000000001', 'cf412000-0000-0000-0000-000000000001', 42000);
