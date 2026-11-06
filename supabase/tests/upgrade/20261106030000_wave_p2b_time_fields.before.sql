-- Old shape right before wave П-2b: a task with only a due time.
insert into public.companies (id, name) values ('cf420000-0000-0000-0000-000000000001', 'Upgrade Time Co');
insert into public.customers (id, company_id, display_name) values ('cf421000-0000-0000-0000-000000000001', 'cf420000-0000-0000-0000-000000000001', 'Upgrade time client');
insert into public.tasks (id, company_id, subject_type, subject_id, title, due_at) values
  ('cf422000-0000-0000-0000-000000000001', 'cf420000-0000-0000-0000-000000000001', 'customer', 'cf421000-0000-0000-0000-000000000001', 'Old task', now() + interval '1 day');
