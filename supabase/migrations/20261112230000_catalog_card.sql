-- РС-9 (docs/audit/2026-11-12-estimate-editor-spec.md §4.2 п.2, Р11; #1096): the catalog item's card — new fields and the
-- history of its selling price and markup.
-- * catalog_items.barcode (≤ 64, no control characters), product_url (https://, no spaces, ≤ 500), service_category_id
--   (a direction of the item's own company: FK (company_id, service_category_id) → service_categories). The table-wide
--   grant select, insert, update to authenticated (20261106070000) covers the new columns; rights do not change (members
--   read, staff write). Older phones upsert without these columns — PostgREST writes only the columns sent, so nothing
--   they do clears them. catalog_items is small (not in migrationGuard's big tables): NOT VALID → VALIDATE is only the
--   usual shape, a plain index.
-- * catalog_cost_history.unit_price_cents, markup_bps: the history keeps the markup with every cost row
--   (app.tg_cost_history now also writes a row when only the markup changes) and a row of its own when the selling price
--   changes (app.tg_price_history, after update of unit_price_cents, only when it really changes: the phone upserts the
--   whole item on every save). A price row has no cost (null) — the card shows «Цена $11.90 → $12.13». Who reads it:
--   only can_view_costs, as before (a tech, sales without view_costs — no).
-- Rule 16: only additive (new nullable columns, a new function and trigger; tg_cost_history the same signature).
-- Rule 18: app.tg_price_history revoked from public, anon, authenticated (security definer, as tg_cost_history).
-- Tests: supabase/tests/core_rls.sql T202.

alter table public.catalog_items
  add column if not exists barcode text,
  add column if not exists product_url text,
  add column if not exists service_category_id uuid;
alter table public.catalog_items add constraint catalog_items_barcode_check
  check (barcode is null or (length(btrim(barcode)) > 0 and app.sup_text_ok(barcode, 64))) not valid;
alter table public.catalog_items validate constraint catalog_items_barcode_check;
alter table public.catalog_items add constraint catalog_items_product_url_check
  check (product_url is null or (product_url ~ '^https://[^[:space:][:cntrl:]]+$' and length(product_url) <= 500
                                 and app.sup_text_ok(product_url, 500))) not valid;
alter table public.catalog_items validate constraint catalog_items_product_url_check;
-- MATCH SIMPLE: no direction (null) is not checked; a direction must be of the item's own company
alter table public.catalog_items add constraint catalog_items_service_category_fk
  foreign key (company_id, service_category_id) references public.service_categories (company_id, id) not valid;
alter table public.catalog_items validate constraint catalog_items_service_category_fk;
create index if not exists catalog_items_service_category_idx on public.catalog_items (company_id, service_category_id)
  where service_category_id is not null;  -- rule16: small (catalog_items is not a big table; the FK)

alter table public.catalog_cost_history
  add column if not exists unit_price_cents bigint check (unit_price_cents >= 0),
  add column if not exists markup_bps int check (markup_bps between 0 and 100000);

-- a cost row also when only the markup changes, and the markup in it (the same body otherwise)
create or replace function app.tg_cost_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  src text := coalesce(nullif(current_setting('app.cost_source', true), ''), 'manual');
begin
  if tg_op = 'INSERT' then
    if new.unit_cost_cents is null and new.vendor_tax_bps is null and new.markup_bps is null then return null; end if;
  elsif new.unit_cost_cents is not distinct from old.unit_cost_cents and new.vendor_tax_bps is not distinct from old.vendor_tax_bps
        and new.markup_bps is not distinct from old.markup_bps then
    return null;
  end if;
  if src not in ('manual', 'import_file', 'ai_scan', 'shelf_tag', 'module') then src := 'manual'; end if;
  insert into public.catalog_cost_history (company_id, item_id, supplier_id, unit_cost_cents, vendor_tax_bps, markup_bps, source, by)
  select new.company_id, new.item_id, i.supplier_id, new.unit_cost_cents, new.vendor_tax_bps, new.markup_bps, src, auth.uid()
    from public.catalog_items i where i.id = new.item_id and i.company_id = new.company_id;
  return null;
end;
$$;
revoke all on function app.tg_cost_history() from public, anon, authenticated;

-- the selling price changed: a row of its own (no cost), who and when
create or replace function app.tg_price_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  src text := coalesce(nullif(current_setting('app.cost_source', true), ''), 'manual');
begin
  if src not in ('manual', 'import_file', 'ai_scan', 'shelf_tag', 'module') then src := 'manual'; end if;
  insert into public.catalog_cost_history (company_id, item_id, supplier_id, unit_price_cents, source, by)
  values (new.company_id, new.id, new.supplier_id, new.unit_price_cents, src, auth.uid());
  return null;
end;
$$;
revoke all on function app.tg_price_history() from public, anon, authenticated;
drop trigger if exists t96_price_history on public.catalog_items;
create trigger t96_price_history after update of unit_price_cents on public.catalog_items
  for each row when (old.unit_price_cents is distinct from new.unit_price_cents)
  execute function app.tg_price_history();
