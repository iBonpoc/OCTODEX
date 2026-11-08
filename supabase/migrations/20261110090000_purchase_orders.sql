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
create trigger t20_number before insert or update on public.purchase_orders
  for each row execute function app.tg_assign_number('purchase_order', 'PO');
create trigger t30_guard_status before update on public.purchase_orders
  for each row execute function app.tg_guard_status('purchase_order');
create trigger t90_status_event after insert or update on public.purchase_orders
  for each row execute function app.tg_status_event('purchase_order');
create trigger t12_keep_id before update on public.purchase_orders
  for each row execute function app.tg_keep_id();

insert into app.status_transitions (entity_type, from_status, to_status) values
  ('purchase_order', 'draft', 'sent'),
  ('purchase_order', 'draft', 'cancelled'),
  ('purchase_order', 'sent', 'partially_received'),
  ('purchase_order', 'sent', 'received'),
  ('purchase_order', 'sent', 'cancelled'),
  ('purchase_order', 'partially_received', 'received'),
  ('purchase_order', 'partially_received', 'cancelled'),
  ('purchase_order', 'received', 'partially_received')
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

-- ---- an order of a closed state is not edited (received / cancelled): its lines neither ---------------------------
-- po_receive (below) changes received_qty of a received order back to partially_received — it runs as the owner of the
-- table and says so with app.po_receiving; the app's own edits of a received or cancelled order are refused.
create or replace function app.tg_po_line_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  st text;
  po uuid := coalesce(new.po_id, old.po_id);
begin
  if tg_op = 'UPDATE' and new.po_id is distinct from old.po_id then
    raise exception 'a line never moves to another order' using errcode = 'check_violation';
  end if;
  if coalesce(current_setting('app.po_receiving', true), '') = 'on' then return coalesce(new, old); end if;
  select p.status into st from public.purchase_orders p where p.id = po;
  if st in ('received', 'cancelled', 'partially_received') then
    raise exception 'purchase order % is %: its lines are not changed', po, st using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function app.tg_po_line_lock() from public, anon, authenticated;
create trigger t25_po_line_lock before insert or update on public.purchase_order_lines
  for each row execute function app.tg_po_line_lock();

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

create policy purchase_order_line_costs_select on public.purchase_order_line_costs for select to authenticated
  using (app.can_view_costs(company_id));
create policy purchase_order_line_costs_insert on public.purchase_order_line_costs for insert to authenticated
  with check (app.can_view_costs(company_id) and app.has_role(company_id, array['owner', 'admin', 'office']));
create policy purchase_order_line_costs_update on public.purchase_order_line_costs for update to authenticated
  using (app.can_view_costs(company_id) and app.has_role(company_id, array['owner', 'admin', 'office']))
  with check (app.can_view_costs(company_id) and app.has_role(company_id, array['owner', 'admin', 'office']));

-- ---- what came: the tech of the job or the office (spec 37 §5) ---------------------------------------------------
-- p_lines: [{"id": <line>, "received": <qty>}] — the received quantity of each line as it is now (not added: a repeat
-- of the same call changes nothing). The order becomes received when every line has its qty, partially_received when
-- something came, back to partially_received when a tick is taken back. Only a sent / partially received / received
-- order. Returns the new status.
create or replace function public.po_receive(p_po_id uuid, p_lines jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  po public.purchase_orders;
  l jsonb;
  q numeric;
  st text;
begin
  select * into po from public.purchase_orders where id = p_po_id and deleted_at is null;
  if po.id is null or not (app.has_role(po.company_id, array['owner', 'admin', 'office'])
                           or (po.job_id is not null and app.has_role(po.company_id, array['tech']) and app.is_job_assignee(po.job_id))) then
    raise exception 'purchase order not found' using errcode = 'P0002';
  end if;
  if po.status not in ('sent', 'partially_received', 'received') then
    raise exception 'purchase order is %: nothing to receive', po.status using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) > 500 then
    raise exception 'lines: an array of at most 500' using errcode = '22023';
  end if;
  perform set_config('app.po_receiving', 'on', true);
  for l in select x from jsonb_array_elements(p_lines) x loop
    if jsonb_typeof(l -> 'received') <> 'number' or (l ->> 'received')::numeric < 0 or (l ->> 'received')::numeric > 1000000 then
      raise exception 'received: a number 0..1000000' using errcode = '22023';
    end if;
    q := round((l ->> 'received')::numeric, 3);
    update public.purchase_order_lines set received_qty = q
     where po_id = po.id and company_id = po.company_id and id::text = (l ->> 'id') and deleted_at is null;
  end loop;
  select case
           when not exists (select 1 from public.purchase_order_lines x where x.po_id = po.id and x.deleted_at is null and x.received_qty < x.qty) then 'received'
           when exists (select 1 from public.purchase_order_lines x where x.po_id = po.id and x.deleted_at is null and x.received_qty > 0) then 'partially_received'
           else po.status
         end into st;
  -- nothing came after all: a sent order stays sent; a received one that lost every tick is partially received
  if st = 'sent' and po.status = 'received' then st := 'partially_received'; end if;
  if st is distinct from po.status then
    update public.purchase_orders set status = st, received_at = case when st = 'received' then now() else null end where id = po.id;
  end if;
  perform set_config('app.po_receiving', '', true);
  return st;
end;
$$;
revoke all on function public.po_receive(uuid, jsonb) from public, anon;
grant execute on function public.po_receive(uuid, jsonb) to authenticated;
