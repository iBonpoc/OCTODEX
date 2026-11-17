-- #1834 (spec 54 §3 п.2, §4 №2, §13; К1, этап 1): the supplier's purchase tax lives at the supplier, on the SERVER.
-- Before: pickSupplier copied suppliers.purchase_tax_bps into the item's own vendor_tax_bps; a changed rate at the supplier left
-- every item on the old one («Применить к N позициям» was a hand-made glue on the phone), and a supplier without a rate left the
-- rate of the previous supplier on the item.
--
-- Rule 16, step 1 — only additions; the copying in the app is removed in a later PR (step 2) when no app version reads it:
--   * public.supplier_set_tax(p_supplier, p_tax_bps, p_seen_bps) — the one place that changes the rate. The rate the phone saw
--     must still be the stored one (else 40001, nothing changed); then the supplier's rate and the rate of every one of its items
--     (catalog_item_costs.vendor_tax_bps) change in one transaction; t32 reprices the materials, the history gets a row per item
--     (source 'supplier_tax'). Who may: app.is_staff and app.can_view_costs — the one rule of «who sees our costs» (#1837).
--     Lock order: the supplier → its catalog_items (by id) → their catalog_item_costs (by item_id), as the planned
--     catalog_set_item_costs («Прайс», #1958). A direct write of a cost row (an old phone) locks cost → item (t32), the other way
--     round: the loser gets 40P01 and the queue repeats it; data are never damaged.
--   * the rate has ONE writer: t14_supplier_tax_door (before update on suppliers) gives back the old rate when a phone changes it
--     any other way than through public.supplier_set_tax (a transaction flag only the function sets). An old phone's whole-row upsert
--     with a stale rate can neither change nor roll back the rate (the same trouble as #1958); the rest of its row is saved as before.
--     A new supplier made with a rate (insert) is as it was — it has no items yet. A server writer (no JWT) is as it was.
--   * t95_supplier_tax_moves (after update of purchase_tax_bps on suppliers): the rate moves to the supplier's items — only for
--     a server writer or a person who sees our costs (a phone's change is already stopped by t14, and suppliers_update is
--     owner/admin/office; this is a second wall).
--   * t13_tax_follows_supplier (before insert or update on catalog_item_costs): an item WITH a supplier that has a rate always
--     has that rate in its costs. An old phone's own rate (sent straight to catalog_item_costs, or through catalog_items where t30
--     moves it into this table) is brought back to the supplier's: one guard catches both paths.
--   * t94_item_supplier_tax (after update of supplier_id on catalog_items): an item that gets a supplier with a rate takes it.
--     A supplier without a rate leaves the item's own rate (the phone asks the person what to do — spec 54 §4 №2).
--   * catalog_cost_history.source gets 'supplier_tax' (a new value of a check, as 'receipt' in 20261116090000).
-- Not here: the price of a draft estimate (В5, the founder's question — drafts do not change); signed and sent documents are
-- snapshots and never change.

-- ---- the history: a new source ------------------------------------------------------------------------------------------
-- rule16: small (a check widened by one value, as 'receipt' in 20261116090000; one scan, no rewrite)
alter table public.catalog_cost_history drop constraint if exists catalog_cost_history_source_check;
alter table public.catalog_cost_history add constraint catalog_cost_history_source_check
  check (source in ('manual', 'initial', 'import_file', 'ai_scan', 'shelf_tag', 'module', 'receipt', 'supplier_tax'));

-- the same body as 20261110000000_suppliers.sql, the whitelist knows the new source (a phone cannot set app.cost_source)
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
  if src not in ('manual', 'import_file', 'ai_scan', 'shelf_tag', 'module', 'supplier_tax') then src := 'manual'; end if;
  insert into public.catalog_cost_history (company_id, item_id, supplier_id, unit_cost_cents, vendor_tax_bps, source, by)
  select new.company_id, new.item_id, i.supplier_id, new.unit_cost_cents, new.vendor_tax_bps, src, auth.uid()
    from public.catalog_items i where i.id = new.item_id and i.company_id = new.company_id;
  return null;
end;
$$;
revoke all on function app.tg_cost_history() from public, anon, authenticated;

-- ---- t13: an item with a supplier that has a rate has that rate ----------------------------------------------------------
create or replace function app.tg_tax_follows_supplier()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_bps int;
begin
  select s.purchase_tax_bps into v_bps
    from public.catalog_items i
    join public.suppliers s on s.company_id = i.company_id and s.id = i.supplier_id
   where i.id = new.item_id and i.company_id = new.company_id and s.deleted_at is null;
  if v_bps is not null then
    new.vendor_tax_bps := v_bps;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_tax_follows_supplier() from public, anon, authenticated;
drop trigger if exists t13_tax_follows_supplier on public.catalog_item_costs;
create trigger t13_tax_follows_supplier before insert or update on public.catalog_item_costs
  for each row execute function app.tg_tax_follows_supplier();

-- ---- t94: an item that gets a supplier with a rate takes the rate ---------------------------------------------------------
create or replace function app.tg_item_supplier_tax()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_bps int;
begin
  if new.supplier_id is null then return null; end if;
  select s.purchase_tax_bps into v_bps from public.suppliers s
   where s.company_id = new.company_id and s.id = new.supplier_id and s.deleted_at is null;
  if v_bps is null then return null; end if;
  -- the guard t13 brings the rate; an update that changes nothing is not made (no history row, no repricing)
  update public.catalog_item_costs k set vendor_tax_bps = v_bps
   where k.item_id = new.id and k.company_id = new.company_id and k.vendor_tax_bps is distinct from v_bps;
  return null;
end;
$$;
revoke all on function app.tg_item_supplier_tax() from public, anon, authenticated;
drop trigger if exists t94_item_supplier_tax on public.catalog_items;
create trigger t94_item_supplier_tax after update of supplier_id on public.catalog_items
  for each row when (old.supplier_id is distinct from new.supplier_id)
  execute function app.tg_item_supplier_tax();

-- ---- t14: the rate has one writer ---------------------------------------------------------------------------------------
create or replace function app.tg_supplier_tax_door()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.purchase_tax_bps is distinct from old.purchase_tax_bps
     and auth.uid() is not null
     and coalesce(current_setting('app.supplier_tax_door', true), '') <> 'on' then
    new.purchase_tax_bps := old.purchase_tax_bps;  -- the old phone's rate is not saved: «update the app» (a debt task, #1834)
  end if;
  return new;
end;
$$;
revoke all on function app.tg_supplier_tax_door() from public, anon, authenticated;
drop trigger if exists t14_supplier_tax_door on public.suppliers;
create trigger t14_supplier_tax_door before update on public.suppliers
  for each row execute function app.tg_supplier_tax_door();

-- ---- t95: the supplier's rate moves to its items, on the server ---------------------------------------------------------------
-- Lock order: the supplier (the update that fired this) → its catalog_items (by id) → their catalog_item_costs (by item_id).
-- One supplier with more than 1000 items is refused (a statement_timeout of the role would kill it halfway and block the queue).
create or replace function app.tg_supplier_tax_moves()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_n int := 0;
  v_src text := coalesce(current_setting('app.cost_source', true), '');
begin
  perform set_config('app.supplier_tax_moved', '0', true);
  -- a supplier left without a rate or in the trash: the items keep their own (the phone asks the person)
  if new.purchase_tax_bps is null or new.deleted_at is not null then
    return null;
  end if;
  -- second wall: nobody moves costs who does not see them (a server writer has no JWT)
  if auth.uid() is not null and not app.can_view_costs(new.company_id) then
    return null;
  end if;
  select coalesce(array_agg(x.id order by x.id), '{}') into v_ids from (
    select i.id from public.catalog_items i
     where i.company_id = new.company_id and i.supplier_id = new.id order by i.id for update) x;
  if cardinality(v_ids) > 1000 then
    raise exception 'too many items for one supplier tax change' using errcode = '54000', hint = 'supplier_tax_too_many';
  end if;
  perform 1 from public.catalog_item_costs k
   where k.company_id = new.company_id and k.item_id = any (v_ids) order by k.item_id for update;
  perform set_config('app.cost_source', 'supplier_tax', true);
  update public.catalog_item_costs k set vendor_tax_bps = new.purchase_tax_bps
   where k.company_id = new.company_id and k.item_id = any (v_ids) and k.vendor_tax_bps is distinct from new.purchase_tax_bps;
  get diagnostics v_n = row_count;
  perform set_config('app.cost_source', v_src, true);  -- what a server writer set before us stays
  perform set_config('app.supplier_tax_moved', v_n::text, true);
  return null;
end;
$$;
revoke all on function app.tg_supplier_tax_moves() from public, anon, authenticated;
drop trigger if exists t95_supplier_tax_moves on public.suppliers;
create trigger t95_supplier_tax_moves after update of purchase_tax_bps on public.suppliers
  for each row when (old.purchase_tax_bps is distinct from new.purchase_tax_bps)
  execute function app.tg_supplier_tax_moves();

-- ---- the strict door: what the phone saw must be what is stored ------------------------------------------------------------
create or replace function public.supplier_set_tax(p_supplier uuid, p_tax_bps int, p_seen_bps int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
  s public.suppliers;
begin
  if p_tax_bps is not null and p_tax_bps not between 0 and 10000 then
    raise exception 'tax: 0..10000 basis points' using errcode = '22023';
  end if;
  -- the right is checked BEFORE a lock is taken (nobody blocks another company's row by a guessed id)
  select company_id into v_company from public.suppliers where id = p_supplier and deleted_at is null;
  if v_company is null or not (app.is_staff(v_company) and app.can_view_costs(v_company)) then
    raise exception 'supplier not found' using errcode = 'P0002';
  end if;
  -- the supplier locked first (the order: supplier → items → costs; the moving is t95). NO KEY UPDATE: a phone that changes the
  -- supplier of an item takes FOR KEY SHARE on this row (the foreign key) and would wait crosswise with FOR UPDATE
  select * into s from public.suppliers where id = p_supplier and deleted_at is null for no key update;
  if s.id is null then
    raise exception 'supplier not found' using errcode = 'P0002';
  end if;
  -- the phone saw another rate than the stored one: nothing changes, it reads again and asks (two offices, one supplier)
  if p_seen_bps is distinct from s.purchase_tax_bps then
    raise exception 'the supplier''s tax changed meanwhile' using errcode = '40001', hint = 'row_version_conflict';
  end if;
  if p_tax_bps is not distinct from s.purchase_tax_bps then
    return 0;
  end if;
  perform set_config('app.supplier_tax_moved', '0', true);
  perform set_config('app.supplier_tax_door', 'on', true);
  update public.suppliers set purchase_tax_bps = p_tax_bps where id = s.id;
  perform set_config('app.supplier_tax_door', '', true);
  return coalesce(nullif(current_setting('app.supplier_tax_moved', true), ''), '0')::int;
end;
$$;
revoke all on function public.supplier_set_tax(uuid, int, int) from public, anon;
grant execute on function public.supplier_set_tax(uuid, int, int) to authenticated;
