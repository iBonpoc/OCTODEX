-- SUP2 (docs/specs/37-purchase-orders.md §5, §7): a purchase order to a supplier — core, any trade.
--   purchase_orders              the order: supplier (with a snapshot of its name / contact when sent — the tech sees
--                                where to pick up without reading suppliers), job (null = for stock), status, revision,
--                                delivery or pickup, address, needed on, note, print prices
--   purchase_order_lines         what to buy: item, name, supplier SKU, note, bom_qty (in the item's unit), qty (packs of
--                                the purchase unit), unit, received_qty, «check the pack size»
--   purchase_order_line_costs    our expected cost a pack (without tax) — only who sees costs (app.can_view_costs)
-- Who: owner / admin / office read and write everything; the tech reads the orders of his jobs (no costs) and marks
-- what came only through public.po_receive; sales and subcontractors — nothing (spec 36 В3).
-- Statuses (map §5): draft → sent → partially_received → received; cancelled from draft / sent / partially_received;
-- received → partially_received (a wrong tick fixed). The number PO-0001 — app.company_numbering (doc_type
-- purchase_order is allowed since core). New tables only (rule 16). No DELETE of an order: cancelled.

create table public.purchase_orders (
  id                uuid primary key default public.uuid_generate_v7(),
  company_id        uuid not null references public.companies (id),
  number            text not null default '',
  supplier_id       uuid,
  job_id            uuid,
  status            text not null default 'draft' check (status in ('draft', 'sent', 'partially_received', 'received', 'cancelled')),
  revision          int not null default 0 check (revision between 0 and 1000),
  fulfillment       text not null default 'delivery' check (fulfillment in ('delivery', 'pickup')),
  deliver_to        text check (app.sup_text_ok(deliver_to, 200)),
  needed_on         date,
  note              text check (note is null or (length(note) <= 1000 and note !~ '[\x00-\x09\x0b-\x1f\x7f‪-‮⁦-⁩]')),
  print_prices      boolean not null default false,
  -- the supplier as it was when the order was sent (spec 37 §5)
  supplier_name     text check (app.sup_text_ok(supplier_name, 80)),
  supplier_phone    text check (app.sup_text_ok(supplier_phone, 30)),
  supplier_email    text check (app.sup_text_ok(supplier_email, 120)),
  supplier_address  text check (app.sup_text_ok(supplier_address, 200)),
  sent_at           timestamptz,
  received_at       timestamptz,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id),
  foreign key (company_id, job_id) references public.jobs (company_id, id)
);
create index purchase_orders_company_idx on public.purchase_orders (company_id, created_at desc);  -- a new table
create index purchase_orders_job_idx on public.purchase_orders (company_id, job_id) where job_id is not null;  -- the FK; a new table
create index purchase_orders_supplier_idx on public.purchase_orders (company_id, supplier_id) where supplier_id is not null;  -- the FK; a new table
select app.attach_standard_triggers('public.purchase_orders');
-- The number (director's check of #461 №1): the app saves with «insert if new» (ON CONFLICT DO NOTHING) — a BEFORE
-- INSERT trigger runs before the conflict is found, so the shared tg_assign_number would take a number from the counter
-- on every save. Here a row that is already there keeps its number and the counter is not touched.
create or replace function app.tg_po_number()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.number := old.number;
  elsif exists (select 1 from public.purchase_orders p where p.id = new.id) then
    -- a repeat of a save: no number is taken (the row is not inserted: the conflict); another company's id gets none
    new.number := coalesce((select p.number from public.purchase_orders p where p.id = new.id and p.company_id = new.company_id), '');
  else
    new.number := app.next_document_number(new.company_id, 'purchase_order', 'PO');
  end if;
  return new;
end;
$$;
revoke all on function app.tg_po_number() from public, anon, authenticated;
create trigger t20_number before insert or update on public.purchase_orders
  for each row execute function app.tg_po_number();
create unique index purchase_orders_number_uq on public.purchase_orders (company_id, number) where number <> '';  -- a new table
create trigger t30_guard_status before update on public.purchase_orders
  for each row execute function app.tg_guard_status('purchase_order');
create trigger t90_status_event after insert or update on public.purchase_orders
  for each row execute function app.tg_status_event('purchase_order');
create trigger t12_keep_id before update on public.purchase_orders
  for each row execute function app.tg_keep_id();

-- What the app may change in an order (security check SUP2-а №1, №2, №6). Ignored rather than refused: a stale change
-- from an offline queue must not stop the queue (CHECKS §9) — the next read shows the server's order.
--   * a new order is a draft, whatever is sent (the app saves «insert if new», then an update);
--   * received / partially_received only through po_receive, never by hand;
--   * a received or cancelled order does not change at all (its job, supplier, snapshot, note).
-- the guard runs as the caller (it must tell the app from po_receive); the list of moves is read here
create or replace function app.po_move_ok(p_from text, p_to text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.status_transitions t where t.entity_type = 'purchase_order' and t.from_status = p_from and t.to_status = p_to);
$$;
revoke all on function app.po_move_ok(text, text) from public, anon;
grant execute on function app.po_move_ok(text, text) to authenticated;

create or replace function app.tg_po_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- only the app is guarded (director's check of #461 №6: not a session setting): po_receive runs as the owner of the
  -- tables (security definer) and changes only the status and received_at; t10 stamps it as usual (№2)
  if current_user is distinct from 'authenticated' then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.received_at := null;
    return new;
  end if;
  if old.status in ('received', 'cancelled') then return old; end if;
  -- the receiving statuses are po_receive's; a move the server does not allow (a stale status from a queue — review
  -- SUP2-а №5) keeps the stored one instead of refusing the whole save
  if new.status is distinct from old.status
     and (new.status in ('received', 'partially_received') or old.status = 'partially_received' and new.status = 'sent'
          or not app.po_move_ok(old.status, new.status)) then
    new.status := old.status;
  end if;
  new.received_at := old.received_at;
  return new;
end;
$$;
revoke all on function app.tg_po_guard() from public, anon, authenticated;
create trigger t26_po_guard before insert or update on public.purchase_orders
  for each row execute function app.tg_po_guard();

insert into app.status_transitions (entity_type, from_status, to_status) values
  ('purchase_order', 'draft', 'sent'),
  ('purchase_order', 'draft', 'cancelled'),
  ('purchase_order', 'sent', 'partially_received'),
  ('purchase_order', 'sent', 'received'),
  ('purchase_order', 'sent', 'cancelled'),
  ('purchase_order', 'partially_received', 'received'),
  ('purchase_order', 'partially_received', 'cancelled'),
  ('purchase_order', 'received', 'partially_received'),
  -- every tick taken back (the undo of a marking): po_receive only, the guard below keeps it from the app
  ('purchase_order', 'partially_received', 'sent'),
  ('purchase_order', 'received', 'sent')
on conflict do nothing;

create table public.purchase_order_lines (
  id                uuid primary key default public.uuid_generate_v7(),
  company_id        uuid not null references public.companies (id),
  po_id             uuid not null,
  position          int not null default 0 check (position between 0 and 10000),
  catalog_item_id   uuid,
  name              text not null check (length(btrim(name)) > 0 and app.sup_text_ok(name, 300)),
  supplier_sku      text check (app.sup_text_ok(supplier_sku, 60)),
  note              text check (app.sup_text_ok(note, 200)),
  -- the quantity in the item's own unit (the job's lines), the engine's decimal as text
  bom_qty           text check (bom_qty is null or bom_qty ~ '^([0-9]{1,9}([.][0-9]{1,6})?)$'),
  -- what is bought: packs of the purchase unit (purchasePacks, the engine)
  qty               numeric(12, 3) not null check (qty > 0 and qty <= 1000000),
  unit              text not null default 'ea' check (length(btrim(unit)) > 0 and app.sup_text_ok(unit, 20)),
  received_qty      numeric(12, 3) not null default 0 check (received_qty >= 0 and received_qty <= 1000000),
  check_pack        boolean not null default false,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  foreign key (company_id, po_id) references public.purchase_orders (company_id, id) on delete cascade,
  foreign key (company_id, catalog_item_id) references public.catalog_items (company_id, id)
);
create index purchase_order_lines_po_idx on public.purchase_order_lines (company_id, po_id, position);  -- the FK; a new table
create index purchase_order_lines_item_idx on public.purchase_order_lines (company_id, catalog_item_id) where catalog_item_id is not null;  -- the FK; a new table
select app.attach_standard_triggers('public.purchase_order_lines');
create trigger t12_keep_id before update on public.purchase_order_lines
  for each row execute function app.tg_keep_id();

-- a cost row keeps its line (as catalog_item_costs keeps its item, #459 Н3)
create or replace function app.tg_keep_line_id()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.line_id := old.line_id;
  return new;
end;
$$;
revoke all on function app.tg_keep_line_id() from public, anon, authenticated;

create table public.purchase_order_line_costs (
  line_id           uuid primary key,
  company_id        uuid not null references public.companies (id),
  unit_cost_cents   bigint not null check (unit_cost_cents between 0 and 100000000000),
  updated_at        timestamptz not null default now(),
  foreign key (company_id, line_id) references public.purchase_order_lines (company_id, id) on delete cascade
);
create index purchase_order_line_costs_company_idx on public.purchase_order_line_costs (company_id, line_id);  -- the FK; a new table
create trigger t11_company_id_immutable before update on public.purchase_order_line_costs
  for each row execute function app.tg_company_id_immutable();
create trigger t12_keep_line_id before update on public.purchase_order_line_costs
  for each row execute function app.tg_keep_line_id();

-- ---- the lines of an order being received or closed are not edited ---------------------------------------------
create or replace function app.tg_po_line_lock()
returns trigger language plpgsql set search_path = '' as $$
declare
  st text;
  po uuid := coalesce(new.po_id, old.po_id);
begin
  if tg_op = 'UPDATE' and new.po_id is distinct from old.po_id then
    raise exception 'a line never moves to another order' using errcode = 'check_violation';
  end if;
  -- po_receive (the owner of the tables) sets received_qty; the app has no grant on it (#461 №6: not a session setting)
  if current_user is distinct from 'authenticated' then return new; end if;
  select p.status into st from public.purchase_orders p where p.id = po;
  -- the lines of an order being received or closed do not change: a clear refusal, not silence (#461 №4) — the app
  -- never sends them (ops.ts: linesEditable); a stale phone gets «the order is already being received» in the card
  if st in ('partially_received', 'received') then
    raise exception 'purchase order % is %: its lines are not changed', po, st using errcode = 'check_violation', hint = 'po_receiving';
  end if;
  if st = 'cancelled' then
    raise exception 'purchase order % is cancelled', po using errcode = 'check_violation', hint = 'po_cancelled';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_po_line_lock() from public, anon, authenticated;
create trigger t25_po_line_lock before insert or update on public.purchase_order_lines
  for each row execute function app.tg_po_line_lock();

-- the expected cost of a line of a closed (partially received, received, cancelled) order stays as it was
create or replace function app.tg_po_cost_lock()
returns trigger language plpgsql set search_path = '' as $$
declare
  st text;
begin
  select p.status into st from public.purchase_order_lines l join public.purchase_orders p on p.id = l.po_id
   where l.id = new.line_id and l.company_id = new.company_id;
  if st in ('partially_received', 'received', 'cancelled') then
    return case when tg_op = 'UPDATE' then old else null end;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_po_cost_lock() from public, anon, authenticated;
create trigger t25_po_cost_lock before insert or update on public.purchase_order_line_costs
  for each row execute function app.tg_po_cost_lock();

-- ---- rights -------------------------------------------------------------------------------------------------------
-- the tech: an order of a job he is on (a visit of it is his) — read only, without costs
create or replace function app.can_read_po(p_company_id uuid, p_job_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.has_role(p_company_id, array['owner', 'admin', 'office'])
      or (p_job_id is not null and app.has_role(p_company_id, array['tech']) and app.is_job_assignee(p_job_id));
$$;
revoke all on function app.can_read_po(uuid, uuid) from public, anon;
grant execute on function app.can_read_po(uuid, uuid) to authenticated;

alter table public.purchase_orders enable row level security;
alter table public.purchase_orders force row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.purchase_order_lines force row level security;
alter table public.purchase_order_line_costs enable row level security;
alter table public.purchase_order_line_costs force row level security;
revoke all on public.purchase_orders, public.purchase_order_lines, public.purchase_order_line_costs from anon, authenticated;

grant select on public.purchase_orders, public.purchase_order_lines to authenticated;
-- the app saves with an upsert of every column it sends (id, company_id included; t11 / t12 keep them)
grant insert (id, company_id, supplier_id, job_id, status, revision, fulfillment, deliver_to, needed_on, note, print_prices,
              supplier_name, supplier_phone, supplier_email, supplier_address, sent_at, created_at_device, origin_device_id),
      update (id, company_id, supplier_id, job_id, status, revision, fulfillment, deliver_to, needed_on, note, print_prices,
              supplier_name, supplier_phone, supplier_email, supplier_address, sent_at)
  on public.purchase_orders to authenticated;
grant insert (id, company_id, po_id, position, catalog_item_id, name, supplier_sku, note, bom_qty, qty, unit, check_pack),
      update (id, company_id, po_id, position, catalog_item_id, name, supplier_sku, note, bom_qty, qty, unit, check_pack, deleted_at)
  on public.purchase_order_lines to authenticated;
-- a line is removed by deleted_at (no DELETE for the app: the guard of T52); its cost row stays and is never read
grant select, insert (line_id, company_id, unit_cost_cents), update (line_id, company_id, unit_cost_cents)
  on public.purchase_order_line_costs to authenticated;

create policy purchase_orders_select on public.purchase_orders for select to authenticated
  using (app.can_read_po(company_id, job_id));
create policy purchase_orders_insert on public.purchase_orders for insert to authenticated
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));
create policy purchase_orders_update on public.purchase_orders for update to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office']))
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));

create policy purchase_order_lines_select on public.purchase_order_lines for select to authenticated
  using (exists (select 1 from public.purchase_orders p where p.id = po_id and p.company_id = purchase_order_lines.company_id
                  and app.can_read_po(p.company_id, p.job_id)));
create policy purchase_order_lines_insert on public.purchase_order_lines for insert to authenticated
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));
create policy purchase_order_lines_update on public.purchase_order_lines for update to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office']))
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));

-- owner / admin / office only: sales reads no orders (spec 36 В3), its view_costs does not open their costs (SUP2-а №3)
create policy purchase_order_line_costs_select on public.purchase_order_line_costs for select to authenticated
  using (app.can_view_costs(company_id) and app.has_role(company_id, array['owner', 'admin', 'office']));
create policy purchase_order_line_costs_insert on public.purchase_order_line_costs for insert to authenticated
  with check (app.can_view_costs(company_id) and app.has_role(company_id, array['owner', 'admin', 'office']));
create policy purchase_order_line_costs_update on public.purchase_order_line_costs for update to authenticated
  using (app.can_view_costs(company_id) and app.has_role(company_id, array['owner', 'admin', 'office']))
  with check (app.can_view_costs(company_id) and app.has_role(company_id, array['owner', 'admin', 'office']));

-- ---- what came: the tech of the job or the office (spec 37 §5) ---------------------------------------------------
-- p_lines: [{"id": <line>, "received": <qty>}] — the received quantity of each line as it is now (not added: a repeat
-- of the same call changes nothing), 0..qty of the line (more than ordered — not yet, spec 37 §5). The status after:
-- every line has its qty → received; something came → partially_received; every tick taken back → sent again (the
-- undo of a marking). Only a sent / partially received / received order; a received one only by the office (director
-- 08.11, #461 №3). p_row_version — the order's row_version the phone knows: another change meanwhile (an office edit,
-- another marking) refuses a stale offline marking with a clear code instead of turning «all came» back. Each call
-- moves the order's row_version by one. Returns the new status.
create or replace function public.po_receive(p_po_id uuid, p_lines jsonb, p_row_version bigint default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  po public.purchase_orders;
  l jsonb;
  q numeric;
  lq numeric;
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
    select x.qty into lq from public.purchase_order_lines x
     where x.po_id = po.id and x.company_id = po.company_id and x.id::text = (l ->> 'id') and x.deleted_at is null;
    -- a line of another order is ignored
    if lq is null then continue; end if;
    if q > lq then raise exception 'received more than ordered' using errcode = '22023'; end if;
    update public.purchase_order_lines set received_qty = q where id::text = (l ->> 'id') and po_id = po.id;
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
