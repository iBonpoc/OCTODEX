-- Old shape right before t14 (jobs insert guard): a job already «scheduled», at a property of another client of its company.
insert into public.companies (id, name) values ('cf470000-0000-0000-0000-000000000001', 'Upgrade Jobs Guard Co');
insert into public.customers (id, company_id, display_name) values
  ('cf471000-0000-0000-0000-000000000001', 'cf470000-0000-0000-0000-000000000001', 'Upgrade guard client'),
  ('cf471000-0000-0000-0000-000000000002', 'cf470000-0000-0000-0000-000000000001', 'Upgrade guard owner');
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
  ('cf472000-0000-0000-0000-000000000001', 'cf470000-0000-0000-0000-000000000001', 'cf471000-0000-0000-0000-000000000002', '46 Old St', 'Austin');
insert into public.jobs (id, company_id, title, customer_id, property_id, status) values
  ('cf473000-0000-0000-0000-000000000001', 'cf470000-0000-0000-0000-000000000001', 'Old job', 'cf471000-0000-0000-0000-000000000001', 'cf472000-0000-0000-0000-000000000001', 'scheduled');
