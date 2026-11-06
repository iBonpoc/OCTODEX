-- Old shape before 7б-2: sharing switched on through set_share_location (110000), without the notice.
insert into auth.users (id, email, raw_user_meta_data) values ('cf560000-0000-0000-0000-0000000000aa', 'upgrade56@x.test', '{"full_name":"Upgrade Sharer"}');
insert into public.companies (id, name) values ('cf560000-0000-0000-0000-000000000001', 'Upgrade Location Co');
insert into public.memberships (company_id, user_id, role, status, share_location) values
  ('cf560000-0000-0000-0000-000000000001', 'cf560000-0000-0000-0000-0000000000aa', 'tech', 'active', true);
