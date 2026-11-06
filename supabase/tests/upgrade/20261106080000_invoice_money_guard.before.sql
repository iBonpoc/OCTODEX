-- Old shape right before the invoice money guard: a sent invoice, partly paid.
insert into public.companies (id, name) values ('cf530000-0000-0000-0000-000000000001', 'Upgrade Invoice Money Co');
insert into public.customers (id, company_id, display_name) values
  ('cf531000-0000-0000-0000-000000000001', 'cf530000-0000-0000-0000-000000000001', 'Upgrade invoice client');
insert into public.invoices (id, company_id, number, customer_id, kind, status, subtotal_cents, total_cents, sent_at) values
  ('cf532000-0000-0000-0000-000000000001', 'cf530000-0000-0000-0000-000000000001', '', 'cf531000-0000-0000-0000-000000000001', 'standalone', 'sent', 5000, 5000, now());
insert into public.payments (company_id, invoice_id, customer_id, method, amount_cents, status, idempotency_key) values
  ('cf530000-0000-0000-0000-000000000001', 'cf532000-0000-0000-0000-000000000001', 'cf531000-0000-0000-0000-000000000001', 'cash', 2000, 'succeeded', 'upgrade-t53-1');
