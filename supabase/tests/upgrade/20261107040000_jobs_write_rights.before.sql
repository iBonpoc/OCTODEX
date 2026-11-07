-- Old shape before 17-job §12.1: a job the old app inserted itself (lead.book «Estimate visit») and a signed estimate's job
-- with its deposit invoice, unpaid — the deposit an old queue still has to send.
insert into public.companies (id, name) values ('cf740000-0000-0000-0000-000000000001', 'Upgrade Jobs Co');
insert into public.customers (id, company_id, display_name) values ('cf740000-0000-0000-0000-0000000000c1', 'cf740000-0000-0000-0000-000000000001', 'Upgrade Client');
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
  ('cf740000-0000-0000-0000-0000000000d1', 'cf740000-0000-0000-0000-000000000001', 'cf740000-0000-0000-0000-0000000000c1', '74 Old St', 'Pasadena');
insert into public.estimates (id, company_id, customer_id, property_id, title) values
  ('cf740000-0000-0000-0000-0000000000e1', 'cf740000-0000-0000-0000-000000000001', 'cf740000-0000-0000-0000-0000000000c1', 'cf740000-0000-0000-0000-0000000000d1', 'Upgrade signed');
insert into public.jobs (id, company_id, number, title, customer_id, property_id, type) values
  ('cf740000-0000-0000-0000-0000000000f1', 'cf740000-0000-0000-0000-000000000001', '', 'Estimate visit', 'cf740000-0000-0000-0000-0000000000c1', 'cf740000-0000-0000-0000-0000000000d1', 'inspection');
insert into public.jobs (id, company_id, number, title, customer_id, property_id, estimate_id) values
  ('cf740000-0000-0000-0000-0000000000f2', 'cf740000-0000-0000-0000-000000000001', '', 'Upgrade signed', 'cf740000-0000-0000-0000-0000000000c1', 'cf740000-0000-0000-0000-0000000000d1', 'cf740000-0000-0000-0000-0000000000e1');
insert into public.invoices (id, company_id, number, customer_id, job_id, kind, status, title, subtotal_cents, total_cents, sent_at) values
  ('cf740000-0000-0000-0000-0000000000a1', 'cf740000-0000-0000-0000-000000000001', '', 'cf740000-0000-0000-0000-0000000000c1', 'cf740000-0000-0000-0000-0000000000f2', 'deposit', 'sent', 'Deposit', 2500, 2500, now());
