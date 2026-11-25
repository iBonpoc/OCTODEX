-- Before the trial extension (founder 18.11): four companies with Gutters —
--   e1 switched on, the 7-day trial ran out a week ago, never paid (the founder's case);
--   e2 switched off, its trial ran out (not touched);
--   e3 switched on and paid (not touched);
--   e4 switched on, its trial still has 60 days (not shortened);
--   e5 switched on, its trial still has 6 days (→ 30 from today);
--   e6 switched on, no trial end at all (→ 30 from today);
--   e7 switched on, its payment ran out yesterday (→ 30 from today, paid_until kept).
insert into public.companies (id, name) values
  ('c5400000-0000-4000-8000-0000000000e1', 'Upgrade Trial Over'),
  ('c5400000-0000-4000-8000-0000000000e2', 'Upgrade Trial Off'),
  ('c5400000-0000-4000-8000-0000000000e3', 'Upgrade Trial Paid'),
  ('c5400000-0000-4000-8000-0000000000e4', 'Upgrade Trial Long'),
  ('c5400000-0000-4000-8000-0000000000e5', 'Upgrade Trial Short'),
  ('c5400000-0000-4000-8000-0000000000e6', 'Upgrade Trial None'),
  ('c5400000-0000-4000-8000-0000000000e7', 'Upgrade Paid Over');
insert into public.company_modules (company_id, module_key, enabled, trial_ends_at, paid_until, row_version) values
  ('c5400000-0000-4000-8000-0000000000e1', 'gutters', true,  now() - interval '7 days', null, 3),
  ('c5400000-0000-4000-8000-0000000000e2', 'gutters', false, now() - interval '7 days', null, 2),
  ('c5400000-0000-4000-8000-0000000000e3', 'gutters', true,  now() - interval '7 days', now() + interval '10 days', 1),
  ('c5400000-0000-4000-8000-0000000000e4', 'gutters', true,  now() + interval '60 days', null, 1),
  ('c5400000-0000-4000-8000-0000000000e5', 'gutters', true,  now() + interval '6 days', null, 1),
  ('c5400000-0000-4000-8000-0000000000e6', 'gutters', true,  null, null, 1),
  ('c5400000-0000-4000-8000-0000000000e7', 'gutters', true,  now() - interval '40 days', now() - interval '1 day', 1);
