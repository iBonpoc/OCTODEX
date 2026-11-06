-- Before wave 7а-1: a person already in a company, who never saw a consent screen.
insert into auth.users (id, email, raw_user_meta_data) values ('cf490000-0000-0000-0000-0000000000aa', 'upgrade49@x.test', '{"full_name":"Upgrade Owner"}');
insert into public.companies (id, name) values ('cf490000-0000-0000-0000-000000000001', 'Upgrade Legal Co');
insert into public.memberships (company_id, user_id, role, status) values
  ('cf490000-0000-0000-0000-000000000001', 'cf490000-0000-0000-0000-0000000000aa', 'owner', 'active');
