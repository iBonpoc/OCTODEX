-- Refunds (spec 35 §4в, 20д) on a database that already has a payment refunded the old way: refunded_cents set directly,
-- no refunds rows (the old guard let an owner do it). After the migration it still takes a new refund (rule 15).
insert into public.companies (id, name) values ('c1330000-0000-4000-8000-0000000000c1', 'T133 upgrade co');
insert into auth.users (id, email, raw_user_meta_data) values ('c1330000-0000-4000-8000-0000000000a1', 'owner133u@a.test', '{"full_name":"Uma Owner"}');
insert into public.memberships (company_id, user_id, role, status) values ('c1330000-0000-4000-8000-0000000000c1', 'c1330000-0000-4000-8000-0000000000a1', 'owner', 'active');
insert into public.customers (id, company_id, display_name) values ('c1330000-0000-4000-8000-0000000000d1', 'c1330000-0000-4000-8000-0000000000c1', 'T133 upgrade client');
insert into public.invoices (id, company_id, number, customer_id, kind, status, title, subtotal_cents, total_cents, sent_at) values
  ('c1330000-0000-4000-8000-0000000000e1', 'c1330000-0000-4000-8000-0000000000c1', 'U133-1', 'c1330000-0000-4000-8000-0000000000d1', 'standalone', 'sent', 'old', 2000, 2000, now());
insert into public.payments (id, company_id, invoice_id, customer_id, method, amount_cents, status, idempotency_key) values
  ('c1330000-0000-4000-8000-0000000000f1', 'c1330000-0000-4000-8000-0000000000c1', 'c1330000-0000-4000-8000-0000000000e1', 'c1330000-0000-4000-8000-0000000000d1', 'cash', 2000, 'succeeded', 'u133-old');
update public.payments set refunded_cents = 500, status = 'partially_refunded' where id = 'c1330000-0000-4000-8000-0000000000f1';
