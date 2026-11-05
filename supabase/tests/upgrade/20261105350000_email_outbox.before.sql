-- Old shape right before Почта П1a: a contract already signed by both sides, its client has an email, the company has
-- autoSendSignedCopy on. The migration must not queue a copy for it (no pile of letters for old contracts, 07-email §9.6).
insert into public.companies (id, name, estimate_settings) values
  ('cf350000-0000-0000-0000-000000000001', 'Upgrade Mail Co', '{"autoSendSignedCopy": true}');
insert into public.customers (id, company_id, display_name) values ('cf351000-0000-0000-0000-000000000001', 'cf350000-0000-0000-0000-000000000001', 'Upgrade mail client');
insert into public.contacts (id, company_id, customer_id, name, email, is_primary) values
  ('cf352000-0000-0000-0000-000000000001', 'cf350000-0000-0000-0000-000000000001', 'cf351000-0000-0000-0000-000000000001', 'Upgrade Person', 'old@example.com', true);
update public.customers set primary_contact_id = 'cf352000-0000-0000-0000-000000000001' where id = 'cf351000-0000-0000-0000-000000000001';
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('cf354000-0000-0000-0000-000000000001', 'cf350000-0000-0000-0000-000000000001', 'cf351000-0000-0000-0000-000000000001', '1 Upgrade St', 'Pasadena');
insert into public.estimates (id, company_id, customer_id, property_id, title) values ('cf353000-0000-0000-0000-000000000001', 'cf350000-0000-0000-0000-000000000001', 'cf351000-0000-0000-0000-000000000001', 'cf354000-0000-0000-0000-000000000001', 'Upgrade signed');
-- the state an old signature left (its path through the signing functions is tested in T29–T32)
alter table public.estimates disable trigger user;
update public.estimates set status = 'approved' where id = 'cf353000-0000-0000-0000-000000000001';
alter table public.estimates enable trigger user;
