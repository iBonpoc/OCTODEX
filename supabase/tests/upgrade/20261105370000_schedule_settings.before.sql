-- Old shape right before П4a: no schedule_settings column; business_hours as core allowed it (null, or anything jsonb).
insert into public.companies (id, name, business_hours) values
  ('cfc00000-0000-0000-0000-000000000001', 'Upgrade Hours Null Co', null),
  ('cfc00000-0000-0000-0000-000000000002', 'Upgrade Hours Junk Co', '{"monday": "8-6"}'),
  ('cfc00000-0000-0000-0000-000000000003', 'Upgrade Hours Good Co', '{"mon": [420, 960], "sun": null}');
