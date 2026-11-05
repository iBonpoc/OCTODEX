-- Old-shape data right before E2a (company signature): a tech and a subcontractor without the right to sign
-- (the old default), an estimate already sent with no "valid until", one still a draft.
insert into public.companies (id, name, timezone) values ('cf500000-0000-0000-0000-000000000000', 'Upgrade Countersign Co', 'America/Los_Angeles');
insert into auth.users (id, email, raw_user_meta_data) values
  ('cf510000-0000-0000-0000-000000000001', 'tech@upgrade.test', '{"full_name":"Old Tech"}'),
  ('cf510000-0000-0000-0000-000000000002', 'sub@upgrade.test', '{"full_name":"Old Sub"}');
insert into public.memberships (company_id, user_id, role, status, can_sign_contracts) values
  ('cf500000-0000-0000-0000-000000000000', 'cf510000-0000-0000-0000-000000000001', 'tech', 'active', false),
  ('cf500000-0000-0000-0000-000000000000', 'cf510000-0000-0000-0000-000000000002', 'subcontractor', 'active', true);
insert into public.customers (id, company_id, display_name) values ('cf520000-0000-0000-0000-000000000001', 'cf500000-0000-0000-0000-000000000000', 'Old Client');
insert into public.properties (id, company_id, customer_id, address_line1, address_city)
values ('cf530000-0000-0000-0000-000000000001', 'cf500000-0000-0000-0000-000000000000', 'cf520000-0000-0000-0000-000000000001', '1 Old St', 'Pasadena');
insert into public.estimates (id, company_id, number, customer_id, property_id, title, status) values
  ('cf540000-0000-0000-0000-000000000001', 'cf500000-0000-0000-0000-000000000000', '', 'cf520000-0000-0000-0000-000000000001', 'cf530000-0000-0000-0000-000000000001', 'Sent before E2a', 'draft'),
  ('cf540000-0000-0000-0000-000000000002', 'cf500000-0000-0000-0000-000000000000', '', 'cf520000-0000-0000-0000-000000000001', 'cf530000-0000-0000-0000-000000000001', 'Still a draft', 'draft');
update public.estimates set status = 'sent' where id = 'cf540000-0000-0000-0000-000000000001';
