-- #1836 (spec 54 §4 №4, К2 → К1 by the audit's list 16.11): receiving a supplier order writes the price actually paid
-- into the item's cost history. Until now po_receive changed only received_qty and the status: the cost history never saw
-- what was bought and for how much.
--
-- What changes:
--   * catalog_cost_history: a new source 'receipt' and a new nullable column po_line_id (which order line wrote the row);
--     one 'receipt' row per order line at most (a unique partial index) — a repeat of the same marking, or a tick taken
--     back and put again, writes nothing new;
--   * po_receive: when a line with a catalog item and a cost goes from nothing received to something received, one row:
--     the order's supplier, the cost per the item's own unit (the line's cost is a pack: ÷ pack_size, rounded UP to the
--     cent — the founder 16.11, #1849: «0,79 цента → 1 цент»), the item's current supplier tax, source 'receipt'.
-- What does NOT change: the item's own cost (catalog_item_costs) — whether a receipt updates it is the founder's question
-- В8 (#1832); until the answer, only the history.
-- Rule 16: a new nullable column and a new value of a check — old phones neither read nor write them.
-- Kept on purpose (review #1893): the FIRST receipt of a line is its price (a tick taken back and put again after the
-- office changed the line's cost writes nothing new); the cost per unit divides by the item's pack size at receipt time
-- (a pack size changed between the order and the receipt is not followed — the order line keeps no pack size yet).

alter table public.catalog_cost_history add column if not exists po_line_id uuid;
alter table public.catalog_cost_history drop constraint if exists catalog_cost_history_source_check;
alter table public.catalog_cost_history add constraint catalog_cost_history_source_check
  check (source in ('manual', 'initial', 'import_file', 'ai_scan', 'shelf_tag', 'module', 'receipt'));
-- catalog_cost_history is not a big table (migrationGuard BIG_TABLES): a plain index
create unique index if not exists catalog_cost_history_receipt_once on public.catalog_cost_history (company_id, po_line_id)
  where source = 'receipt' and po_line_id is not null;

-- grants unchanged: authenticated has only select on catalog_cost_history (20261110000000_suppliers.sql:169-170), so the
-- app writes no history row at all — a «receipt» row or a taken po_line_id comes only from po_receive (security definer);
-- T321 checks an insert from the app is refused

create or replace function public.po_receive(p_po_id uuid, p_lines jsonb, p_row_version bigint default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  po public.purchase_orders;
  l jsonb;
  q numeric;
  lq numeric;
  was numeric;
  ln public.purchase_order_lines;
  st text;
  office boolean;
begin
  -- the order locked: two markings at once give one final status (security check SUP2-а №5)
  select * into po from public.purchase_orders where id = p_po_id and deleted_at is null for update;
  office := po.id is not null and app.has_role(po.company_id, array['owner', 'admin', 'office']);
  if po.id is null or not (office or (po.job_id is not null and app.has_role(po.company_id, array['tech']) and app.is_job_assignee(po.job_id))) then
    raise exception 'purchase order not found' using errcode = 'P0002';
  end if;
  if po.status not in ('sent', 'partially_received', 'received') then
    raise exception 'purchase order is %: nothing to receive', po.status using errcode = 'check_violation', hint = 'po_not_open';
  end if;
  if po.status = 'received' and not office then
    raise exception 'a received order is changed by the office' using errcode = 'check_violation', hint = 'po_received_office';
  end if;
  if p_row_version is not null and p_row_version is distinct from po.row_version then
    raise exception 'the order changed meanwhile' using errcode = 'check_violation', hint = 'po_stale';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 500 then
    raise exception 'lines: an array of 1..500' using errcode = '22023';
  end if;
  if not exists (select 1 from public.purchase_order_lines x where x.po_id = po.id and x.deleted_at is null) then
    raise exception 'the order has no lines' using errcode = '22023';
  end if;
  for l in select x from jsonb_array_elements(p_lines) x loop
    if jsonb_typeof(l -> 'received') is distinct from 'number' or (l ->> 'received')::numeric < 0 then
      raise exception 'received: a number ≥ 0' using errcode = '22023';
    end if;
    q := round((l ->> 'received')::numeric, 3);
    select x.* into ln from public.purchase_order_lines x
     where x.po_id = po.id and x.company_id = po.company_id and x.id::text = (l ->> 'id') and x.deleted_at is null;
    -- a line of another order is ignored
    if ln.id is null then continue; end if;
    lq := ln.qty;
    was := ln.received_qty;
    if q > lq then raise exception 'received more than ordered' using errcode = '22023'; end if;
    update public.purchase_order_lines set received_qty = q where id = ln.id and po_id = po.id;
    -- #1836: the first time something of this line came — the price paid goes into the item's cost history (once per line)
    if was = 0 and q > 0 and ln.catalog_item_id is not null then
      insert into public.catalog_cost_history (company_id, item_id, supplier_id, unit_cost_cents, vendor_tax_bps, source, by, po_line_id)
      select po.company_id, ln.catalog_item_id, po.supplier_id,
             -- a pack's cost per the item's own unit, up to the cent (#1849); no pack size — the pack is the unit
             ceil(c.unit_cost_cents::numeric / coalesce(nullif(i.pack_size, 0), 1))::bigint,
             k.vendor_tax_bps, 'receipt', auth.uid(), ln.id
        from public.purchase_order_line_costs c
        join public.catalog_items i on i.company_id = po.company_id and i.id = ln.catalog_item_id
        left join public.catalog_item_costs k on k.company_id = po.company_id and k.item_id = ln.catalog_item_id
       where c.line_id = ln.id and c.company_id = po.company_id
      on conflict (company_id, po_line_id) where source = 'receipt' and po_line_id is not null do nothing;
    end if;
  end loop;
  select case
           when not exists (select 1 from public.purchase_order_lines x where x.po_id = po.id and x.deleted_at is null and x.received_qty < x.qty) then 'received'
           when exists (select 1 from public.purchase_order_lines x where x.po_id = po.id and x.deleted_at is null and x.received_qty > 0) then 'partially_received'
           else 'sent'
         end into st;
  update public.purchase_orders set status = st, received_at = case when st = 'received' then coalesce(received_at, now()) else null end where id = po.id;
  return st;
end;
$$;
revoke all on function public.po_receive(uuid, jsonb, bigint) from public, anon;
grant execute on function public.po_receive(uuid, jsonb, bigint) to authenticated;

-- a change of the item's supplier in the same transaction re-labels this transaction's history rows (t96, SUP1) — but a
-- receipt row is the ORDER's supplier and keeps it (review #1893 №4)
create or replace function app.tg_cost_history_supplier()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.catalog_cost_history h set supplier_id = new.supplier_id
   where h.company_id = new.company_id and h.item_id = new.id and h.at = now() and h.source <> 'receipt';
  return null;
end;
$$;
revoke all on function app.tg_cost_history_supplier() from public, anon, authenticated;
