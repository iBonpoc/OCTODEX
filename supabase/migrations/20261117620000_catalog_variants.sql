-- #2227 PR1 (spec 33-gutters-price-key §11.5, §11.7, К1, zone (б)): «variants» of a catalog item.
--
-- The founder, 19.11: «Цвет это спецификация, это не позиция». A Gutters part is ONE item for every colour; the colour is a
-- property of the line. The core knows only a general notion — a VARIANT of an item: the values of ONE property of the item
-- (the module chooses which: Gutters — «color»), one price for all of them, and the supplier's data per value. No word of
-- colour or gutters here.
--
--   catalog_items.variant_skus jsonb   {"<property>": {"<value>": {"sku": text?, "supplierId": uuid?, "purchaseUnit": text?,
--                                       "packSize": text?}}}; one property; ≤ 50 values; a value lower-cased and trimmed,
--                                       1..120 characters (as an attributes value); sku as supplier_sku (≤ 60).
--   public.catalog_set_variant(item, property, value, data)  — writes ONE value (null data — removes it), the row locked:
--                                       two phones writing two colours do not erase each other (a whole-row write would).
--   t29_variant_sku_from_merged       — an OLD build edits the supplier_sku of an old per-colour item (attributes.mergedInto
--                                       = the new item): the sku goes into the new item's variant of that value (§11.5).
--   t05_merged_item_keep               — a hidden per-colour item another item points at (attributes.mergedInto) is never
--                                       put in the Trash: accepted estimates still name it (§11.7.7, hint merged_item).
--
-- Rule 16, step one: one new nullable column, a function, two triggers. Nothing renamed or dropped. Old builds never send
-- variant_skus (catalog.save writes the columns it names) — the column stays as it was (T444).

-- ---- the shape of variant_skus ----------------------------------------------------------------------------------------
create or replace function app.variant_skus_ok(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  k  text;
  vs jsonb;
  v  text;
  d  jsonb;
  f  text;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' or octet_length(p::text) > 16000 then return false; end if;
  if (select count(*) from jsonb_object_keys(p)) > 1 then return false; end if;
  for k, vs in select * from jsonb_each(p) loop
    if k !~ '^[a-zA-Z][a-zA-Z0-9_]{0,39}$' or jsonb_typeof(vs) <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(vs)) > 50 then return false; end if;
    for v, d in select * from jsonb_each(vs) loop
      -- the value as the app compares it: lower case, trimmed, 1..120, no control or direction characters
      if v <> lower(btrim(v)) or length(v) not between 1 and 120 or v ~ '[\x00-\x1f\x7f‪-‮⁦-⁩]' then return false; end if;
      if jsonb_typeof(d) <> 'object' then return false; end if;
      for f in select jsonb_object_keys(d) loop
        if f not in ('sku', 'supplierId', 'purchaseUnit', 'packSize') or jsonb_typeof(d -> f) <> 'string' then return false; end if;
      end loop;
      if d ? 'sku' and not app.sup_text_ok(d ->> 'sku', 60) then return false; end if;
      if d ? 'supplierId' and (d ->> 'supplierId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false; end if;
      if d ? 'purchaseUnit' and ((d ->> 'purchaseUnit') <> btrim(d ->> 'purchaseUnit') or length(d ->> 'purchaseUnit') not between 1 and 20 or (d ->> 'purchaseUnit') ~ '[[:cntrl:]]') then return false; end if;
      if d ? 'packSize' and ((d ->> 'packSize') !~ '^[0-9]{1,9}(\.[0-9]{1,4})?$' or (d ->> 'packSize')::numeric <= 0) then return false; end if;
    end loop;
  end loop;
  return true;
end $$;
revoke all on function app.variant_skus_ok(jsonb) from public, anon, authenticated;
-- the check below runs it as the writer: every role that writes catalog_items (the app, the server's own writes)
grant execute on function app.variant_skus_ok(jsonb) to authenticated, service_role;

alter table public.catalog_items add column if not exists variant_skus jsonb;
alter table public.catalog_items add constraint catalog_items_variant_skus_check check (app.variant_skus_ok(variant_skus)) not valid;
alter table public.catalog_items validate constraint catalog_items_variant_skus_check;

-- ---- the write of one value -------------------------------------------------------------------------------------------
create or replace function public.catalog_set_variant(p_item uuid, p_attr text, p_value text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  it    public.catalog_items;
  v_val text := lower(btrim(coalesce(p_value, '')));
  v_all jsonb;
  v_one jsonb;
  v_new jsonb;
begin
  select * into it from public.catalog_items i where i.id = p_item and i.deleted_at is null;
  -- one answer for «no such item», «another company's» and «not staff» (as catalog_set_group_price)
  if it.id is null or not app.is_staff(it.company_id) then
    raise exception 'catalog item not found' using errcode = 'P0002';
  end if;
  if p_attr is null or p_attr !~ '^[a-zA-Z][a-zA-Z0-9_]{0,39}$' then
    raise exception 'variant property: a name like an attribute' using errcode = '22023';
  end if;
  if length(v_val) not between 1 and 120 then
    raise exception 'variant value: 1..120 characters' using errcode = '22023';
  end if;
  if p_data is not null and jsonb_typeof(p_data) <> 'object' then
    raise exception 'variant data: an object' using errcode = '22023';
  end if;
  -- a supplier of this company only
  if p_data ? 'supplierId' and not exists (
       select 1 from public.suppliers s where s.id::text = p_data ->> 'supplierId' and s.company_id = it.company_id) then
    raise exception 'supplier not found' using errcode = 'P0002', hint = 'supplier';
  end if;
  -- the row locked, then read again: two writers of two values wait for each other, neither is lost
  select * into it from public.catalog_items i where i.id = p_item for update;
  v_all := coalesce(it.variant_skus, '{}'::jsonb);
  -- one property per item: another one is a mistake of the caller, never a silent second axis
  if v_all <> '{}'::jsonb and not v_all ? p_attr then
    raise exception 'the item has variants of another property' using errcode = '22023', hint = 'other_variant_attr';
  end if;
  v_one := coalesce(v_all -> p_attr, '{}'::jsonb);
  -- empty strings are «not set»: a value without data keeps the variant (a colour with no sku yet)
  v_new := case when p_data is null then null else jsonb_strip_nulls(p_data) end;
  if v_new is not null then
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_new
      from jsonb_each(v_new) e where not (jsonb_typeof(e.value) = 'string' and btrim(e.value #>> '{}') = '');
  end if;
  v_one := case when v_new is null then v_one - v_val else jsonb_set(v_one, array[v_val], v_new, true) end;
  v_all := case when v_one = '{}'::jsonb then null else jsonb_build_object(p_attr, v_one) end;
  update public.catalog_items set variant_skus = v_all, updated_at = now(), updated_by = auth.uid() where id = it.id;
  return v_all;
end $$;
revoke all on function public.catalog_set_variant(uuid, text, text, jsonb) from public, anon;
grant execute on function public.catalog_set_variant(uuid, text, text, jsonb) to authenticated;

-- ---- an old build edits the sku of an old per-colour item: into the new item's variant --------------------------------
create or replace function app.tg_variant_sku_from_merged()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_to   uuid;
  v_all  jsonb;
  v_attr text;
  v_val  text;
  v_one  jsonb;
begin
  if new.deleted_at is not null or new.supplier_sku is not distinct from old.supplier_sku then return null; end if;
  begin
    v_to := nullif(btrim(coalesce(new.attributes ->> 'mergedInto', '')), '')::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  if v_to is null then return null; end if;
  select i.variant_skus into v_all from public.catalog_items i
   where i.id = v_to and i.company_id = new.company_id and i.deleted_at is null for update;
  -- the new item has no variants yet: which property is the variant is not known here — nothing is written (§11.5)
  if v_all is null then return null; end if;
  select k into v_attr from jsonb_object_keys(v_all) k limit 1;
  v_val := lower(btrim(coalesce(new.attributes ->> v_attr, '')));
  if v_val = '' or length(v_val) > 120 then return null; end if;
  v_one := coalesce(v_all -> v_attr -> v_val, '{}'::jsonb);
  v_one := case when nullif(btrim(coalesce(new.supplier_sku, '')), '') is null then v_one - 'sku'
                else jsonb_set(v_one, '{sku}', to_jsonb(btrim(new.supplier_sku)), true) end;
  update public.catalog_items set variant_skus = jsonb_set(v_all, array[v_attr, v_val], v_one, true)
   where id = v_to;
  return null;
end $$;
revoke all on function app.tg_variant_sku_from_merged() from public, anon, authenticated;
drop trigger if exists t29_variant_sku_from_merged on public.catalog_items;
create trigger t29_variant_sku_from_merged after update of supplier_sku on public.catalog_items
  for each row execute function app.tg_variant_sku_from_merged();

-- ---- a hidden per-colour item is never put in the Trash (accepted estimates still name it) ----------------------------
create or replace function app.tg_merged_item_keep()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- only the Trash (deleted_at): a hard delete is the company's erasure (cascade) — never held here
  if old.deleted_at is null and new.deleted_at is not null
     and nullif(btrim(coalesce(new.attributes ->> 'mergedInto', '')), '') is not null then
    raise exception 'a merged item is kept' using errcode = 'P0001', hint = 'merged_item';
  end if;
  return new;
end $$;
revoke all on function app.tg_merged_item_keep() from public, anon, authenticated;
drop trigger if exists t05_merged_item_keep on public.catalog_items;
create trigger t05_merged_item_keep before update of deleted_at on public.catalog_items
  for each row execute function app.tg_merged_item_keep();
