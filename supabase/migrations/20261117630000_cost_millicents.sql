-- #1926 (spec 53 §8а.12, variant (а″), decided by the audit 17.11): the exact cost of a unit in thousandths of a cent.
-- A supplier prices «$22.50 for 100»: a unit costs 22.5 ¢, which whole cents cannot hold (23 ¢ makes 1000 pcs $5 off).
--   unit_cost_millicents bigint — the truth (22 500 = 22.5 ¢; 4.12 ¢ = 4 120; 1/3 ¢ = 333, error < 0.001 ¢);
--   unit_cost_cents             — stays, the MIRROR old builds read and write: round(millicents / 1000), half up, kept by
--                                 the server (t08). An old phone's echo of the mirror does not wipe the exact cost.
-- The client's price stays whole cents, counted once from the exact cost (app.item_price_millicents).
-- PR 1/4: the catalog — catalog_item_costs, catalog_cost_history, the triggers and functions that copy a cost there.
-- Estimate lines and templates (PR 2/4), purchase orders (3/4) and the phone (4/4) follow; until then they read the mirror.
-- rule16: step 1 — only new columns and new behaviour; nothing renamed or dropped, unit_cost_cents stays as it is.

-- ---- the columns ------------------------------------------------------------------------------------------------------
alter table public.catalog_item_costs add column if not exists unit_cost_millicents bigint;
alter table public.catalog_cost_history add column if not exists unit_cost_millicents bigint;

-- the old rows get their exact value = the cents they had × 1000. Not through the triggers: nothing changed for a person
-- (no history row, no repricing, no «changed today» on every phone). In one block (all or nothing); the table owner runs
-- migrations. rule16: small (catalog_item_costs and catalog_cost_history are not big tables — migrationGuard BIG_TABLES;
-- ALTER TABLE … DISABLE TRIGGER takes a table lock held to the end of the migration's transaction; the phones' writes wait
-- for it, none fails)
do $$
begin
  alter table public.catalog_item_costs disable trigger user;
  update public.catalog_item_costs set unit_cost_millicents = unit_cost_cents * 1000
   where unit_cost_cents is not null and unit_cost_millicents is null;
  alter table public.catalog_item_costs enable trigger user;
  alter table public.catalog_cost_history disable trigger user;
  update public.catalog_cost_history set unit_cost_millicents = unit_cost_cents * 1000
   where unit_cost_cents is not null and unit_cost_millicents is null;
  alter table public.catalog_cost_history enable trigger user;
end $$;

-- the bounds: not below zero, at most $1 000 000 a unit (the mirror's bound × 1000, item_price_server)
alter table public.catalog_item_costs drop constraint if exists catalog_item_costs_millicents_range;
alter table public.catalog_item_costs add constraint catalog_item_costs_millicents_range
  check (unit_cost_millicents between 0 and 100000000000) not valid;
do $$
begin
  if not exists (select 1 from public.catalog_item_costs where unit_cost_millicents not between 0 and 100000000000) then
    alter table public.catalog_item_costs validate constraint catalog_item_costs_millicents_range;
  else
    raise notice 'catalog_item_costs_millicents_range left not valid: % stored cost(s) out of range',
      (select count(*) from public.catalog_item_costs where unit_cost_millicents not between 0 and 100000000000);
  end if;
end $$;

-- a member writes the exact cost as the mirror (RLS: only who sees our costs, catalog_item_costs_insert / _update);
-- the history is written only by the server's triggers (no grant, as before)
grant insert (unit_cost_millicents), update (unit_cost_millicents) on public.catalog_item_costs to authenticated;

-- ---- one formula: the price from the exact cost --------------------------------------------------------------------
-- the engine's catalogPrice({ millicents }) — packages/estimating-engine/test/fixtures/catalogPrice.json «millicents», T450
create or replace function app.item_price_millicents(p_millicents bigint, p_tax_bps int, p_markup_bps int)
returns bigint language sql immutable parallel safe set search_path = '' as $$
  select round(p_millicents::numeric / 1000 * (1 + coalesce(p_tax_bps, 0)::numeric / 10000) * (1 + coalesce(p_markup_bps, 0)::numeric / 10000), 0)::bigint;
$$;
-- called only by the security definer triggers and functions below: nobody else executes it (as app.item_price_cents)
revoke all on function app.item_price_millicents(bigint, int, int) from public, anon, authenticated;

-- ---- t08: who writes the cost — the exact value is the truth, the mirror follows ------------------------------------
-- The contract for a new build (PR 4/4): it sends the exact cost ONLY (catalog_set_item_costs refuses both). A row with an
-- unchanged exact cost and a changed mirror is read as an old build's change (review 1 of #1926, п.4).
-- INSERT: the exact cost sent → the mirror from it; only the mirror (an old build) → exact = mirror × 1000.
-- UPDATE: the exact cost changed → the mirror from it (a mirror sent with it is ignored); else a mirror DIFFERENT from the
-- stored one is an old build's real change → exact = mirror × 1000; the same mirror (an echo of what it read, an old op
-- without «costs») changes nothing — the exact cost stays (spec 53 §8а.12, check 2 Q2).
create or replace function app.tg_cost_millicents()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.unit_cost_millicents is not null then
      new.unit_cost_cents := round(new.unit_cost_millicents::numeric / 1000, 0)::bigint;
    elsif new.unit_cost_cents is not null then
      new.unit_cost_millicents := new.unit_cost_cents * 1000;
    end if;
  elsif new.unit_cost_millicents is distinct from old.unit_cost_millicents then
    new.unit_cost_cents := round(new.unit_cost_millicents::numeric / 1000, 0)::bigint;
  elsif new.unit_cost_cents is distinct from old.unit_cost_cents then
    new.unit_cost_millicents := new.unit_cost_cents * 1000;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_cost_millicents() from public, anon, authenticated;
-- t08: before every other BEFORE trigger of the table (they fire by name), so all of them see the pair agree
drop trigger if exists t08_cost_millicents on public.catalog_item_costs;
create trigger t08_cost_millicents before insert or update on public.catalog_item_costs
  for each row execute function app.tg_cost_millicents();
-- the history: a row the server writes in cents (po_receive, until PR 3/4) gets its thousandths
drop trigger if exists t08_cost_millicents on public.catalog_cost_history;
create trigger t08_cost_millicents before insert or update on public.catalog_cost_history
  for each row execute function app.tg_cost_millicents();

-- ---- t96: the history sees a change of the exact cost (22 500 → 22 600 keeps the mirror 23 ¢) -----------------------
create or replace function app.tg_cost_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  src text := coalesce(nullif(current_setting('app.cost_source', true), ''), 'manual');
begin
  if tg_op = 'INSERT' then
    if new.unit_cost_millicents is null and new.vendor_tax_bps is null then return null; end if;
  elsif new.unit_cost_millicents is not distinct from old.unit_cost_millicents and new.vendor_tax_bps is not distinct from old.vendor_tax_bps then
    return null;
  end if;
  if src not in ('manual', 'import_file', 'ai_scan', 'shelf_tag', 'module', 'supplier_tax') then src := 'manual'; end if;
  insert into public.catalog_cost_history (company_id, item_id, supplier_id, unit_cost_cents, unit_cost_millicents, vendor_tax_bps, source, by)
  select new.company_id, new.item_id, i.supplier_id, new.unit_cost_cents, new.unit_cost_millicents, new.vendor_tax_bps, src, auth.uid()
    from public.catalog_items i where i.id = new.item_id and i.company_id = new.company_id;
  return null;
end;
$$;
revoke all on function app.tg_cost_history() from public, anon, authenticated;

-- ---- t32: the price is counted from the exact cost (a change of it with the same mirror reprices too) ---------------
create or replace function app.tg_item_price_from_cost()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and new.unit_cost_millicents is not distinct from old.unit_cost_millicents
     and new.vendor_tax_bps is not distinct from old.vendor_tax_bps
     and new.markup_bps is not distinct from old.markup_bps then
    return null;  -- an old phone sending the same three numbers changes nothing
  end if;
  -- the upsert of t30 of this very item: t31 counts that row (a flag set by hand at the top level skips nothing)
  if pg_trigger_depth() > 1 and coalesce(current_setting('app.item_costs_moving', true), '') = new.item_id::text then
    perform set_config('app.item_price_due', new.item_id::text, true);
    return null;
  end if;
  perform set_config('app.item_price_due', new.item_id::text, true);
  update public.catalog_items i
     set unit_price_cents = case when new.unit_cost_millicents is null then i.unit_price_cents
                                 else app.item_price_millicents(new.unit_cost_millicents, new.vendor_tax_bps, new.markup_bps) end,
         price_from_cost  = new.unit_cost_millicents is not null
   where i.id = new.item_id and i.company_id = new.company_id and i.kind = 'material' and i.deleted_at is null
     and (i.price_from_cost is distinct from (new.unit_cost_millicents is not null)
          or (new.unit_cost_millicents is not null
              and i.unit_price_cents is distinct from app.item_price_millicents(new.unit_cost_millicents, new.vendor_tax_bps, new.markup_bps)));
  -- not left behind when no row was updated (not a material, in the trash, already right)
  perform set_config('app.item_price_due', '', true);
  return null;
end;
$$;
revoke all on function app.tg_item_price_from_cost() from public, anon, authenticated;

-- ---- the drift check counts from the exact cost too ---------------------------------------------------------------
create or replace function app.catalog_price_drift(p_company uuid)
returns table (item_id uuid, unit_price_cents bigint, formula_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  -- a person must see our costs; a server job (no JWT) may read it
  if auth.uid() is not null and not app.can_view_costs(p_company) then
    raise exception 'only who sees the costs' using errcode = '42501';
  end if;
  return query
    select i.id, i.unit_price_cents::bigint, app.item_price_millicents(c.unit_cost_millicents, c.vendor_tax_bps, c.markup_bps)
      from public.catalog_items i
      join public.catalog_item_costs c on c.company_id = i.company_id and c.item_id = i.id
     where i.company_id = p_company and i.kind = 'material' and i.deleted_at is null and c.unit_cost_millicents is not null
       and i.unit_price_cents is distinct from app.item_price_millicents(c.unit_cost_millicents, c.vendor_tax_bps, c.markup_bps);
end;
$$;
revoke all on function app.catalog_price_drift(uuid) from public, anon, authenticated;

-- ---- the price group (#1913) shares one EXACT cost: the spread, a joining item and the group function carry the thousandths
create or replace function app.spread_group_price(p_company uuid, p_group text, p_from uuid, p_price boolean, p_cost boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  src record;
  k   record;
  v_src text := coalesce(current_setting('app.cost_source', true), '');
  -- the peers' t32 / t31 clear «price due» as they go: the writer's own row still needs it (code review of #1913, Б1)
  v_due text := coalesce(current_setting('app.item_price_due', true), '');
  v_mark text := coalesce(current_setting('app.price_group_spreading', true), '');
begin
  if p_group is null then return; end if;
  select i.unit_price_cents, i.is_placeholder_price into src from public.catalog_items i where i.id = p_from and i.company_id = p_company;
  if not found then return; end if;
  -- what the spread writes is seen as a spread in the history (source «module»), the writer's own row keeps its own source
  perform set_config('app.cost_source', 'module', true);
  -- the rows this spread writes do not spread again (one change — one pass, not n × n: security check S1). The marker
  -- counts only inside a trigger (pg_trigger_depth() > 1 in the triggers below): set by hand at the top level it skips nothing
  perform set_config('app.price_group_spreading', p_company::text || '/' || p_group, true);
  -- the group's rows locked in one order (id): two spreads at once wait, never deadlock each other
  perform 1 from public.catalog_items i
   where i.company_id = p_company and app.price_group(i.attributes) = p_group and i.deleted_at is null
   order by i.id for update;
  if p_cost then
    select c.unit_cost_cents, c.unit_cost_millicents, c.vendor_tax_bps, c.markup_bps into k
      from public.catalog_item_costs c where c.item_id = p_from and c.company_id = p_company;
    if found then
      -- #1926: the group's exact cost, not its mirror × 1000 (t08 counts the mirror from it)
      insert into public.catalog_item_costs as c (item_id, company_id, unit_cost_cents, unit_cost_millicents, vendor_tax_bps, markup_bps, updated_by)
      select i.id, p_company, k.unit_cost_cents, k.unit_cost_millicents, k.vendor_tax_bps, k.markup_bps, auth.uid()
        from public.catalog_items i
       where i.company_id = p_company and app.price_group(i.attributes) = p_group and i.deleted_at is null and i.id <> p_from
       order by i.id
      on conflict (item_id) do update
        set unit_cost_cents = excluded.unit_cost_cents, unit_cost_millicents = excluded.unit_cost_millicents,
            vendor_tax_bps = excluded.vendor_tax_bps, markup_bps = excluded.markup_bps,
            updated_at = now(), updated_by = auth.uid()
        where (c.unit_cost_millicents, c.vendor_tax_bps, c.markup_bps) is distinct from (excluded.unit_cost_millicents, excluded.vendor_tax_bps, excluded.markup_bps);
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
  perform set_config('app.price_group_spreading', v_mark, true);
  perform set_config('app.cost_source', v_src, true);
  perform set_config('app.item_price_due', v_due, true);
end;
$$;
revoke all on function app.spread_group_price(uuid, text, uuid, boolean, boolean) from public, anon, authenticated;

create or replace function app.tg_group_after_cost()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_group text;
begin
  if tg_op = 'UPDATE'
     and (new.unit_cost_millicents, new.vendor_tax_bps, new.markup_bps) is not distinct from (old.unit_cost_millicents, old.vendor_tax_bps, old.markup_bps) then
    return null;
  end if;
  select app.price_group(i.attributes) into v_group from public.catalog_items i
   where i.id = new.item_id and i.company_id = new.company_id and i.deleted_at is null;
  if v_group is null then return null; end if;
  if pg_trigger_depth() > 1 and coalesce(current_setting('app.price_group_spreading', true), '') = new.company_id::text || '/' || v_group then
    return null;
  end if;
  perform app.spread_group_price(new.company_id, v_group, new.item_id, false, true);
  return null;
end;
$$;
revoke all on function app.tg_group_after_cost() from public, anon, authenticated;

create or replace function app.tg_group_after_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_group text := app.price_group(new.attributes); v_peer uuid; k record;
begin
  if v_group is null or new.deleted_at is not null then
    return null;
  end if;
  -- a row written by a spread of this very group: no second pass
  if pg_trigger_depth() > 1 and coalesce(current_setting('app.price_group_spreading', true), '') = new.company_id::text || '/' || v_group then
    return null;
  end if;
  if app.group_joins(tg_op, case when tg_op = 'UPDATE' then old.attributes end, new.attributes,
                     case when tg_op = 'UPDATE' then old.deleted_at end, new.deleted_at) then
    -- joining: the group's cost row into this item (also when its author does not see costs — t30 blanks theirs)
    v_peer := app.group_peer(new.company_id, v_group, new.id);
    if v_peer is null then return null; end if;
    select c.unit_cost_cents, c.unit_cost_millicents, c.vendor_tax_bps, c.markup_bps into k from public.catalog_item_costs c where c.item_id = v_peer and c.company_id = new.company_id;
    if not found then return null; end if;
    -- #1926: the group's exact cost, not its mirror × 1000
    insert into public.catalog_item_costs as c (item_id, company_id, unit_cost_cents, unit_cost_millicents, vendor_tax_bps, markup_bps, updated_by)
    values (new.id, new.company_id, k.unit_cost_cents, k.unit_cost_millicents, k.vendor_tax_bps, k.markup_bps, auth.uid())
    on conflict (item_id) do update
      set unit_cost_cents = excluded.unit_cost_cents, unit_cost_millicents = excluded.unit_cost_millicents,
          vendor_tax_bps = excluded.vendor_tax_bps, markup_bps = excluded.markup_bps,
          updated_at = now(), updated_by = auth.uid()
      where (c.unit_cost_millicents, c.vendor_tax_bps, c.markup_bps) is distinct from (excluded.unit_cost_millicents, excluded.vendor_tax_bps, excluded.markup_bps);
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
  v_before jsonb;
  v_was   text := coalesce(current_setting('app.cost_source', true), '');
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
  select c.unit_cost_cents, c.unit_cost_millicents, c.vendor_tax_bps, c.markup_bps into k from public.catalog_item_costs c
   where c.item_id = it.id and c.company_id = it.company_id;
  -- a group counted from its cost (53-0б): who does not see our costs does not set its price (never a formula back) —
  -- also when they name a hand-priced item of a group that has a counted material (security check S4)
  if not v_costs and exists (select 1 from public.catalog_items i join public.catalog_item_costs c on c.item_id = i.id and c.company_id = i.company_id
                              where i.company_id = it.company_id and app.price_group(i.attributes) = v_group and i.deleted_at is null
                                and i.kind = 'material' and c.unit_cost_cents is not null) then
    raise exception 'the price is counted from the cost' using errcode = '42501', hint = 'price_from_cost';
  end if;
  -- what the phone saw is still there — or someone changed it first: nothing is written, the phone asks the person
  if it.unit_price_cents is distinct from p_expected_price_cents
     or (v_costs and (k.unit_cost_cents, k.vendor_tax_bps, k.markup_bps)
                     is distinct from (p_expected_cost_cents, p_expected_tax_bps, p_expected_markup_bps)) then
    raise exception 'the group''s price changed meanwhile' using errcode = '40001', hint = 'row_version_conflict';
  end if;

  -- each item's price before (the answer counts the items that changed, each against its own)
  select coalesce(jsonb_object_agg(i.id::text, jsonb_build_array(i.unit_price_cents, i.is_placeholder_price)), '{}'::jsonb) into v_before
    from public.catalog_items i
   where i.company_id = it.company_id and app.price_group(i.attributes) = v_group and i.deleted_at is null;
  perform set_config('app.cost_source', 'module', true);
  -- the cost first (who sees it): each material then counts its price from it (t32 / t31)
  if v_costs and (p_cost_cents is not null or p_tax_bps is not null or p_markup_bps is not null) then
    -- #1926: this function's input is cents (every build sends the cost it has, store.tsx «v.costCents ?? prev.costCents»):
    -- no cost, or the named item's own mirror sent back (an echo) — the named item's EXACT cost, not mirror × 1000;
    -- a different mirror is a real change — exact = cents × 1000 (review 1 of #1926, block 1)
    insert into public.catalog_item_costs as c (item_id, company_id, unit_cost_cents, unit_cost_millicents, vendor_tax_bps, markup_bps, updated_by)
    select i.id, it.company_id, coalesce(p_cost_cents, k.unit_cost_cents), case when p_cost_cents is null or p_cost_cents is not distinct from k.unit_cost_cents then k.unit_cost_millicents else p_cost_cents * 1000 end,
           coalesce(p_tax_bps, k.vendor_tax_bps), coalesce(p_markup_bps, k.markup_bps), auth.uid()
      from public.catalog_items i
     where i.company_id = it.company_id and app.price_group(i.attributes) = v_group and i.deleted_at is null
     order by i.id
    -- null = «not sent» (as t30): only the values given change; the rest is the named item's
    on conflict (item_id) do update
      set unit_cost_cents = excluded.unit_cost_cents, unit_cost_millicents = excluded.unit_cost_millicents,
          vendor_tax_bps = excluded.vendor_tax_bps, markup_bps = excluded.markup_bps,
          updated_at = now(), updated_by = auth.uid()
      where (c.unit_cost_millicents, c.vendor_tax_bps, c.markup_bps) is distinct from (excluded.unit_cost_millicents, excluded.vendor_tax_bps, excluded.markup_bps);
  end if;
  -- the price and the placeholder (an item priced by hand; a counted material keeps the price from its cost — t31)
  update public.catalog_items i
     set unit_price_cents = p_price_cents, is_placeholder_price = coalesce(p_placeholder, i.is_placeholder_price)
   where i.company_id = it.company_id and app.price_group(i.attributes) = v_group and i.deleted_at is null
     and (i.unit_price_cents, i.is_placeholder_price) is distinct from (p_price_cents, coalesce(p_placeholder, i.is_placeholder_price));
  -- the answer: the items whose price or placeholder is different now than before the call (not the rows touched)
  select count(*) into v_n from public.catalog_items i
   where i.company_id = it.company_id and app.price_group(i.attributes) = v_group and i.deleted_at is null
     and v_before ? i.id::text
     and jsonb_build_array(i.unit_price_cents, i.is_placeholder_price) is distinct from v_before -> i.id::text;
  perform set_config('app.cost_source', v_was, true);
  return v_n;
end;
$$;
revoke all on function public.catalog_set_group_price(uuid, bigint, boolean, bigint, int, int, bigint, bigint, int, int) from public, anon;
grant execute on function public.catalog_set_group_price(uuid, bigint, boolean, bigint, int, int, bigint, bigint, int, int) to authenticated;

create or replace function public.catalog_set_item_costs(p_item_id uuid, p_costs jsonb, p_seen jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  it    public.catalog_items;
  k     record;
  v_key text;
  v_now jsonb;
  v_cost bigint; v_milli bigint; v_tax int; v_markup int;
  v_exact boolean := p_costs ? 'unit_cost_millicents';
begin
  if p_costs is null or jsonb_typeof(p_costs) <> 'object' or p_costs = '{}'::jsonb
     or exists (select 1 from jsonb_object_keys(p_costs) x where x not in ('unit_cost_cents', 'unit_cost_millicents', 'vendor_tax_bps', 'markup_bps')) then
    raise exception 'costs: one or more of unit_cost_cents | unit_cost_millicents, vendor_tax_bps, markup_bps' using errcode = '22023';
  end if;
  -- #1926: the exact cost or the mirror, never both (which one would win is not the phone's to guess)
  if p_costs ? 'unit_cost_cents' and v_exact then
    raise exception 'costs: unit_cost_cents or unit_cost_millicents, not both' using errcode = '22023';
  end if;
  if v_exact and jsonb_typeof(p_costs -> 'unit_cost_millicents') not in ('number', 'null') then
    raise exception 'costs: unit_cost_millicents is a whole number' using errcode = '22023';
  end if;
  if p_seen is not null and jsonb_typeof(p_seen) <> 'object' then
    raise exception 'seen: an object' using errcode = '22023';
  end if;
  -- rights first, then locks (nobody else's item is ever locked by a call that is refused)
  select * into it from public.catalog_items i where i.id = p_item_id and i.deleted_at is null;
  if it.id is null or not app.is_staff(it.company_id) then
    raise exception 'catalog item not found' using errcode = 'P0002';
  end if;
  if not app.can_view_costs(it.company_id) then
    raise exception 'our costs are not this person''s to change' using errcode = '42501', hint = 'no_costs';
  end if;
  -- locked as catalog_set_group_price does: an item of a price group — the whole group in one order (id), since the cost
  -- spreads to it (t98); else the item alone. Two writers of one item, one group, or a group price at once wait, never deadlock
  if app.price_group(it.attributes) is not null then
    perform 1 from public.catalog_items i
     where i.company_id = it.company_id and app.price_group(i.attributes) = app.price_group(it.attributes) and i.deleted_at is null
     order by i.id for update;
  else
    perform 1 from public.catalog_items i where i.id = it.id for update;
  end if;
  select * into it from public.catalog_items i where i.id = p_item_id and i.deleted_at is null;
  if it.id is null then
    raise exception 'catalog item not found' using errcode = 'P0002';
  end if;
  select c.unit_cost_cents, c.unit_cost_millicents, c.vendor_tax_bps, c.markup_bps into k
    from public.catalog_item_costs c where c.item_id = it.id and c.company_id = it.company_id for update;
  v_now := jsonb_build_object('unit_cost_cents', k.unit_cost_cents, 'unit_cost_millicents', k.unit_cost_millicents,
                              'vendor_tax_bps', k.vendor_tax_bps, 'markup_bps', k.markup_bps);
  -- what the phone saw is still there, field by field — or someone changed it first: nothing is written. A field that
  -- already holds the value sent counts as matching: the same call again (its answer lost, the queue retries) or a
  -- group peer the spread already wrote (a batch over one price group) is no conflict (code review of #1958 №1, №2)
  for v_key in select jsonb_object_keys(p_costs) loop
    if (v_now -> v_key) is distinct from coalesce(p_seen -> v_key, 'null'::jsonb)
       and (v_now -> v_key) is distinct from (p_costs -> v_key) then
      raise exception 'the item''s cost changed meanwhile' using errcode = '40001', hint = 'row_version_conflict';
    end if;
  end loop;
  v_cost   := case when p_costs ? 'unit_cost_cents' then (p_costs ->> 'unit_cost_cents')::bigint else k.unit_cost_cents end;
  -- the exact cost sent: it, the mirror is t08's; else what is stored (t08 keeps it when the mirror is the same)
  v_milli  := case when v_exact then (p_costs ->> 'unit_cost_millicents')::bigint else k.unit_cost_millicents end;
  if v_exact then v_cost := round(v_milli::numeric / 1000, 0)::bigint; end if;
  v_tax    := case when p_costs ? 'vendor_tax_bps'  then (p_costs ->> 'vendor_tax_bps')::int     else k.vendor_tax_bps end;
  v_markup := case when p_costs ? 'markup_bps'      then (p_costs ->> 'markup_bps')::int         else k.markup_bps end;
  -- «a checked write» of THIS item for the triggers of the side table: one that would change what was sent (a supplier's
  -- tax over the item's — #1834) refuses it with a hint instead of keeping its own value silently, as it does for old
  -- builds (rule 16). The item's id, not «on»: the group spread (t98) writes the other items of the group inside this
  -- statement, and they keep each its own supplier's tax quietly. Taken off right after.
  perform set_config('app.costs_checked_write', it.id::text, true);
  -- the mirror path (an old build): the stored exact cost is passed through unchanged, so t08 keeps it when the mirror is
  -- the same and replaces it (mirror × 1000) when the mirror changed. A new item row: t08 fills the exact cost from the mirror.
  insert into public.catalog_item_costs as c (item_id, company_id, unit_cost_cents, unit_cost_millicents, vendor_tax_bps, markup_bps, updated_by)
  values (it.id, it.company_id, v_cost, case when v_exact then v_milli end, v_tax, v_markup, auth.uid())
  on conflict (item_id) do update
    set unit_cost_cents = excluded.unit_cost_cents,
        unit_cost_millicents = case when v_exact then excluded.unit_cost_millicents else c.unit_cost_millicents end,
        vendor_tax_bps = excluded.vendor_tax_bps, markup_bps = excluded.markup_bps,
        updated_at = now(), updated_by = auth.uid()
    where (case when v_exact then c.unit_cost_millicents else c.unit_cost_cents end, c.vendor_tax_bps, c.markup_bps)
          is distinct from (case when v_exact then excluded.unit_cost_millicents else excluded.unit_cost_cents end, excluded.vendor_tax_bps, excluded.markup_bps);
  perform set_config('app.costs_checked_write', '', true);
end;
$$;
revoke all on function public.catalog_set_item_costs(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.catalog_set_item_costs(uuid, jsonb, jsonb) to authenticated;

-- ---- t31: the price an item row gets (an old phone's save, a kind change, back from the trash) — from the exact cost --
create or replace function app.tg_item_price()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_due    boolean := false;
  k        record;
  v_price  bigint;
  v_can    boolean;
  v_sent   boolean;
  v_other  boolean;
  v_echo   boolean;
begin
  -- the flag first, before any return: a later row of the same command or transaction must not inherit it
  if tg_op = 'UPDATE' then
    v_due := coalesce(current_setting('app.item_price_due', true), '') = old.id::text;
  end if;
  perform set_config('app.item_price_due', '', true);

  -- #1965: an author without our costs does not turn a counted material into another kind (the lock is not got round)
  -- by the cost itself, not price_from_cost: the flag is not re-counted in the Trash (check of #1965). A kind-only change is
  -- dropped without a note (only a sent price is noted, below)
  if tg_op = 'UPDATE' and old.kind = 'material' and new.kind is distinct from 'material'
     and auth.uid() is not null and not app.can_view_costs(new.company_id)
     and exists (select 1 from public.catalog_item_costs c
                  where c.item_id = old.id and c.company_id = new.company_id and c.unit_cost_cents is not null) then
    new.kind := old.kind;
  end if;
  -- a new row has no cost row yet (t95 moves the cost with an update of the row, and that update counts the price)
  if tg_op = 'INSERT' or new.kind is distinct from 'material' then
    new.price_from_cost := false;
    return new;
  end if;
  select c.unit_cost_cents, c.unit_cost_millicents, c.vendor_tax_bps, c.markup_bps into k
    from public.catalog_item_costs c where c.item_id = old.id and c.company_id = new.company_id;
  new.price_from_cost := k.unit_cost_cents is not null;
  -- no cost: the price is the hand price; in the trash: not counted (it comes back counted, below)
  if k.unit_cost_cents is null or new.deleted_at is not null then
    return new;
  end if;

  -- #1926: from the exact cost (t08 keeps the mirror unit_cost_cents in step with it: null together)
  v_price := app.item_price_millicents(k.unit_cost_millicents, k.vendor_tax_bps, k.markup_bps);
  v_can   := auth.uid() is null or app.can_view_costs(new.company_id);
  -- a null price is no «sent price»: the item's own not null refuses the row (never an error of the note below)
  v_sent  := new.unit_price_cents is not null and new.unit_price_cents is distinct from old.unit_price_cents;
  v_other := v_sent or old.kind is distinct from 'material' or (old.deleted_at is not null and new.deleted_at is null);
  if not (v_due or v_other) then
    return new;  -- a rename, a photo, a code: an off-formula price stays (spec 53 §5.3б п.2)
  end if;

  -- a price the client sent and the server replaces: noted for the office, unless it is a stale echo (an old phone sends
  -- its whole cached row: the sent price is the price this item had before its last change)
  if v_sent and new.unit_price_cents is distinct from (case when v_can then v_price else old.unit_price_cents end) then
    select exists (
      select 1 from (select h.prev_unit_price_cents from public.catalog_price_history h
                      where h.company_id = new.company_id and h.item_id = old.id and h.unit_price_cents is not null
                      order by h.at desc, h.id desc limit 1) last
       where last.prev_unit_price_cents = new.unit_price_cents) into v_echo;
    -- the same price sent again by the same person is one note (a phone retrying, or saving again and again)
    if not v_echo and not exists (
         select 1 from (select r.sent_price_cents, r.by from public.catalog_price_recalc r
                         where r.company_id = new.company_id and r.item_id = old.id
                         order by r.at desc, r.id desc limit 1) last
          where last.sent_price_cents = new.unit_price_cents and last.by is not distinct from auth.uid()) then
      -- the FK is on old.id: a client that changes the id and sends a price fails its own save, nothing else
      insert into public.catalog_price_recalc (company_id, item_id, sent_price_cents, server_price_cents, by)
      values (new.company_id, old.id, new.unit_price_cents,
              case when v_can then v_price else old.unit_price_cents end, auth.uid());
    end if;
  end if;

  -- the formula only for an author who sees our costs (or none: a migration, a server job). The «price due» flag never
  -- grants it: t30 and t32 run for such an author anyway, so a forged flag gives a non-viewer nothing (security check)
  if v_can then
    new.unit_price_cents := v_price;
  else
    -- without our costs the author never gets the formula back (check 2, Б1): the price stays as it was
    new.unit_price_cents := old.unit_price_cents;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_item_price() from public, anon, authenticated;
