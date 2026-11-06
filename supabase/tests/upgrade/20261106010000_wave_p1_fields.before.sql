-- Old shape right before wave П-1: a company with a job (type 'install' by default) and paid notices that carry only
-- the invoice number in payload (as portal_pay_simulated wrote them), plus notices that have no invoice.
insert into public.companies (id, name) values ('cf390000-0000-0000-0000-000000000001', 'Upgrade Fields Co');
insert into public.customers (id, company_id, display_name) values ('cf391000-0000-0000-0000-000000000001', 'cf390000-0000-0000-0000-000000000001', 'Upgrade fields client');
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('cf392000-0000-0000-0000-000000000001', 'cf390000-0000-0000-0000-000000000001', 'cf391000-0000-0000-0000-000000000001', '39 Upgrade St', 'Pasadena');
insert into public.jobs (id, company_id, number, title, customer_id, property_id) values
  ('cf393000-0000-0000-0000-000000000001', 'cf390000-0000-0000-0000-000000000001', '', 'Old job', 'cf391000-0000-0000-0000-000000000001', 'cf392000-0000-0000-0000-000000000001');
insert into public.invoices (id, company_id, customer_id, job_id, kind, total_cents) values
  ('cf394000-0000-0000-0000-000000000001', 'cf390000-0000-0000-0000-000000000001', 'cf391000-0000-0000-0000-000000000001', 'cf393000-0000-0000-0000-000000000001', 'final', 5000);
insert into public.notifications (id, company_id, kind, job_id, payload) values
  ('cf395000-0000-0000-0000-000000000001', 'cf390000-0000-0000-0000-000000000001', 'invoice.paid', 'cf393000-0000-0000-0000-000000000001',
   jsonb_build_object('customer', 'Upgrade fields client', 'number', (select number from public.invoices where id = 'cf394000-0000-0000-0000-000000000001'), 'total', 5000)),
  ('cf395000-0000-0000-0000-000000000002', 'cf390000-0000-0000-0000-000000000001', 'invoice.paid', 'cf393000-0000-0000-0000-000000000001',
   '{"customer": "Upgrade fields client", "number": "INV-9999", "total": 1}'),
  ('cf395000-0000-0000-0000-000000000003', 'cf390000-0000-0000-0000-000000000001', 'estimate.viewed', null,
   jsonb_build_object('number', (select number from public.invoices where id = 'cf394000-0000-0000-0000-000000000001')));
