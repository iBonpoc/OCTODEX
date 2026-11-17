-- #1913 PR1 (spec 33-gutters-price-key §4.6, К1, zone (б)): one price for a «price group» of catalog items.
--
-- The core knows only a general notion: catalog_items.attributes.priceGroup (text). Items of one company with the same
-- priceGroup have ONE price: unit_price_cents, is_placeholder_price and the cost row (unit_cost_cents, vendor_tax_bps,
-- markup_bps). WHY they are one group (Gutters: the same part in another colour) is the module's business — no word of
-- colour or gutters here. An item without priceGroup lives as before.
--
-- How it fits 53-0б (#1807, 20261117170000): a material's price follows its cost (t31/t32). So the group spreads the COST
-- (each material then counts the same price from it) and the price / placeholder (for items priced by hand). Who does not
-- see our costs never gets a formula price back: for a group counted from its cost the price is changed by who sees the
-- cost (app.catalog_set_group_price refuses others, 42501).
--
-- The parts:
--   * app.catalog_set_group_price(...) — the new app's write (queue op catalog.groupPrice, PR2): rights, locks the group's
--     rows in one order (no deadlock between two writers), compares with what the phone saw (40001 row_version_conflict —
--     nobody's price is lost silently), writes all items of the group in one transaction, history source 'module';
--   * triggers — the insurance for old builds and other paths (core catalog, import, onlyNew, restore from the Trash):
--       t29_group_price_in   BEFORE INSERT OR UPDATE on catalog_items, before t30: a new item of a group, an item
--                            entering a group, an item back from the Trash — takes the group's price and placeholder,
--                            and the cost it carries is dropped (t30 / t95 must not move it: the group's comes below);
--       t98_group_price_out  AFTER UPDATE on catalog_items: a real change of the price / placeholder of a group item —
--                            the same into the other items of its group;
--       t98_group_cost_in    AFTER INSERT OR UPDATE on catalog_items: the new / entering / restored item gets the group's
--                            cost row (security definer: also when sales without costs makes it — t30 would blank it);
--       t98_group_cost_out   AFTER INSERT OR UPDATE on catalog_item_costs: a real change of a group item's cost — the same
--                            into the other items of its group (their prices then follow by t32 / t31).
--     No «spreading» flag (a flag set by hand would switch the spread off — T358): every write goes «only where it
--     differs», so a spread that reaches the group again finds it equal and stops (one change — one spread, T353).
-- Rule 16: no column or table changes; new functions, triggers and an index. Old phones keep working: what they send is
-- spread (a stale whole row of an old build is spread too — the new phone shows it, spec §4.6; PR2 / PR3).

-- ---- the group of a row -----------------------------------------------------------------------------------------------
create or replace function app.price_group(p_attrs jsonb)
returns text language sql immutable parallel safe set search_path = '' as $$
  select nullif(btrim(coalesce(p_attrs ->> 'priceGroup', '')), '');
$$;
revoke all on function app.price_group(jsonb) from public, anon, authenticated;
-- the index below is computed as the writer: whoever writes catalog_items runs it (pure: reads only the given json)
grant execute on function app.price_group(jsonb) to authenticated;

-- the group's items of a company are found by this (catalog_items is not a big table — migrationGuard BIG_TABLES)
create index if not exists catalog_items_price_group_idx on public.catalog_items (company_id, (app.price_group(attributes)))
  where app.price_group(attributes) is not null and deleted_at is null;

-- ---- spreading (internal): the price / placeholder and the cost of one item into the other items of its group --------
create or replace function app.spread_group_price(p_company uuid, p_group text, p_from uuid, p_price boolean, p_cost boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  src record;
  k   record;
  v_src text := coalesce(current_setting('app.cost_source', true), '');
begin
  if p_group is null then return; end if;
  select i.unit_price_cents, i.is_placeholder_price into src from public.catalog_items i where i.id = p_from and i.company_id = p_company;
  if not found then return; end if;
  -- what the spread writes is seen as a spread in the history (source «module»), the writer's own row keeps its own source
  perform set_config('app.cost_source', 'module', true);
  -- the group's rows locked in one order (id): two spreads at once wait, never deadlock each other
  perform 1 from public.catalog_items i
   where i.company_id = p_company and app.price_group(i.attributes) = p_group and i.deleted_at is null
   order by i.id for update;
  if p_cost then
    select c.unit_cost_cents, c.vendor_tax_bps, c.markup_bps into k
      from public.catalog_item_costs c where c.item_id = p_from and c.company_id = p_company;
    if found then
      insert into public.catalog_item_costs as c (item_id, company_id, unit_cost_cents, vendor_tax_bps, markup_bps, updated_by)
      select i.id, p_company, k.unit_cost_cents, k.vendor_tax_bps, k.markup_bps, auth.uid()
        from public.catalog_items i
       where i.company_id = p_company and app.price_group(i.attributes) = p_group and i.deleted_at is null and i.id <> p_from
       order by i.id
      on conflict (item_id) do update
        set unit_cost_cents = excluded.unit_cost_cents, vendor_tax_bps = excluded.vendor_tax_bps, markup_bps = excluded.markup_bps,
            updated_at = now(), updated_by = auth.uid()
        where (c.unit_cost_cents, c.vendor_tax_bps, c.markup_bps) is distinct from (excluded.unit_cost_cents, excluded.vendor_tax_bps, excluded.markup_bps);
    end if;
  end if;
  if p_price then
    -- not the row t30 is moving the cost of right now (in its BEFORE trigger: an update of it here would be 27000); t31
    -- counts that row's price from the same cost
    update public.catalog_items i
       set unit_price_cents = src.unit_price_cents, is_placeholder_price = src.is_placeholder_price
     where i.company_id = p_company and app.price_group(i.attributes) = p_group and i.deleted_at is null and i.id <> p_from
       and i.id::text <> coalesce(current_setting('app.item_costs_moving', true), '')
       and (i.unit_price_cents, i.is_placeholder_price) is distinct from (src.unit_price_cents, src.is_placeholder_price);
  end if;
  perform set_config('app.cost_source', v_src, true);
end;
$$;
revoke all on function app.spread_group_price(uuid, text, uuid, boolean, boolean) from public, anon, authenticated;

-- a live item of the group other than this one (the group is one price: any of them); null — none
create or replace function app.group_peer(p_company uuid, p_group text, p_not uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select i.id from public.catalog_items i
   where i.company_id = p_company and app.price_group(i.attributes) = p_group and i.deleted_at is null and i.id <> p_not
   order by i.updated_at desc nulls last, i.id
   limit 1;
$$;
revoke all on function app.group_peer(uuid, text, uuid) from public, anon, authenticated;

-- does this row (just) join its group: a new row, the group set / changed, back from the Trash
create or replace function app.group_joins(p_op text, p_old_attrs jsonb, p_new_attrs jsonb, p_old_deleted timestamptz, p_new_deleted timestamptz)
returns boolean language sql immutable set search_path = '' as $$
  select app.price_group(p_new_attrs) is not null and p_new_deleted is null
     and (p_op = 'INSERT'
          or app.price_group(p_old_attrs) is distinct from app.price_group(p_new_attrs)
          or p_old_deleted is not null);
$$;
revoke all on function app.group_joins(text, jsonb, jsonb, timestamptz, timestamptz) from public, anon, authenticated;

-- ---- t29: a row joining its group takes the group's price (before t30: the cost it carries is not moved) --------------
create or replace function app.tg_group_price_in()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_peer uuid; p record;
begin
  if not app.group_joins(tg_op, case when tg_op = 'UPDATE' then old.attributes end, new.attributes,
                         case when tg_op = 'UPDATE' then old.deleted_at end, new.deleted_at) then
    return new;
  end if;
  v_peer := app.group_peer(new.company_id, app.price_group(new.attributes), new.id);
  if v_peer is null then return new; end if;  -- the first item of its group: its own price is the group's
  select i.unit_price_cents, i.is_placeholder_price into p from public.catalog_items i where i.id = v_peer;
  new.unit_price_cents := p.unit_price_cents;
  new.is_placeholder_price := p.is_placeholder_price;
  -- the cost an old phone sends with it is the item's own, not the group's: dropped (t98 gives it the group's cost)
  new.unit_cost_cents := null;
  new.vendor_tax_bps  := null;
  new.markup_bps      := null;
  return new;
end;
$$;
revoke all on function app.tg_group_price_in() from public, anon, authenticated;
drop trigger if exists t29_group_price_in on public.catalog_items;
create trigger t29_group_price_in before insert or update on public.catalog_items
  for each row execute function app.tg_group_price_in();

-- ---- t98: after the row is written — its cost from the group (joining), or its price / cost into the group -----------
create or replace function app.tg_group_after_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_group text := app.price_group(new.attributes); v_peer uuid; k record;
begin
  if v_group is null or new.deleted_at is not null then
    return null;
  end if;
  if app.group_joins(tg_op, case when tg_op = 'UPDATE' then old.attributes end, new.attributes,
                     case when tg_op = 'UPDATE' then old.deleted_at end, new.deleted_at) then
    -- joining: the group's cost row into this item (also when its author does not see costs — t30 blanks theirs)
    v_peer := app.group_peer(new.company_id, v_group, new.id);
    if v_peer is null then return null; end if;
    select c.unit_cost_cents, c.vendor_tax_bps, c.markup_bps into k from public.catalog_item_costs c where c.item_id = v_peer and c.company_id = new.company_id;
    if not found then return null; end if;
    insert into public.catalog_item_costs as c (item_id, company_id, unit_cost_cents, vendor_tax_bps, markup_bps, updated_by)
    values (new.id, new.company_id, k.unit_cost_cents, k.vendor_tax_bps, k.markup_bps, auth.uid())
    on conflict (item_id) do update
      set unit_cost_cents = excluded.unit_cost_cents, vendor_tax_bps = excluded.vendor_tax_bps, markup_bps = excluded.markup_bps,
          updated_at = now(), updated_by = auth.uid()
      where (c.unit_cost_cents, c.vendor_tax_bps, c.markup_bps) is distinct from (excluded.unit_cost_cents, excluded.vendor_tax_bps, excluded.markup_bps);
    return null;
  end if;
  -- a real change of the price or the placeholder of a group item: the same into the group
  if tg_op = 'UPDATE' and (new.unit_price_cents, new.is_placeholder_price) is distinct from (old.unit_price_cents, old.is_placeholder_price) then
    perform app.spread_group_price(new.company_id, v_group, new.id, true, false);
  end if;
  return null;
end;
$$;
revoke all on function app.tg_group_after_item() from public, anon, authenticated;
drop trigger if exists t98_group_price on public.catalog_items;
create trigger t98_group_price after insert or update on public.catalog_items
  for each row execute function app.tg_group_after_item();

-- ---- t98 on the costs: a real change of a group item's cost goes into the group ---------------------------------------
create or replace function app.tg_group_after_cost()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_group text;
begin
  if tg_op = 'UPDATE'
     and (new.unit_cost_cents, new.vendor_tax_bps, new.markup_bps) is not distinct from (old.unit_cost_cents, old.vendor_tax_bps, old.markup_bps) then
    return null;
  end if;
  select app.price_group(i.attributes) into v_group from public.catalog_items i
   where i.id = new.item_id and i.company_id = new.company_id and i.deleted_at is null;
  if v_group is null then return null; end if;
  perform app.spread_group_price(new.company_id, v_group, new.item_id, false, true);
  return null;
end;
$$;
revoke all on function app.tg_group_after_cost() from public, anon, authenticated;
drop trigger if exists t98_group_cost on public.catalog_item_costs;
create trigger t98_group_cost after insert or update on public.catalog_item_costs
  for each row execute function app.tg_group_after_cost();

-- ---- the new app's write: one price for the whole group, compared with what the phone saw ----------------------------
-- p_cost / p_tax_bps / p_markup_bps and their expected values: only for who sees our costs (others pass null).
-- Returns the number of items written (0 — nothing differed).
create or replace function public.catalog_set_group_price(
  p_item_id uuid, p_price_cents bigint, p_placeholder boolean,
  p_cost_cents bigint, p_tax_bps int, p_markup_bps int,
  p_expected_price_cents bigint, p_expected_cost_cents bigint default null, p_expected_tax_bps int default null, p_expected_markup_bps int default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  it      public.catalog_items;
  v_group text;
  v_costs boolean;
  k       record;
  v_n     integer := 0;
  v_was   text := coalesce(current_setting('app.cost_source', true), '');
  n       integer;
begin
  select * into it from public.catalog_items i where i.id = p_item_id and i.deleted_at is null;
  if it.id is null or not app.is_staff(it.company_id) then
    raise exception 'catalog item not found' using errcode = 'P0002';
  end if;
  v_group := app.price_group(it.attributes);
  if v_group is null then
    raise exception 'the item has no price group' using errcode = '22023', hint = 'no_price_group';
  end if;
  if p_price_cents is null or p_price_cents < 0 then
    raise exception 'price: a number ≥ 0' using errcode = '22023';
  end if;
  v_costs := app.can_view_costs(it.company_id);
  -- the group's rows locked in one order (id), then read: two writers at once wait, never deadlock
  perform 1 from public.catalog_items i
   where i.company_id = it.company_id and app.price_group(i.attributes) = v_group and i.deleted_at is null
   order by i.id for update;
  select * into it from public.catalog_items i where i.id = p_item_id;
  select c.unit_cost_cents, c.vendor_tax_bps, c.markup_bps into k from public.catalog_item_costs c
   where c.item_id = it.id and c.company_id = it.company_id;
  -- a group counted from its cost (53-0б): who does not see our costs does not set its price (never a formula back)
  if not v_costs and it.kind = 'material' and k.unit_cost_cents is not null then
    raise exception 'the price is counted from the cost' using errcode = '42501', hint = 'price_from_cost';
  end if;
  -- what the phone saw is still there — or someone changed it first: nothing is written, the phone asks the person
  if it.unit_price_cents is distinct from p_expected_price_cents
     or (v_costs and (k.unit_cost_cents, k.vendor_tax_bps, k.markup_bps)
                     is distinct from (p_expected_cost_cents, p_expected_tax_bps, p_expected_markup_bps)) then
    raise exception 'the group''s price changed meanwhile' using errcode = '40001', hint = 'row_version_conflict';
  end if;

  perform set_config('app.cost_source', 'module', true);
  -- the cost first (who sees it): each material then counts its price from it (t32 / t31)
  if v_costs and (p_cost_cents is not null or p_tax_bps is not null or p_markup_bps is not null) then
    insert into public.catalog_item_costs as c (item_id, company_id, unit_cost_cents, vendor_tax_bps, markup_bps, updated_by)
    select i.id, it.company_id, p_cost_cents, p_tax_bps, p_markup_bps, auth.uid()
      from public.catalog_items i
     where i.company_id = it.company_id and app.price_group(i.attributes) = v_group and i.deleted_at is null
     order by i.id
    on conflict (item_id) do update
      set unit_cost_cents = excluded.unit_cost_cents, vendor_tax_bps = excluded.vendor_tax_bps, markup_bps = excluded.markup_bps,
          updated_at = now(), updated_by = auth.uid()
      where (c.unit_cost_cents, c.vendor_tax_bps, c.markup_bps) is distinct from (excluded.unit_cost_cents, excluded.vendor_tax_bps, excluded.markup_bps);
    get diagnostics n = row_count;
    v_n := v_n + n;
  end if;
  -- the price and the placeholder (an item priced by hand; a counted material keeps the price from its cost — t31)
  update public.catalog_items i
     set unit_price_cents = p_price_cents, is_placeholder_price = coalesce(p_placeholder, i.is_placeholder_price)
   where i.company_id = it.company_id and app.price_group(i.attributes) = v_group and i.deleted_at is null
     and (i.unit_price_cents, i.is_placeholder_price) is distinct from (p_price_cents, coalesce(p_placeholder, i.is_placeholder_price));
  get diagnostics n = row_count;
  v_n := v_n + n;
  perform set_config('app.cost_source', v_was, true);
  return v_n;
end;
$$;
revoke all on function public.catalog_set_group_price(uuid, bigint, boolean, bigint, int, int, bigint, bigint, int, int) from public, anon;
grant execute on function public.catalog_set_group_price(uuid, bigint, boolean, bigint, int, int, bigint, bigint, int, int) to authenticated;
