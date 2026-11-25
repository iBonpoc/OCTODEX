-- Before #1926 (cost in thousandths of a cent): stored costs in whole cents, with their history, an empty cost, a hand
-- price off the formula — the migration must give each its exact value (cents × 1000) without touching anything else.
insert into public.companies (id, name) values ('cacc0000-0000-4000-8000-000000000450', 'Upgrade Millicents Co');
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents) values
  ('cacc0000-0000-4000-8000-0000000004c1', 'cacc0000-0000-4000-8000-000000000450', 'material', 'UPG450 rivet', 'ea', 25),
  ('cacc0000-0000-4000-8000-0000000004c2', 'cacc0000-0000-4000-8000-000000000450', 'material', 'UPG450 no cost', 'ea', 700),
  ('cacc0000-0000-4000-8000-0000000004c3', 'cacc0000-0000-4000-8000-000000000450', 'material', 'UPG450 off formula', 'ea', 1500);
insert into public.catalog_item_costs (item_id, company_id, unit_cost_cents, vendor_tax_bps, markup_bps) values
  ('cacc0000-0000-4000-8000-0000000004c1', 'cacc0000-0000-4000-8000-000000000450', 23, 0, 1000),
  ('cacc0000-0000-4000-8000-0000000004c2', 'cacc0000-0000-4000-8000-000000000450', null, 825, null);
insert into public.catalog_item_costs (item_id, company_id, unit_cost_cents, vendor_tax_bps, markup_bps) values
  ('cacc0000-0000-4000-8000-0000000004c3', 'cacc0000-0000-4000-8000-000000000450', 1000, 1025, 1000);
-- a hand price off the formula, as a database may hold one (written without the triggers)
set session_replication_role = replica;
update public.catalog_items set unit_price_cents = 1500 where id = 'cacc0000-0000-4000-8000-0000000004c3';
set session_replication_role = origin;
-- what must not move: the stamps, the prices, the number of history rows
create table if not exists public._upg450 as
  select i.id, i.updated_at, i.row_version, i.unit_price_cents, c.updated_at as cost_at,
         (select count(*) from public.catalog_cost_history h where h.item_id = i.id) as hist
    from public.catalog_items i left join public.catalog_item_costs c on c.item_id = i.id
   where i.company_id = 'cacc0000-0000-4000-8000-000000000450';
