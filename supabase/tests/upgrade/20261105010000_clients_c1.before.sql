-- Old-shape clients right before C1: no numbers, one phone / email on the contact row, no tags.
insert into public.companies (id, name) values ('cf200000-0000-0000-0000-000000000000', 'Upgrade Clients Co');
insert into public.customers (id, company_id, display_name, created_at) values
  ('cf210000-0000-0000-0000-000000000001', 'cf200000-0000-0000-0000-000000000000', 'Older client', '2026-01-02T10:00:00Z'),
  ('cf210000-0000-0000-0000-000000000002', 'cf200000-0000-0000-0000-000000000000', 'Newer client', '2026-02-03T10:00:00Z');
insert into public.contacts (id, company_id, customer_id, name, phone, email, is_primary) values
  ('cf220000-0000-0000-0000-000000000001', 'cf200000-0000-0000-0000-000000000000', 'cf210000-0000-0000-0000-000000000001', 'Older client', '(818) 555-0401', 'older@example.com', true),
  ('cf220000-0000-0000-0000-000000000002', 'cf200000-0000-0000-0000-000000000000', 'cf210000-0000-0000-0000-000000000002', 'Newer client', '(818) 555-0402', null, true);
alter table public.customers disable trigger user;
update public.customers set updated_at = '2026-03-01T00:00:00Z' where company_id = 'cf200000-0000-0000-0000-000000000000';
alter table public.customers enable trigger user;
