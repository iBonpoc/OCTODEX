-- C3 on a database that already has price-list items (rule 15): an old item, a kit, a removed one
insert into public.companies (id, name) values ('c9100000-0000-4000-8000-000000000001', 'T91 upgrade co');
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, components, deleted_at) values
  ('c9100000-0000-4000-8000-0000000000a1', 'c9100000-0000-4000-8000-000000000001', 'material', 'T91 old item', 'ft', 1000, '[]', null),
  ('c9100000-0000-4000-8000-0000000000a2', 'c9100000-0000-4000-8000-000000000001', 'kit', 'T91 old kit', 'ea', 0, '[{"item_id":"c9100000-0000-4000-8000-0000000000a1","qty":"2"}]', null),
  ('c9100000-0000-4000-8000-0000000000a3', 'c9100000-0000-4000-8000-000000000001', 'labor', 'T91 removed', 'hr', 500, '[]', now());
