-- Before wave 7а-2a: a company with its owner and a tech, a task assigned to the tech.
insert into auth.users (id, email, raw_user_meta_data) values
  ('cf500000-0000-0000-0000-0000000000aa', 'upgrade50o@x.test', '{"full_name":"Upgrade Owner 50"}'),
  ('cf500000-0000-0000-0000-0000000000bb', 'upgrade50t@x.test', '{"full_name":"Upgrade Tech 50"}');
insert into public.companies (id, name) values ('cf500000-0000-0000-0000-000000000001', 'Upgrade Delete Co');
insert into public.memberships (company_id, user_id, role, status) values
  ('cf500000-0000-0000-0000-000000000001', 'cf500000-0000-0000-0000-0000000000aa', 'owner', 'active'),
  ('cf500000-0000-0000-0000-000000000001', 'cf500000-0000-0000-0000-0000000000bb', 'tech', 'active');
