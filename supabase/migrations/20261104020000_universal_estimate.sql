-- =============================================================================
-- OCTODEX: универсальная смета (ядро, без привязки к нише) + каталог + страница клиента.
--   * catalog_items — услуги, работа, материалы и комплекты компании (docs/04-domain-model.md CatalogItem);
--     материал: цена = закупка × (1 + налог продавца) × (1 + надбавка); комплект = список позиций (components).
--   * estimates.public_token — ссылка для клиента (SMS / email), страница открывается в браузере без входа;
--   * public.portal_estimate(token) / public.portal_accept(...) — security definer, доступны anon:
--     клиент видит только то, что видно клиенту (без себестоимости), выбирает вариант и доп. опции,
--     подписывает; итог и депозит пересчитывает сервер по строкам сметы (не доверяет телефону);
--     одобрение создаёт работу (scheduled) и выезд без мастера на завтра 09:00 по времени компании;
--   * notifications — «клиент открыл смету», «клиент подписал».
-- Упрощения (записаны в supabase/README.md): себестоимость каталога видна всем участникам компании,
-- оплата депозита клиентом — после подключения Stripe (сейчас депозит отмечает подрядчик).
-- =============================================================================

-- ---- CatalogItem ------------------------------------------------------------------
create table public.catalog_items (
  id                     uuid primary key default public.uuid_generate_v7(),
  company_id             uuid not null references public.companies (id),
  kind                   text not null check (kind in ('service', 'labor', 'material', 'kit')),
  name                   text not null check (length(trim(name)) > 0),
  description            text,
  sku                    text,
  unit                   text not null default 'ea',
  unit_price_cents       bigint not null default 0 check (unit_price_cents >= 0),
  unit_cost_cents        bigint check (unit_cost_cents >= 0),        -- закупка без налога продавца
  vendor                 text,
  vendor_tax_bps         int check (vendor_tax_bps between 0 and 10000),
  markup_bps             int check (markup_bps between 0 and 100000),
  components             jsonb not null default '[]'::jsonb,         -- kit: [{item_id, qty}]
  is_placeholder_price   boolean not null default false,
  module                 text not null default 'core',
  is_active              boolean not null default true,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id)
);
create index catalog_items_company_idx on public.catalog_items (company_id, kind) where deleted_at is null;
do $$ begin perform app.attach_standard_triggers('public.catalog_items'); end $$;

alter table public.catalog_items enable row level security;
alter table public.catalog_items force row level security;
create policy catalog_items_select on public.catalog_items for select to authenticated using (app.is_member(company_id));
create policy catalog_items_insert on public.catalog_items for insert to authenticated with check (app.is_staff(company_id));
create policy catalog_items_update on public.catalog_items for update to authenticated
  using (app.is_staff(company_id)) with check (app.is_staff(company_id));
grant select, insert, update on public.catalog_items to authenticated;

-- ---- Ссылка для клиента и выбор клиента ---------------------------------------------
alter table public.estimates add column if not exists public_token text unique
  check (public_token is null or length(public_token) >= 20);
alter table public.estimate_approvals add column if not exists selection jsonb;  -- {addon_ids, subtotal, discount, tax, total, deposit}

-- ---- Notifications ----------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default public.uuid_generate_v7(),
  company_id   uuid not null references public.companies (id),
  kind         text not null check (kind in ('estimate.viewed', 'estimate.approved', 'deposit.paid')),
  estimate_id  uuid,
  job_id       uuid,
  payload      jsonb not null default '{}'::jsonb,              -- {customer, number, total, deposit}
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  foreign key (company_id, estimate_id) references public.estimates (company_id, id)
);
create index notifications_company_idx on public.notifications (company_id, created_at desc);
alter table public.notifications enable row level security;
alter table public.notifications force row level security;
create policy notifications_select on public.notifications for select to authenticated using (app.is_staff(company_id));
create policy notifications_update on public.notifications for update to authenticated
  using (app.is_staff(company_id)) with check (app.is_staff(company_id));
grant select, update (read_at) on public.notifications to authenticated;

-- ---- Страница клиента: чтение --------------------------------------------------------
create or replace function public.portal_estimate(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e   public.estimates;
  v   public.estimate_versions;
  co  public.companies;
  a   public.estimate_approvals;
  dep_paid boolean;
begin
  select * into e from public.estimates where public_token = p_token and deleted_at is null;
  if not found or p_token is null then
    return null;
  end if;
  select * into v from public.estimate_versions where id = coalesce(e.sent_version_id, e.current_version_id);
  select * into co from public.companies where id = e.company_id;
  select * into a from public.estimate_approvals where estimate_id = e.id and decision = 'approved' order by signed_at desc limit 1;
  select exists (
    select 1 from public.jobs j join public.invoices i on i.job_id = j.id
     where j.estimate_id = e.id and i.kind = 'deposit' and i.paid_cents > 0
  ) into dep_paid;

  -- Первый просмотр клиентом (не сотрудником): sent → viewed, уведомление подрядчику.
  if e.status = 'sent' and not app.is_member(e.company_id) then
    update public.estimates set status = 'viewed', viewed_count = viewed_count + 1, last_viewed_at = now() where id = e.id;
    insert into public.notifications (company_id, kind, estimate_id, payload)
    select e.company_id, 'estimate.viewed', e.id,
           jsonb_build_object('customer', c.display_name, 'number', e.number)
      from public.customers c where c.id = e.customer_id;
    e.status := 'viewed';
  elsif e.status in ('viewed', 'approved') and not app.is_member(e.company_id) then
    update public.estimates set viewed_count = viewed_count + 1, last_viewed_at = now() where id = e.id;
  end if;

  return jsonb_build_object(
    'number', e.number,
    'title', e.title,
    'status', e.status,
    'sent_at', v.sent_at,
    'doc', v.calc_inputs,
    'company', jsonb_build_object('name', co.name, 'phone', co.phone, 'email', co.email, 'license', co.license_number),
    'customer', (select jsonb_build_object('name', c.display_name) from public.customers c where c.id = e.customer_id),
    'property', (select jsonb_build_object('address', p.address_line1, 'city', p.address_city, 'state', p.address_state, 'zip', p.address_zip)
                   from public.properties p where p.id = e.property_id),
    'approval', case when a.id is null then null else jsonb_build_object(
                  'option_id', a.option_id, 'signer_name', a.signer_name, 'signed_at', a.signed_at,
                  'signature_svg', a.signature_svg, 'selection', a.selection) end,
    'deposit_paid', dep_paid
  );
end;
$$;

-- ---- Страница клиента: выбор варианта и подпись ------------------------------------------
create or replace function public.portal_accept(
  p_token      text,
  p_option_id  uuid,
  p_addon_ids  uuid[],
  p_signer     text,
  p_svg        text,
  p_consent    boolean,
  p_channel    text default 'portal',
  p_job_id     uuid default null,
  p_visit_id   uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e        public.estimates;
  v        public.estimate_versions;
  o        public.estimate_options;
  member   boolean;
  sub      bigint;
  taxable  bigint;
  disc     bigint := 0;
  tdisc    bigint := 0;
  tax      bigint := 0;
  total    bigint;
  dep      bigint := 0;
  rule     jsonb;
  tz       text;
  start_at timestamptz;
  v_job    uuid;
  v_visit  uuid;
  v_cust   text;
begin
  if coalesce(p_consent, false) is not true or coalesce(trim(p_signer), '') = '' or coalesce(p_svg, '') = '' then
    raise exception 'E-SIGN consent, name and signature are required' using errcode = '22023';
  end if;
  select * into e from public.estimates where public_token = p_token and deleted_at is null for update;
  if not found or p_token is null then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  member := app.is_member(e.company_id);
  if p_channel = 'on_site' and not member then
    raise exception 'on-site signature requires a company member' using errcode = '42501';
  end if;
  if e.status = 'approved' then
    return public.portal_estimate(p_token);              -- повтор (сеть) — без дублей
  end if;
  if e.status not in ('sent', 'viewed') then
    raise exception 'estimate is not open for approval (status %)', e.status using errcode = '22023';
  end if;
  select * into v from public.estimate_versions where id = coalesce(e.sent_version_id, e.current_version_id);
  select * into o from public.estimate_options where id = p_option_id and version_id = v.id and deleted_at is null;
  if not found then
    raise exception 'option does not belong to the sent version' using errcode = '22023';
  end if;

  -- Итог считает сервер по строкам (как @octo/estimating-engine: round half up, скидка пропорционально на налоговую базу).
  select coalesce(sum(li.line_total_cents), 0), coalesce(sum(li.line_total_cents) filter (where li.taxable), 0)
    into sub, taxable
    from public.estimate_line_items li
   where li.option_id = o.id and li.deleted_at is null and li.client_visible
     and (not li.is_optional or li.id = any (coalesce(p_addon_ids, '{}')));
  if o.discount_mode = 'pct' then
    disc := floor(sub * o.discount_value / 10000.0 + 0.5);
  elsif o.discount_mode = 'fixed' then
    disc := least(o.discount_value, sub);
  end if;
  if sub > 0 then
    tdisc := floor(disc::numeric * taxable / sub + 0.5);
  end if;
  if v.tax_enabled then
    tax := floor((taxable - tdisc)::numeric * coalesce(v.tax_rate_bps, 0) / 10000 + 0.5);
  end if;
  total := sub - disc + tax;
  rule := coalesce(v.deposit_rule, '{}'::jsonb);
  if rule ->> 'kind' = 'pct' then
    dep := floor(total * least(greatest((rule ->> 'bps')::numeric, 0), 10000) / 10000 + 0.5);
  elsif rule ->> 'kind' = 'fixed' then
    dep := least(greatest((rule ->> 'cents')::bigint, 0), total);
  end if;

  insert into public.estimate_approvals (company_id, estimate_id, version_id, option_id, decision, signer_name,
                                         signature_svg, esign_consent, channel, selection)
  values (e.company_id, e.id, v.id, o.id, 'approved', trim(p_signer), p_svg, true,
          case when p_channel = 'on_site' then 'on_site' else 'portal' end,
          jsonb_build_object('addon_ids', coalesce(p_addon_ids, '{}'), 'subtotal', sub, 'discount', disc, 'tax', tax,
                             'total', total, 'deposit', dep));
  update public.estimates set status = 'approved' where id = e.id;

  -- Работа в план: job (scheduled) + выезд без мастера завтра 09:00 по времени компании.
  v_job := case when member and p_job_id is not null then p_job_id else public.uuid_generate_v7() end;
  v_visit := case when member and p_visit_id is not null then p_visit_id else public.uuid_generate_v7() end;
  insert into public.jobs (id, company_id, number, title, customer_id, property_id, estimate_id, approved_version_id, option_id, contract_total_cents)
  values (v_job, e.company_id, '', coalesce(nullif(e.title, ''), o.name), e.customer_id, e.property_id, e.id, v.id, o.id, total)
  on conflict (estimate_id) do nothing;
  select id into v_job from public.jobs where estimate_id = e.id;
  update public.jobs set status = 'scheduled', contract_total_cents = total where id = v_job and status = 'draft';
  select timezone into tz from public.companies where id = e.company_id;
  start_at := (((now() at time zone tz)::date + 1) + time '09:00') at time zone tz;
  if not exists (select 1 from public.visits where job_id = v_job and deleted_at is null) then
    insert into public.visits (id, company_id, job_id, kind, starts_at, ends_at, created_via, notes)
    values (v_visit, e.company_id, v_job, 'install', start_at, start_at + interval '2 hours', 'portal', 'Approved: ' || o.name);
  end if;

  select display_name into v_cust from public.customers where id = e.customer_id;
  insert into public.notifications (company_id, kind, estimate_id, job_id, payload)
  values (e.company_id, 'estimate.approved', e.id, v_job,
          jsonb_build_object('customer', v_cust, 'number', e.number, 'option', o.name, 'total', total, 'deposit', dep,
                             'channel', p_channel));
  return public.portal_estimate(p_token);
end;
$$;

revoke all on function public.portal_estimate(text) from public;
revoke all on function public.portal_accept(text, uuid, uuid[], text, text, boolean, text, uuid, uuid) from public;
grant execute on function public.portal_estimate(text) to anon, authenticated;
grant execute on function public.portal_accept(text, uuid, uuid[], text, text, boolean, text, uuid, uuid) to anon, authenticated;
