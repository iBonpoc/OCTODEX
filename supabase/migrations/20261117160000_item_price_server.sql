-- #1807 (53-0б, spec 53 §5.3б): the server counts a material's price from its cost. K1, zone (б).
--
-- Until now only the phone counted a material's price (catalogPrice of @octo/estimating-engine) and sent it: a phone that
-- changed the markup sent a price counted from an old cost while another phone (or a price import) had changed the cost —
-- the stored price no longer followed the cost. Now, for a material with a cost in catalog_item_costs:
--   unit_price_cents = app.item_price_cents(cost, supplier tax, markup)  — the engine's catalogPrice, one rounding.
--
-- Rule 8 exception (written here and in spec 19): the formula lives in the database too; it must equal the engine on the
-- shared set of examples packages/estimating-engine/test/fixtures/catalogPrice.json (engine test + T322).
--
-- Where it is counted (spec 53 §5.3б п.2):
--   * t31_item_price  — BEFORE INSERT OR UPDATE on catalog_items (after t30 by name). Counts when the cost REALLY changed in
--     this command (flag app.item_price_due set by t32), when the client sent another price, when the kind became material,
--     when the item came back from the trash. A rename keeps an off-formula price (§5.3б п.2).
--     An author without app.can_view_costs never gets the formula back (§5.3б Б1 of check 2): the old price stays.
--     A client price that is replaced is noted in catalog_price_recalc (not a stale echo of an old phone).
--     price_from_cost is set by the server only: a material with a cost.
--   * t32_item_price_from_cost — AFTER INSERT OR UPDATE on catalog_item_costs: a real change of the cost, tax or markup
--     written directly (new phone, a price import) re-counts the item; written by t30 of the same item (flag
--     app.item_costs_moving AND a nested trigger) it only raises app.item_price_due — the price of that row is t31's
--     (an update of the row from here would be error 27000). Flags set by hand do nothing: t32 skips only inside a trigger,
--     and t30 wipes a «price due» flag at the top of a client's own command.
--   * t97_price_history — without a column list: a price set by t31 in a command that did not list the price is logged too.
-- Only materials: labor and service keep their hand price until spec 55 (markup_mode, 55-0б); a kit's price is 0 here and
-- counted on the phone from its parts.
-- Rule 16: only additions (a column, a table, a check, functions and triggers); old phones neither read nor write the new
-- column / table; what they send is handled above.

-- ---- the formula ----------------------------------------------------------------------------------------------------
-- numeric only (no integer division); round(numeric) rounds half away from zero = the engine's half up for prices ≥ 0
create or replace function app.item_price_cents(p_cost bigint, p_tax_bps int, p_markup_bps int)
returns bigint language sql immutable parallel safe set search_path = '' as $$
  select round(p_cost::numeric * (1 + coalesce(p_tax_bps, 0)::numeric / 10000) * (1 + coalesce(p_markup_bps, 0)::numeric / 10000), 0)::bigint;
$$;
-- called only by the security definer triggers and functions below (check 2, N1): nobody else executes it
revoke all on function app.item_price_cents(bigint, int, int) from public, anon, authenticated;

-- a cost has an upper bound ($1 000 000 a unit): the formula stays far from bigint (check 2, N4)
alter table public.catalog_item_costs drop constraint if exists catalog_item_costs_cost_max;
alter table public.catalog_item_costs add constraint catalog_item_costs_cost_max check (unit_cost_cents <= 100000000) not valid;
alter table public.catalog_item_costs validate constraint catalog_item_costs_cost_max;

-- ---- price_from_cost: «the price is counted from the cost» (readable by every member; no cost in it) -------------------
alter table public.catalog_items add column if not exists price_from_cost boolean not null default false;

-- ---- catalog_price_recalc: a price a client sent and the server replaced (old builds; the office is told) ------------
create table if not exists public.catalog_price_recalc (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies (id),
  item_id            uuid not null,
  sent_price_cents   bigint not null,
  server_price_cents bigint not null,
  by                 uuid,
  at                 timestamptz not null default now(),
  foreign key (company_id, item_id) references public.catalog_items (company_id, id) on delete cascade
);
revoke all on public.catalog_price_recalc from anon, authenticated;
create index if not exists catalog_price_recalc_item_idx on public.catalog_price_recalc (company_id, item_id, at desc);  -- a new table
drop trigger if exists t11_company_id_immutable on public.catalog_price_recalc;
create trigger t11_company_id_immutable before update on public.catalog_price_recalc
  for each row execute function app.tg_company_id_immutable();
alter table public.catalog_price_recalc enable row level security;
alter table public.catalog_price_recalc force row level security;
grant select on public.catalog_price_recalc to authenticated;
drop policy if exists catalog_price_recalc_select on public.catalog_price_recalc;
create policy catalog_price_recalc_select on public.catalog_price_recalc for select to authenticated
  using (app.can_view_costs(company_id));
-- no insert / update / delete policy and no grant: only t31 (security definer) writes it

-- ---- t30: the cost a phone sends on the item — now with the «moving» flag around its upsert --------------------------
create or replace function app.tg_catalog_costs_move()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- #1807: a client's own command (depth 1) never carries a «price due» flag in: one set by hand is wiped here, before t31
  -- reads it (t30 always runs before t31). t32's nested update (depth 2) keeps its own flag.
  if pg_trigger_depth() = 1 then
    perform set_config('app.item_price_due', '', true);
  end if;
  -- moved only for who may set costs (sales without view_costs edit the price list but not our costs: just blanked);
  -- a migration (no JWT) moves what is stored. old.id: the key of the row as it is (an id change cannot aim elsewhere).
  if (new.unit_cost_cents is not null or new.vendor_tax_bps is not null or new.markup_bps is not null)
     and (auth.uid() is null or app.can_view_costs(new.company_id)) then
    -- #1807: t32 of this upsert must not update this very row (27000) — it raises app.item_price_due for t31 instead
    perform set_config('app.item_costs_moving', old.id::text, true);
    insert into public.catalog_item_costs as k (item_id, company_id, unit_cost_cents, vendor_tax_bps, markup_bps, updated_by)
    values (old.id, new.company_id, new.unit_cost_cents, new.vendor_tax_bps, new.markup_bps, auth.uid())
    on conflict (item_id) do update
      set unit_cost_cents = coalesce(excluded.unit_cost_cents, k.unit_cost_cents),
          vendor_tax_bps  = coalesce(excluded.vendor_tax_bps, k.vendor_tax_bps),
          markup_bps      = coalesce(excluded.markup_bps, k.markup_bps),
          updated_at      = now(), updated_by = auth.uid();
    perform set_config('app.item_costs_moving', '', true);
  end if;
  new.unit_cost_cents := null;
  new.vendor_tax_bps  := null;
  new.markup_bps      := null;
  return new;
end;
$$;
revoke all on function app.tg_catalog_costs_move() from public, anon, authenticated;

-- ---- t31: the price of a material counted on the row itself ----------------------------------------------------------
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

  -- a new row has no cost row yet (t95 moves the cost with an update of the row, and that update counts the price)
  if tg_op = 'INSERT' or new.kind is distinct from 'material' then
    new.price_from_cost := false;
    return new;
  end if;
  select c.unit_cost_cents, c.vendor_tax_bps, c.markup_bps into k
    from public.catalog_item_costs c where c.item_id = old.id and c.company_id = new.company_id;
  new.price_from_cost := k.unit_cost_cents is not null;
  -- no cost: the price is the hand price; in the trash: not counted (it comes back counted, below)
  if k.unit_cost_cents is null or new.deleted_at is not null then
    return new;
  end if;

  v_price := app.item_price_cents(k.unit_cost_cents, k.vendor_tax_bps, k.markup_bps);
  v_can   := auth.uid() is null or app.can_view_costs(new.company_id);
  v_sent  := new.unit_price_cents is distinct from old.unit_price_cents;
  v_other := v_sent or old.kind is distinct from 'material' or (old.deleted_at is not null and new.deleted_at is null);
  if not (v_due or v_other) then
    return new;  -- a rename, a photo, a code: an off-formula price stays (spec 53 §5.3б п.2)
  end if;

  -- a price the client sent and the server replaces: noted for the office, unless it is a stale echo (an old phone sends
  -- its whole cached row: the sent price is the price this item had before its last change)
  if v_sent and new.unit_price_cents is distinct from (case when v_due or v_can then v_price else old.unit_price_cents end) then
    select exists (
      select 1 from (select h.prev_unit_price_cents from public.catalog_price_history h
                      where h.company_id = new.company_id and h.item_id = old.id and h.unit_price_cents is not null
                      order by h.at desc, h.id desc limit 1) last
       where last.prev_unit_price_cents = new.unit_price_cents) into v_echo;
    if not v_echo then
      insert into public.catalog_price_recalc (company_id, item_id, sent_price_cents, server_price_cents, by)
      values (new.company_id, old.id, new.unit_price_cents,
              case when v_due or v_can then v_price else old.unit_price_cents end, auth.uid());
    end if;
  end if;

  if v_due or v_can then
    new.unit_price_cents := v_price;
  else
    -- without our costs the author never gets the formula back (check 2, Б1): the price stays as it was
    new.unit_price_cents := old.unit_price_cents;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_item_price() from public, anon, authenticated;
drop trigger if exists t31_item_price on public.catalog_items;
create trigger t31_item_price before insert or update on public.catalog_items
  for each row execute function app.tg_item_price();

-- ---- t32: a cost written directly re-counts the item -----------------------------------------------------------------
create or replace function app.tg_item_price_from_cost()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and new.unit_cost_cents is not distinct from old.unit_cost_cents
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
     set unit_price_cents = case when new.unit_cost_cents is null then i.unit_price_cents
                                 else app.item_price_cents(new.unit_cost_cents, new.vendor_tax_bps, new.markup_bps) end,
         price_from_cost  = new.unit_cost_cents is not null
   where i.id = new.item_id and i.company_id = new.company_id and i.kind = 'material' and i.deleted_at is null
     and (i.price_from_cost is distinct from (new.unit_cost_cents is not null)
          or (new.unit_cost_cents is not null
              and i.unit_price_cents is distinct from app.item_price_cents(new.unit_cost_cents, new.vendor_tax_bps, new.markup_bps)));
  -- not left behind when no row was updated (not a material, in the trash, already right)
  perform set_config('app.item_price_due', '', true);
  return null;
end;
$$;
revoke all on function app.tg_item_price_from_cost() from public, anon, authenticated;
drop trigger if exists t32_item_price_from_cost on public.catalog_item_costs;
create trigger t32_item_price_from_cost after insert or update on public.catalog_item_costs
  for each row execute function app.tg_item_price_from_cost();

-- ---- t97: every price change is logged, also one set by t31 in a command without the price column ----------------------
drop trigger if exists t97_price_history on public.catalog_items;
create trigger t97_price_history after update on public.catalog_items
  for each row when (old.unit_price_cents is distinct from new.unit_price_cents)
  execute function app.tg_price_history();

-- ---- the list of off-formula prices (for 55-1; only who sees our costs) ----------------------------------------------
create or replace function app.catalog_price_drift(p_company uuid)
returns table (item_id uuid, unit_price_cents bigint, formula_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.can_view_costs(p_company) then
    raise exception 'only who sees the costs' using errcode = '42501';
  end if;
  return query
    select i.id, i.unit_price_cents::bigint, app.item_price_cents(c.unit_cost_cents, c.vendor_tax_bps, c.markup_bps)
      from public.catalog_items i
      join public.catalog_item_costs c on c.company_id = i.company_id and c.item_id = i.id
     where i.company_id = p_company and i.kind = 'material' and i.deleted_at is null and c.unit_cost_cents is not null
       and i.unit_price_cents is distinct from app.item_price_cents(c.unit_cost_cents, c.vendor_tax_bps, c.markup_bps);
end;
$$;
revoke all on function app.catalog_price_drift(uuid) from public, anon;
grant execute on function app.catalog_price_drift(uuid) to authenticated;

-- ---- what is stored: price_from_cost of every material with a cost (prices are NOT re-counted: an off-formula price
-- stays until its cost changes, §5.3б п.2) ------------------------------------------------------------------------------
-- with the table's own triggers off, in one block (all or nothing): only this flag is set — no updated_at / row_version
-- bump (an item would look «changed today»), no vendor rewrite by t20, no price row. The table owner runs migrations
-- (no superuser needed, unlike session_replication_role); the lock is held for this one small update.
do $$
begin
  alter table public.catalog_items disable trigger user;
  update public.catalog_items i set price_from_cost = true
   where i.kind = 'material' and not i.price_from_cost
     and exists (select 1 from public.catalog_item_costs c where c.company_id = i.company_id and c.item_id = i.id and c.unit_cost_cents is not null);
  alter table public.catalog_items enable trigger user;
end $$;
