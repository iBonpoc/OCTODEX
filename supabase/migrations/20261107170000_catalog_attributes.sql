-- C3 (docs/specs/33-gutters-module.md П16, П17; core K1): properties of a price-list item and how it is bought.
-- attributes: a flat map name → text, set by a trade module (profile, size, material, gauge, color… — the words live in the
-- module, never here). purchase_unit / pack_size: how the supplier sells it (the supplier order, C7).
-- Rule 16 step 1: only new columns with defaults; nothing renamed or dropped. Old phones upsert without these columns —
-- PostgREST updates only the columns sent, so nothing they do clears them (core_rls T91).
-- Rights do not change: members read, staff (owner, admin, office, sales) insert and update (catalog_items_* policies);
-- the table-wide grant select, insert, update to authenticated (20261106070000) covers the new columns.

alter table public.catalog_items
  add column if not exists attributes    jsonb not null default '{}'::jsonb,
  add column if not exists purchase_unit text,
  add column if not exists pack_size     numeric(12, 3);

-- Checked without holding writes (NOT VALID, then VALIDATE: only a SHARE UPDATE EXCLUSIVE lock while it scans).
-- attributes: an object; every name ^[a-zA-Z][a-zA-Z0-9_]{0,39}$ (the engine writes gutterSize, lengthIn); every value a
-- string of 1..120 characters; the whole map at most 4000 bytes.
alter table public.catalog_items add constraint catalog_items_attributes_check check (
  jsonb_typeof(attributes) = 'object'
  and octet_length(attributes::text) <= 4000
  and not jsonb_path_exists(attributes, '$.keyvalue() ? (@.value.type() != "string")')
  and not jsonb_path_exists(attributes, '$.keyvalue() ? (!(@.key like_regex "^[a-zA-Z][a-zA-Z0-9_]{0,39}$"))')
  and not jsonb_path_exists(attributes, '$.keyvalue() ? (@.value like_regex "^$" || @.value like_regex "^.{121}")')
) not valid;
alter table public.catalog_items validate constraint catalog_items_attributes_check;

alter table public.catalog_items add constraint catalog_items_purchase_check check (
  (purchase_unit is null or length(trim(purchase_unit)) between 1 and 20)
  and (pack_size is null or pack_size > 0)
) not valid;
alter table public.catalog_items validate constraint catalog_items_purchase_check;
