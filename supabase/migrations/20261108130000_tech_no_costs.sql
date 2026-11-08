-- The tech does not see our costs (docs/specs/19-db-security.md §9; matrix docs/04-domain-model.md §1: «see cost and
-- margin» — owner / admin / office, sales and others only with view_costs = app.can_view_costs).
--
-- Before: catalog_items_select = app.is_member, so a tech (and a sales person without view_costs) read every item's
-- purchase cost, supplier tax and markup straight from PostgREST; estimate_versions.totals.marginPct gave them the
-- margin of their estimates. The app only hid it on the screens.
--
-- Column privileges cannot tell the office from the tech (both are `authenticated`): a revoke would break `select *`
-- of every app version. So, like estimate_line_costs, the money goes to side tables that only can_view_costs reads:
--   * catalog_item_costs     — unit_cost_cents, vendor_tax_bps, markup_bps of an item;
--   * estimate_version_costs — margin_pct of a version (was totals.marginPct).
-- Rule 16 step 1: nothing is renamed or dropped. Old columns stay (old phones `select *` them) but are always null:
-- whatever a phone writes there a trigger moves to the side table and blanks in the row. An old office build shows the
-- catalog without cost and estimates without margin until its update — it does not fail, and its null never erases a
-- cost (null = «not sent»). Step 2 (drop the columns) — a later PR, once no app version writes them.
-- Also (P4): leads.cost_cents (copied to lead_costs on 04.11, never read or written since) and
-- lead_sources.default_cost_cents (never used) are blanked — a tech sees his leads, everyone sees the sources.

-- ---- who sees costs (matrix 04 §1): tech and subcontractor never, also with view_costs ---------------
-- Only the body changes (rule 16): estimate_line_costs and the new side tables all ask this function.
create or replace function app.can_view_costs(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
      and (m.role in ('owner', 'admin', 'office')
           or (m.role not in ('tech', 'subcontractor')
               and coalesce((m.permissions_override ->> 'view_costs')::boolean, false)))
  );
$$;

-- ---- catalog_item_costs ------------------------------------------------------------------
create table public.catalog_item_costs (
  item_id          uuid primary key,
  company_id       uuid not null references public.companies (id),
  unit_cost_cents  bigint check (unit_cost_cents >= 0),
  vendor_tax_bps   int check (vendor_tax_bps between 0 and 10000),
  markup_bps       int check (markup_bps between 0 and 100000),
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid(),
  foreign key (company_id, item_id) references public.catalog_items (company_id, id) on delete cascade
);
revoke all on public.catalog_item_costs from anon, authenticated;
create index catalog_item_costs_company_idx on public.catalog_item_costs (company_id, item_id);  -- both FKs; a new table
-- a cost never moves to another company (T59)
create trigger t11_company_id_immutable before update on public.catalog_item_costs
  for each row execute function app.tg_company_id_immutable();
alter table public.catalog_item_costs enable row level security;
alter table public.catalog_item_costs force row level security;
-- reads: only who sees costs; writes: who edits the price list and sees costs (the app clears a cost here)
create policy catalog_item_costs_select on public.catalog_item_costs for select to authenticated
  using (app.can_view_costs(company_id));
create policy catalog_item_costs_insert on public.catalog_item_costs for insert to authenticated
  with check (app.can_view_costs(company_id) and app.is_staff(company_id));
create policy catalog_item_costs_update on public.catalog_item_costs for update to authenticated
  using (app.can_view_costs(company_id) and app.is_staff(company_id))
  with check (app.can_view_costs(company_id) and app.is_staff(company_id));
-- update of the key columns too: an upsert (ON CONFLICT DO UPDATE) sets every column it sends; t11 and the FK keep
-- the row in its company and on an item of that company
grant select, insert (item_id, company_id, unit_cost_cents, vendor_tax_bps, markup_bps),
  update (item_id, company_id, unit_cost_cents, vendor_tax_bps, markup_bps) on public.catalog_item_costs to authenticated;

-- ---- estimate_version_costs --------------------------------------------------------------
create table public.estimate_version_costs (
  version_id   uuid primary key,
  company_id   uuid not null references public.companies (id),
  margin_pct   text check (margin_pct is null or margin_pct ~ '^-?[0-9]{1,12}([.][0-9]{1,2})?$'),
  updated_at   timestamptz not null default now(),
  foreign key (company_id, version_id) references public.estimate_versions (company_id, id) on delete cascade
);
revoke all on public.estimate_version_costs from anon, authenticated;
create index estimate_version_costs_company_idx on public.estimate_version_costs (company_id, version_id);  -- both FKs; a new table
create trigger t11_company_id_immutable before update on public.estimate_version_costs
  for each row execute function app.tg_company_id_immutable();
alter table public.estimate_version_costs enable row level security;
alter table public.estimate_version_costs force row level security;
-- only the trigger writes it (the phone keeps sending totals.marginPct, as before)
create policy estimate_version_costs_select on public.estimate_version_costs for select to authenticated
  using (app.can_view_costs(company_id) and app.can_read_estimate(app.version_estimate_id(version_id)));
grant select on public.estimate_version_costs to authenticated;

-- who changed a cost last (the app writes the side table directly)
create or replace function app.tg_item_costs_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
revoke all on function app.tg_item_costs_stamp() from public, anon, authenticated;
create trigger t10_stamp before insert or update on public.catalog_item_costs
  for each row execute function app.tg_item_costs_stamp();

-- ---- catalog_items: the cost a phone writes goes to the side table ---------------------------
-- BEFORE UPDATE: the row is there — move what was sent (null = not sent, keeps the cost) and blank the row.
-- AFTER INSERT: only a row really inserted (not ON CONFLICT DO NOTHING — that must not touch another row's cost):
-- touch it once, the BEFORE UPDATE above moves the cost.
create or replace function app.tg_catalog_costs_move()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- moved only for who may set costs (sales without view_costs edit the price list but not our costs: just blanked);
  -- a migration (no JWT) moves what is stored. old.id: the key of the row as it is (an id change cannot aim elsewhere).
  if (new.unit_cost_cents is not null or new.vendor_tax_bps is not null or new.markup_bps is not null)
     and (auth.uid() is null or app.can_view_costs(new.company_id)) then
    insert into public.catalog_item_costs as k (item_id, company_id, unit_cost_cents, vendor_tax_bps, markup_bps, updated_by)
    values (old.id, new.company_id, new.unit_cost_cents, new.vendor_tax_bps, new.markup_bps, auth.uid())
    on conflict (item_id) do update
      set unit_cost_cents = coalesce(excluded.unit_cost_cents, k.unit_cost_cents),
          vendor_tax_bps  = coalesce(excluded.vendor_tax_bps, k.vendor_tax_bps),
          markup_bps      = coalesce(excluded.markup_bps, k.markup_bps),
          updated_at      = now(), updated_by = auth.uid();
  end if;
  new.unit_cost_cents := null;
  new.vendor_tax_bps  := null;
  new.markup_bps      := null;
  return new;
end;
$$;
create or replace function app.tg_catalog_costs_inserted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.unit_cost_cents is not null or new.vendor_tax_bps is not null or new.markup_bps is not null then
    update public.catalog_items set unit_cost_cents = unit_cost_cents where id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function app.tg_catalog_costs_move(), app.tg_catalog_costs_inserted() from public, anon, authenticated;
create trigger t30_costs_move before update on public.catalog_items
  for each row execute function app.tg_catalog_costs_move();
create trigger t95_costs_inserted after insert on public.catalog_items
  for each row execute function app.tg_catalog_costs_inserted();

-- ---- estimate_versions: totals.marginPct goes to the side table --------------------------------
-- the document with our money taken out of every options[].lines[] (cost, its material part, supplier tax, markup);
-- the rest as it is; not a document — as it is
create or replace function app.doc_without_costs(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(p) = 'object' and jsonb_typeof(p -> 'options') = 'array' then
      jsonb_set(p, '{options}', (
        select coalesce(jsonb_agg(
                 case when jsonb_typeof(o.value) = 'object' and jsonb_typeof(o.value -> 'lines') = 'array' then
                   jsonb_set(o.value, '{lines}', (
                     select coalesce(jsonb_agg(case when jsonb_typeof(l.value) = 'object'
                                                    then l.value - array['unitCostCents', 'unitMaterialCostCents', 'vendorTaxBps', 'markupBps', 'purchaseTaxBps']
                                                    else l.value end
                                               order by l.ordinality), '[]'::jsonb)
                       from jsonb_array_elements(o.value -> 'lines') with ordinality l))
                 else o.value end order by o.ordinality), '[]'::jsonb)
          from jsonb_array_elements(p -> 'options') with ordinality o))
    else p end;
$$;
revoke all on function app.doc_without_costs(jsonb) from public, anon, authenticated;

-- totals is «only what the client sees» (core.sql). The key sent = the margin now (null too: costs not complete);
-- no key = not sent, the margin stays. t40_version_lock fires first (t40 < t45): a locked version stays locked.
create or replace function app.tg_version_margin_move()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- M1: our cost never sits in the document an assigned tech reads (old app, a module bug, a direct UPDATE);
  -- only an open version: a locked one does not change (t40 fired first)
  new.calc_inputs := app.doc_without_costs(new.calc_inputs);
  if jsonb_typeof(new.totals) = 'object' and new.totals ? 'marginPct' then
    insert into public.estimate_version_costs as k (version_id, company_id, margin_pct)
    values (old.id, new.company_id, new.totals ->> 'marginPct')
    on conflict (version_id) do update set margin_pct = excluded.margin_pct, updated_at = now();
    new.totals := new.totals - 'marginPct';
  end if;
  return new;
end;
$$;
create or replace function app.tg_version_margin_inserted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (jsonb_typeof(new.totals) = 'object' and new.totals ? 'marginPct')
     or new.calc_inputs is distinct from app.doc_without_costs(new.calc_inputs) then
    update public.estimate_versions set totals = totals where id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function app.tg_version_margin_move(), app.tg_version_margin_inserted() from public, anon, authenticated;
create trigger t45_margin_move before update on public.estimate_versions
  for each row execute function app.tg_version_margin_move();
create trigger t95_margin_inserted after insert on public.estimate_versions
  for each row execute function app.tg_version_margin_inserted();

-- ---- what is stored already ------------------------------------------------------------------
update public.catalog_items set unit_cost_cents = unit_cost_cents
 where unit_cost_cents is not null or vendor_tax_bps is not null or markup_bps is not null;

-- sent (locked) versions too: only totals.marginPct leaves them; the signed document (calc_inputs, document_hash) is
-- untouched. The margin is copied directly; then every user trigger of estimate_versions is off for the one update
-- (t40 lock, t17 tax-exempt check on an old draft, t10 stamps: the document did not change) and back on in the same
-- block — one statement, so a failure leaves them on. Open versions also lose a cost left in their document (M1);
-- locked ones keep theirs (the signature's hash is over it) — §9, residual.
do $$
begin
  insert into public.estimate_version_costs (version_id, company_id, margin_pct)
  select id, company_id, totals ->> 'marginPct' from public.estimate_versions
   where jsonb_typeof(totals) = 'object' and totals ? 'marginPct';
  alter table public.estimate_versions disable trigger user;
  update public.estimate_versions set totals = totals - 'marginPct' where jsonb_typeof(totals) = 'object' and totals ? 'marginPct';
  update public.estimate_versions set calc_inputs = app.doc_without_costs(calc_inputs)
   where locked_at is null and calc_inputs is distinct from app.doc_without_costs(calc_inputs);
  alter table public.estimate_versions enable trigger user;
end $$;

-- P4: a lead's price lives in lead_costs (owner / admin / office). Nothing may be lost: each old value must be there.
do $$
begin
  if exists (select 1 from public.leads l
              where coalesce(l.cost_cents, 0) > 0
                and not exists (select 1 from public.lead_costs c where c.lead_id = l.id)) then
    raise exception 'leads.cost_cents has values missing from lead_costs — copy them first';
  end if;
  -- a source's default cost has no other home: nothing writes it (no app version, no function) — it must be empty
  if exists (select 1 from public.lead_sources where default_cost_cents is not null) then
    raise exception 'lead_sources.default_cost_cents has values — decide where they go before this migration';
  end if;
end $$;
update public.leads set cost_cents = null where cost_cents is not null;
-- and nobody writes them again (rule 16 step 1: a check, no drop; no app version writes them)
alter table public.leads add constraint leads_cost_cents_retired check (cost_cents is null) not valid;
alter table public.lead_sources add constraint lead_sources_default_cost_retired check (default_cost_cents is null) not valid;
