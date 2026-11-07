-- before 20261107050000: companies with time zones the server could not use (or used wrong)
insert into public.companies (id, name, timezone, phone) values
  ('c7500000-0000-4000-8000-000000000001', 'Upgrade 050000 case', 'america/chicago', '+13235550751'),
  ('c7500000-0000-4000-8000-000000000002', 'Upgrade 050000 PST', 'PST', '+13235550752'),
  ('c7500000-0000-4000-8000-000000000003', 'Upgrade 050000 empty', '', '+13235550753'),
  ('c7500000-0000-4000-8000-000000000004', 'Upgrade 050000 bad', 'Bad/Zone', '+13235550754'),
  ('c7500000-0000-4000-8000-000000000005', 'Upgrade 050000 EST', 'EST', '+13235550755'),
  ('c7500000-0000-4000-8000-000000000006', 'Upgrade 050000 good', 'America/Denver', '+13235550756');
