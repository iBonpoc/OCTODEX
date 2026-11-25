-- Before #2250 (seq on the histories): rows written in one transaction share «at», their ids in the reverse order of
-- writing (a uuid v7 of one millisecond may be so). The migration numbers the old rows by (at, id) — the order «at desc,
-- id desc» read them in — and the next row gets the next number.
insert into public.companies (id, name) values ('cacc0000-0000-4000-8000-000000000468', 'Upgrade History Co');
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents) values
  ('cacc0000-0000-4000-8000-0000000004d1', 'cacc0000-0000-4000-8000-000000000468', 'material', 'UPG468 hanger', 'ea', 100);
set session_replication_role = replica;
insert into public.catalog_cost_history (id, company_id, item_id, unit_cost_cents, vendor_tax_bps, source, at) values
  ('cacc0000-0000-4000-8000-00000000f003', 'cacc0000-0000-4000-8000-000000000468', 'cacc0000-0000-4000-8000-0000000004d1', 30, 0, 'manual', '2026-11-18 10:00:00+00'),
  ('cacc0000-0000-4000-8000-00000000f001', 'cacc0000-0000-4000-8000-000000000468', 'cacc0000-0000-4000-8000-0000000004d1', 10, 0, 'manual', '2026-11-18 10:00:00+00'),
  ('cacc0000-0000-4000-8000-00000000f002', 'cacc0000-0000-4000-8000-000000000468', 'cacc0000-0000-4000-8000-0000000004d1', 20, 0, 'manual', '2026-11-18 09:00:00+00');
insert into public.catalog_price_history (id, company_id, item_id, unit_price_cents, prev_unit_price_cents, at) values
  ('cacc0000-0000-4000-8000-00000000e002', 'cacc0000-0000-4000-8000-000000000468', 'cacc0000-0000-4000-8000-0000000004d1', 100, 90, '2026-11-18 10:00:00+00'),
  ('cacc0000-0000-4000-8000-00000000e001', 'cacc0000-0000-4000-8000-000000000468', 'cacc0000-0000-4000-8000-0000000004d1', 90, 80, '2026-11-18 10:00:00+00');
insert into public.catalog_price_recalc (id, company_id, item_id, sent_price_cents, server_price_cents, at) values
  ('cacc0000-0000-4000-8000-00000000d002', 'cacc0000-0000-4000-8000-000000000468', 'cacc0000-0000-4000-8000-0000000004d1', 2, 100, '2026-11-18 10:00:00+00'),
  ('cacc0000-0000-4000-8000-00000000d001', 'cacc0000-0000-4000-8000-000000000468', 'cacc0000-0000-4000-8000-0000000004d1', 1, 100, '2026-11-18 10:00:00+00');
set session_replication_role = origin;
