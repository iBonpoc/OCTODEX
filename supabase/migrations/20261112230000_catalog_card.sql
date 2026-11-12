-- РС-9 (docs/audit/2026-11-12-estimate-editor-spec.md §4.2 п.2, Р11; #1096): the catalog item's card — new fields and the
-- history of its selling price and markup.
-- * catalog_items.barcode (≤ 64, no control or invisible format characters), product_url (only https://, no spaces,
--   no control or format characters, ≤ 500), service_category_id
--   (a direction of the item's own company: FK (company_id, service_category_id) → service_categories). The table-wide
--   grant select, insert, update to authenticated (20261106070000) covers the new columns; rights do not change (members
--   read, staff write). Older phones upsert without these columns — PostgREST writes only the columns sent, so nothing
--   they do clears them. catalog_items is small (not in migrationGuard's big tables): NOT VALID → VALIDATE is only the
--   usual shape, a plain index.
-- * public.catalog_price_history — a new table: one row per change of an item's selling price (catalog_items.
--   unit_price_cents) or markup (catalog_item_costs.markup_bps), with the value before and after, who and when; the
--   card shows «Цена $11.90 → $12.13». Its own table, not catalog_cost_history: the older phones' «История закупки и
--   налога» (item and supplier screens) reads catalog_cost_history and would show a price change as a purchase row
--   «—» that pushes the real ones out (code-reviewer of РС-9; spec §4.2 said catalog_cost_history — told the director).
--   Who reads it: only can_view_costs (a tech, sales without view_costs — no); nobody writes it but the triggers.
--   Written only when the value really changes (the phone upserts the whole item on every save); the item's first price
--   is its created_at, the first change keeps it as «before».
-- Rule 16: only additive (new nullable columns, a new table, functions and triggers). Rule 18: the table — revoke all,
-- then grant select; app.tg_price_history and app.tg_markup_history revoked from public, anon, authenticated (security
-- definer, as app.tg_cost_history).
-- Tests: supabase/tests/core_rls.sql T202.

alter table public.catalog_items
  add column if not exists barcode text,
  add column if not exists product_url text,
  add column if not exists service_category_id uuid;
-- no control characters and no invisible format ones (Cf: zero-width, bidirectional marks and overrides — the set of
-- app.client_title): the barcode and the link go to screens, supplier orders and PDFs (security-check of РС-9)
alter table public.catalog_items add constraint catalog_items_barcode_check
  check (barcode is null or (length(btrim(barcode)) > 0 and length(barcode) <= 64
                             and barcode !~ '[\u0001-\u001f\u007f-\u009f­؀-؅؜۝܏࣢᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻]')) not valid;
alter table public.catalog_items validate constraint catalog_items_barcode_check;
alter table public.catalog_items add constraint catalog_items_product_url_check
  -- only https:// (lowercase, so never javascript:, data: or any other scheme in any case — the app opens it as a link)
  check (product_url is null or (product_url ~ '^https://[^[:space:][:cntrl:]]+$' and length(product_url) <= 500
                                 and product_url !~ '[\u0001-\u001f\u007f-\u009f­؀-؅؜۝܏࣢᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻]')) not valid;
alter table public.catalog_items validate constraint catalog_items_product_url_check;
-- MATCH SIMPLE: no direction (null) is not checked; a direction must be of the item's own company
alter table public.catalog_items add constraint catalog_items_service_category_fk
  foreign key (company_id, service_category_id) references public.service_categories (company_id, id) not valid;
alter table public.catalog_items validate constraint catalog_items_service_category_fk;
create index if not exists catalog_items_service_category_idx on public.catalog_items (company_id, service_category_id)
  where service_category_id is not null;  -- rule16: small (catalog_items is not a big table; the FK)

create table public.catalog_price_history (
  id                     uuid primary key default public.uuid_generate_v7(),
  company_id             uuid not null references public.companies (id),
  item_id                uuid not null,
  -- what changed: the selling price, or the markup (the other pair null)
  unit_price_cents       bigint check (unit_price_cents >= 0),
  prev_unit_price_cents  bigint check (prev_unit_price_cents >= 0),
  markup_bps             int check (markup_bps between 0 and 100000),
  prev_markup_bps        int check (prev_markup_bps between 0 and 100000),
  source                 text not null default 'manual' check (source in ('manual', 'import_file', 'ai_scan', 'shelf_tag', 'module')),
  at                     timestamptz not null default now(),
  by                     uuid,
  foreign key (company_id, item_id) references public.catalog_items (company_id, id) on delete cascade
);
revoke all on public.catalog_price_history from anon, authenticated;
create index catalog_price_history_item_idx on public.catalog_price_history (company_id, item_id, at desc);  -- a new table
create trigger t11_company_id_immutable before update on public.catalog_price_history
  for each row execute function app.tg_company_id_immutable();
alter table public.catalog_price_history enable row level security;
alter table public.catalog_price_history force row level security;
grant select on public.catalog_price_history to authenticated;
create policy catalog_price_history_select on public.catalog_price_history for select to authenticated
  using (app.can_view_costs(company_id));
-- no insert / update / delete policy and no grant: only the triggers below (security definer) write it

-- the selling price changed: before and after, who and when
create or replace function app.tg_price_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  src text := coalesce(nullif(current_setting('app.cost_source', true), ''), 'manual');
begin
  if src not in ('manual', 'import_file', 'ai_scan', 'shelf_tag', 'module') then src := 'manual'; end if;
  insert into public.catalog_price_history (company_id, item_id, unit_price_cents, prev_unit_price_cents, source, by)
  values (new.company_id, new.id, new.unit_price_cents, old.unit_price_cents, src, auth.uid());
  return null;
end;
$$;
revoke all on function app.tg_price_history() from public, anon, authenticated;
drop trigger if exists t97_price_history on public.catalog_items;
create trigger t97_price_history after update of unit_price_cents on public.catalog_items
  for each row when (old.unit_price_cents is distinct from new.unit_price_cents)
  execute function app.tg_price_history();

-- the markup changed (the screen writes catalog_item_costs; an older phone sends it on the item and t30 moves it here):
-- before (none for a first markup) and after
create or replace function app.tg_markup_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  src text := coalesce(nullif(current_setting('app.cost_source', true), ''), 'manual');
  v_prev int := case when tg_op = 'UPDATE' then old.markup_bps end;
begin
  if new.markup_bps is not distinct from v_prev then return null; end if;
  if src not in ('manual', 'import_file', 'ai_scan', 'shelf_tag', 'module') then src := 'manual'; end if;
  insert into public.catalog_price_history (company_id, item_id, markup_bps, prev_markup_bps, source, by)
  values (new.company_id, new.item_id, new.markup_bps, v_prev, src, auth.uid());
  return null;
end;
$$;
revoke all on function app.tg_markup_history() from public, anon, authenticated;
drop trigger if exists t97_markup_history on public.catalog_item_costs;
create trigger t97_markup_history after insert or update of markup_bps on public.catalog_item_costs
  for each row execute function app.tg_markup_history();
