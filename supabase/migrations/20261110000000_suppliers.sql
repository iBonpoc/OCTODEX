-- SUP1 (docs/specs/36-suppliers.md §5, §8): the company's suppliers, the main supplier of a price-list item, and the
-- history of an item's purchase cost.
--   suppliers               who we buy from: contact, phone, email for orders, account number, address, terms, the
--                           purchase tax (copied into an item when the supplier is picked; the engine keeps counting
--                           from the item's vendor_tax_bps — old phones too). Read and written by owner/admin/office
--                           only: the account number lets anyone order on the company's account (spec 36 §4 №9).
--   catalog_items           + supplier_id (a supplier of the same company), supplier_sku. `vendor` (text) stays and the
--                           app writes the supplier's name into it: old phones read and write it (rule 16, step 1).
--   catalog_cost_history    one row per change of an item's cost or supplier tax; written only by the trigger on
--                           catalog_item_costs (every way a cost is written goes there, #383); read only by who sees
--                           costs (app.can_view_costs) — never the tech, never sales without view_costs.
-- New tables and nullable columns only; nothing renamed or dropped (rule 16). No DELETE on suppliers: is_active (archive).

-- ---- suppliers -------------------------------------------------------------------------------------------------------
-- text: stored as typed by the app (trimmed there); no control characters, no bidirectional overrides (they reach
-- screens and the supplier order PDF), bounded lengths
create or replace function app.sup_text_ok(p text, p_max int)
returns boolean language sql immutable set search_path = '' as $$
  select p is null or (length(p) between 1 and p_max and p !~ '[\x00-\x1f\x7f‪-‮⁦-⁩]')
$$;
revoke all on function app.sup_text_ok(text, int) from public, anon, authenticated;
grant execute on function app.sup_text_ok(text, int) to authenticated, service_role;

create table public.suppliers (
  id                uuid primary key default public.uuid_generate_v7(),
  company_id        uuid not null references public.companies (id),
  name              text not null check (length(btrim(name)) > 0 and app.sup_text_ok(name, 80)),
  contact_name      text check (app.sup_text_ok(contact_name, 80)),
  phone             text check (app.sup_text_ok(phone, 30)),
  email             text check (app.sup_text_ok(email, 120) and (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+$')),
  account_number    text check (app.sup_text_ok(account_number, 40)),
  address           text check (app.sup_text_ok(address, 200)),
  payment_terms     text check (payment_terms in ('cod', 'prepaid', 'net_15', 'net_30', 'net_60', 'custom')),
  terms_note        text check (app.sup_text_ok(terms_note, 80)),
  -- the purchase tax of this supplier; null = not set (an item keeps its own when the supplier is picked)
  purchase_tax_bps  int check (purchase_tax_bps between 0 and 10000),
  notes             text check (notes is null or (length(notes) <= 500 and notes !~ '[\x00-\x09\x0b-\x1f\x7f‪-‮⁦-⁩]')),
  is_active         boolean not null default true,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id)
);
create index suppliers_company_idx on public.suppliers (company_id, name);  -- a new table
select app.attach_standard_triggers('public.suppliers');

alter table public.suppliers enable row level security;
alter table public.suppliers force row level security;
revoke all on public.suppliers from anon, authenticated;
grant select on public.suppliers to authenticated;
grant insert (id, company_id, name, contact_name, phone, email, account_number, address, payment_terms, terms_note,
              purchase_tax_bps, notes, is_active, created_at_device, origin_device_id)
  on public.suppliers to authenticated;
grant update (name, contact_name, phone, email, account_number, address, payment_terms, terms_note, purchase_tax_bps,
              notes, is_active)
  on public.suppliers to authenticated;
create policy suppliers_select on public.suppliers for select to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office']));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));
create policy suppliers_update on public.suppliers for update to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office']))
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));

-- ---- catalog_items: the main supplier --------------------------------------------------------------------------------
-- MATCH SIMPLE: no supplier (null) is not checked; a supplier must be of the item's own company (T144). The table-wide
-- grant select, insert, update to authenticated (20261106070000) covers the new columns; rights do not change
-- (members read, staff write). Old phones upsert without these columns — PostgREST writes only the columns sent, so
-- nothing they do clears them. catalog_items is small (not in migrationGuard's big tables).
alter table public.catalog_items
  add column if not exists supplier_id  uuid,
  add column if not exists supplier_sku text;
alter table public.catalog_items add constraint catalog_items_supplier_fk
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id) not valid;
alter table public.catalog_items validate constraint catalog_items_supplier_fk;
alter table public.catalog_items add constraint catalog_items_supplier_sku_check
  check (supplier_sku is null or (length(btrim(supplier_sku)) > 0 and app.sup_text_ok(supplier_sku, 60))) not valid;
alter table public.catalog_items validate constraint catalog_items_supplier_sku_check;
create index catalog_items_supplier_idx on public.catalog_items (company_id, supplier_id) where supplier_id is not null;  -- rule16: small (catalog_items is not a big table; the FK)

-- ---- catalog_cost_history ---------------------------------------------------------------------------------------------
create table public.catalog_cost_history (
  id               uuid primary key default public.uuid_generate_v7(),
  company_id       uuid not null references public.companies (id),
  item_id          uuid not null,
  supplier_id      uuid,
  unit_cost_cents  bigint check (unit_cost_cents >= 0),
  vendor_tax_bps   int check (vendor_tax_bps between 0 and 10000),
  -- where the cost came from: typed (manual), what was stored before SUP1 (initial); next waves: a price-list file,
  -- an AI scan, a shelf tag, a trade module (spec 36 §1в)
  source           text not null default 'manual' check (source in ('manual', 'initial', 'import_file', 'ai_scan', 'shelf_tag', 'module')),
  at               timestamptz not null default now(),
  by               uuid,
  foreign key (company_id, item_id) references public.catalog_items (company_id, id) on delete cascade
);
create index catalog_cost_history_item_idx on public.catalog_cost_history (company_id, item_id, at desc);  -- a new table
create trigger t11_company_id_immutable before update on public.catalog_cost_history
  for each row execute function app.tg_company_id_immutable();
alter table public.catalog_cost_history enable row level security;
alter table public.catalog_cost_history force row level security;
revoke all on public.catalog_cost_history from anon, authenticated;
grant select on public.catalog_cost_history to authenticated;
create policy catalog_cost_history_select on public.catalog_cost_history for select to authenticated
  using (app.can_view_costs(company_id));
-- no insert / update / delete policy and no grant: only the triggers below (security definer) write it

-- every write of a cost (the screen upserts catalog_item_costs directly; old phones send it on catalog_items and
-- t30_costs_move moves it here) — a row only when the cost or the supplier tax really changed. The supplier is the
-- item's as stored now; when the supplier and the cost change in one save, t30 moves the cost before the item row is
-- written, so t96 below rewrites the supplier of this transaction's row. source: a server writer (an import, a module)
-- sets app.cost_source for its transaction; a phone cannot (set_config is not exposed by PostgREST) — manual.
create or replace function app.tg_cost_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  src text := coalesce(nullif(current_setting('app.cost_source', true), ''), 'manual');
begin
  if tg_op = 'INSERT' then
    if new.unit_cost_cents is null and new.vendor_tax_bps is null then return null; end if;
  elsif new.unit_cost_cents is not distinct from old.unit_cost_cents and new.vendor_tax_bps is not distinct from old.vendor_tax_bps then
    return null;
  end if;
  if src not in ('manual', 'import_file', 'ai_scan', 'shelf_tag', 'module') then src := 'manual'; end if;
  insert into public.catalog_cost_history (company_id, item_id, supplier_id, unit_cost_cents, vendor_tax_bps, source, by)
  select new.company_id, new.item_id, i.supplier_id, new.unit_cost_cents, new.vendor_tax_bps, src, auth.uid()
    from public.catalog_items i where i.id = new.item_id and i.company_id = new.company_id;
  return null;
end;
$$;
create or replace function app.tg_cost_history_supplier()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.catalog_cost_history h set supplier_id = new.supplier_id
   where h.company_id = new.company_id and h.item_id = new.id and h.at = now();
  return null;
end;
$$;
revoke all on function app.tg_cost_history(), app.tg_cost_history_supplier() from public, anon, authenticated;
create trigger t96_cost_history after insert or update on public.catalog_item_costs
  for each row execute function app.tg_cost_history();
create trigger t96_cost_history_supplier after update of supplier_id on public.catalog_items
  for each row when (old.supplier_id is distinct from new.supplier_id)
  execute function app.tg_cost_history_supplier();

-- ---- what is stored already (rule 16: move the data) -----------------------------------------------------------------
-- every distinct vendor text of a company becomes a supplier (the same name trimmed, case-insensitive), its purchase
-- tax the most common supplier tax of its items; the items point to it. Text cut to the column's limits.
with v as (
  select i.company_id, left(regexp_replace(btrim(i.vendor), '[\x00-\x1f\x7f‪-‮⁦-⁩]', '', 'g'), 80) as name,
         lower(btrim(i.vendor)) as k, i.id as item_id, c.vendor_tax_bps
    from public.catalog_items i
    left join public.catalog_item_costs c on c.item_id = i.id
   where i.vendor is not null and btrim(i.vendor) <> '' and i.deleted_at is null and i.supplier_id is null
), n as materialized (
  select public.uuid_generate_v7() as id, company_id, k, name, tax from (
    select company_id, k, min(name) as name,
           mode() within group (order by vendor_tax_bps) filter (where vendor_tax_bps is not null) as tax
      from v where length(btrim(name)) > 0 group by company_id, k
  ) g
), s as (
  insert into public.suppliers (id, company_id, name, purchase_tax_bps)
  select id, company_id, name, tax from n
  returning id
)
update public.catalog_items i set supplier_id = n.id
  from n where n.id in (select id from s)
   and i.company_id = n.company_id and lower(btrim(i.vendor)) = n.k and i.supplier_id is null and i.deleted_at is null;

-- the starting point of every item's history: its cost as stored, at the time it was last changed
insert into public.catalog_cost_history (company_id, item_id, supplier_id, unit_cost_cents, vendor_tax_bps, source, at, by)
select c.company_id, c.item_id, i.supplier_id, c.unit_cost_cents, c.vendor_tax_bps, 'initial', c.updated_at, c.updated_by
  from public.catalog_item_costs c join public.catalog_items i on i.id = c.item_id
 where c.unit_cost_cents is not null or c.vendor_tax_bps is not null;
