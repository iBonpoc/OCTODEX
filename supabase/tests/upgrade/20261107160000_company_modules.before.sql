-- C1 on a database that already has companies: an object, an empty object and a non-object in gutter_settings
insert into public.companies (id, name, gutter_settings) values
  ('c9000000-0000-4000-8000-000000000001', 'T90 upgrade object', '{"coilWastePct":"0.07"}'),
  ('c9000000-0000-4000-8000-000000000002', 'T90 upgrade empty', '{}'),
  ('c9000000-0000-4000-8000-000000000003', 'T90 upgrade array', '[1,2]');
