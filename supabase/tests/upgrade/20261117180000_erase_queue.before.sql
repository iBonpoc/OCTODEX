-- Before 50-2: a company with an owner and a tech who has a title, a HIS number, and a line of the cost history written by him.
insert into auth.users (id, email, raw_user_meta_data) values
  ('cf520000-0000-0000-0000-0000000000aa', 'upgrade502o@x.test', '{"full_name":"Upgrade Owner 502"}'),
  ('cf520000-0000-0000-0000-0000000000bb', 'upgrade502t@x.test', '{"full_name":"Upgrade Tech 502"}');
insert into public.companies (id, name) values ('cf520000-0000-0000-0000-000000000001', 'Upgrade Queue Co');
insert into public.memberships (id, company_id, user_id, role, status, title, his_registration_number) values
  ('cf520000-0000-0000-0000-0000000000a1', 'cf520000-0000-0000-0000-000000000001', 'cf520000-0000-0000-0000-0000000000aa', 'owner', 'active', null, null),
  ('cf520000-0000-0000-0000-0000000000b1', 'cf520000-0000-0000-0000-000000000001', 'cf520000-0000-0000-0000-0000000000bb', 'tech', 'active', 'Upgrade title', 'HIS-502');
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, is_placeholder_price)
  values ('cf520000-0000-0000-0000-0000000000c1', 'cf520000-0000-0000-0000-000000000001', 'material', 'Upgrade item', 'ea', 100, false);
insert into public.catalog_cost_history (company_id, item_id, unit_cost_cents, source, by)
  values ('cf520000-0000-0000-0000-000000000001', 'cf520000-0000-0000-0000-0000000000c1', 50, 'manual', 'cf520000-0000-0000-0000-0000000000bb');
