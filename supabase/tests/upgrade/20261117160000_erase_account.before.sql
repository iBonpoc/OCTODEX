-- Before 50-1: a company with an owner and a tech (the tech may leave), the tech has a private note and an active signature —
-- the old delete_account (one function) is still there.
insert into auth.users (id, email, raw_user_meta_data) values
  ('cf510000-0000-0000-0000-0000000000aa', 'upgrade501o@x.test', '{"full_name":"Upgrade Owner 501"}'),
  ('cf510000-0000-0000-0000-0000000000bb', 'upgrade501t@x.test', '{"full_name":"Upgrade Tech 501"}');
insert into public.companies (id, name) values ('cf510000-0000-0000-0000-000000000001', 'Upgrade Erase Co');
insert into public.memberships (company_id, user_id, role, status) values
  ('cf510000-0000-0000-0000-000000000001', 'cf510000-0000-0000-0000-0000000000aa', 'owner', 'active'),
  ('cf510000-0000-0000-0000-000000000001', 'cf510000-0000-0000-0000-0000000000bb', 'tech', 'active');
insert into public.notes (company_id, subject_type, subject_id, body, visibility, created_by) values
  ('cf510000-0000-0000-0000-000000000001', 'customer', 'cf510000-0000-0000-0000-0000000000c1', 'upgrade 50-1 private note', 'private', 'cf510000-0000-0000-0000-0000000000bb');
