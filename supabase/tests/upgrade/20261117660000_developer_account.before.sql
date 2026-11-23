-- Before the developer flag (#2410): the founder's company (its id only) and another one, both with Gutters whose
-- trial ran out — the migration marks only the founder's.
insert into public.companies (id, name) values
  ('01a1eb73-a746-728b-b42d-8cfcd8eaeae4', 'Upgrade Developer'),
  ('c5400000-0000-4000-8000-0000000000f1', 'Upgrade Not Developer')
on conflict (id) do nothing;
insert into public.company_modules (company_id, module_key, enabled, trial_ends_at, row_version) values
  ('01a1eb73-a746-728b-b42d-8cfcd8eaeae4', 'gutters', true, now() - interval '3 days', 2),
  ('c5400000-0000-4000-8000-0000000000f1', 'gutters', true, now() - interval '3 days', 2);
