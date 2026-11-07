-- C3 (docs/specs/33-gutters-module.md П16, П17; core K1): properties of a price-list item and how it is bought.
-- attributes: a flat map name → text, set by a trade module (profile, size, material, gauge, color… — the words live in the
-- module, never here). purchase_unit / pack_size: how the supplier sells it (the supplier order, C7): pack_size = how many
-- of the item's own unit are in one purchase unit (coil: 2.6 ft a lb; downspout: 10 ft a piece; a box of 30) — spec П16.6.
-- Rule 16 step 1: only new columns with defaults; nothing renamed or dropped. Old phones upsert without these columns —
-- PostgREST updates only the columns sent, so nothing they do clears them (core_rls T91).
-- Rights do not change: members read, staff (owner, admin, office, sales) insert and update (catalog_items_* policies);
-- the table-wide grant select, insert, update to authenticated (20261106070000) covers the new columns.

alter table public.catalog_items
  add column if not exists attributes    jsonb not null default '{}'::jsonb,
  add column if not exists purchase_unit text,
  add column if not exists pack_size     numeric(12, 3);

-- NOT VALID, then VALIDATE: in one migration (one transaction) the ADD keeps its full lock to the end, so this is only
-- the usual shape — catalog_items is small (not in migrationGuard's big tables) and the new column's default '{}' passes
-- at once. attributes: an object; every name ^[a-zA-Z][a-zA-Z0-9_]{0,39}$ (the engine writes gutterSize, lengthIn);
-- every value a string of 1..120 characters ("s": a line break counts too), not blank, no control characters and no
-- bidirectional overrides (they go to screens, supplier orders and PDFs); the whole map at most 4000 bytes.
alter table public.catalog_items add constraint catalog_items_attributes_check check (
  jsonb_typeof(attributes) = 'object'
  and octet_length(attributes::text) <= 4000
  and not jsonb_path_exists(attributes, '$.keyvalue() ? (@.value.type() != "string")')
  and not jsonb_path_exists(attributes, '$.keyvalue() ? (!(@.key like_regex "^[a-zA-Z][a-zA-Z0-9_]{0,39}$"))')
  and not jsonb_path_exists(attributes, '$.keyvalue() ? (@.value like_regex "^\\s*$" flag "s" || @.value like_regex "^.{121}" flag "s")')
  and not jsonb_path_exists(attributes, '$.keyvalue() ? (@.value like_regex "[\\x00-\\x1f\\x7f\\u202a-\\u202e\\u2066-\\u2069]")')
) not valid;
alter table public.catalog_items validate constraint catalog_items_attributes_check;

alter table public.catalog_items add constraint catalog_items_purchase_check check (
  -- stored trimmed (btrim: spaces and tabs), 1..20 characters, no control characters
  (purchase_unit is null or (purchase_unit = btrim(purchase_unit, E' \t') and length(purchase_unit) between 1 and 20 and purchase_unit !~ '[[:cntrl:]]'))
  and (pack_size is null or pack_size > 0)
) not valid;
alter table public.catalog_items validate constraint catalog_items_purchase_check;
