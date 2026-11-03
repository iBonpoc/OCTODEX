-- =============================================================================
-- Octo — волна 5, миграция 1: ядро модели данных (MVP-подмножество)
-- Источник правды: docs/04-domain-model.md v0.3.1 (§0, §1, §2, §4, §5, §6, §8, §9),
-- docs/06-architecture.md §4–5, docs/08-security.md §5.
--
-- Что внутри:
--   * public.uuid_generate_v7()                     — UUID v7 (§0)
--   * users, companies, memberships                 — аккаунты и доступ (§1)
--   * lead_sources, customers, contacts, properties, leads           (§2)
--   * jobs, visits, visit_assignees                                  (§5)
--   * estimates, estimate_versions, estimate_options,
--     estimate_line_items, estimate_line_costs (спутник себестоимости) (§4)
--   * invoices, payments                                             (§6)
--   * status_events, audit_log                                       (§8)
--   * app.company_numbering — серверные номера EST/JOB/INV/RCT
--   * app.status_transitions — разрешённые переходы (§9) + триггер-страж
--   * RLS (FORCE) на всех таблицах; helper-функции в схеме app
--
-- Требует: схему auth с auth.uid() и таблицей auth.users (есть в Supabase;
-- для локальных тестов — supabase/tests/auth_stub.sql), роли authenticated/anon.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
comment on schema app is 'Приватные helper-функции и служебные таблицы Octo (не публикуется через API)';

-- -----------------------------------------------------------------------------
-- UUID v7 (RFC 9562): 48 бит unix-ms + версия 7 + вариант 10 + случайные биты.
-- Сортируется по времени; телефон генерирует такие же id офлайн.
-- -----------------------------------------------------------------------------
create or replace function public.uuid_generate_v7()
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_ms   bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_b    bytea  := extensions.gen_random_bytes(16);
begin
  v_b := overlay(v_b placing substring(int8send(v_ms) from 3 for 6) from 1 for 6);
  v_b := set_byte(v_b, 6, (get_byte(v_b, 6) & 15) | 112);  -- версия 0111
  v_b := set_byte(v_b, 8, (get_byte(v_b, 8) & 63) | 128);  -- вариант 10
  return encode(v_b, 'hex')::uuid;
end;
$$;
comment on function public.uuid_generate_v7() is 'UUID v7 (время + случайность). Postgres 18 имеет uuidv7(); здесь — переносимая версия для PG 15–17';

-- =============================================================================
-- 1. Аккаунты, компании, доступ
-- =============================================================================

-- User (§1). id = auth.users.id. Не бизнес-строка компании — без company_id.
create table public.users (
  id                      uuid primary key references auth.users (id) on delete cascade,
  email                   text not null unique,
  full_name               text not null,
  phone                   text,
  locale                  text not null default 'en' check (locale in ('en', 'es', 'ru')),
  avatar_file_id          uuid,                       -- → File (позже)
  last_active_company_id  uuid,                       -- FK ниже
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid,
  deleted_at              timestamptz,
  row_version             bigint not null default 1
);

-- Company (§1). Адрес — плоскими колонками address_* (встроенный тип Address, §2).
create table public.companies (
  id                        uuid primary key default public.uuid_generate_v7(),
  name                      text not null,
  legal_name                text,
  phone                     text,
  email                     text,
  license_number            text,
  license_class             text[],
  license_expires_on        date,
  timezone                  text not null default 'America/Los_Angeles',
  currency                  char(3) not null default 'USD',
  address_line1             text,
  address_line2             text,
  address_unit              text,
  address_city              text,
  address_state             text,
  address_zip               text,
  address_country           text not null default 'US',
  primary_trade             text not null default 'gutters' check (primary_trade in ('gutters', 'roofing', 'other')),
  default_client_locale     text not null default 'en' check (default_client_locale in ('en', 'es')),
  public_slug               text unique,
  stripe_account_id         text,
  numbering                 jsonb not null default '{}'::jsonb,  -- {"estimate":{"prefix":"EST"}, ...}; счётчики — app.company_numbering
  lead_default_assignee_id  uuid references public.users (id),
  lead_response_alert_min   int not null default 5,
  contract_settings         jsonb not null default '{}'::jsonb,
  tax_settings              jsonb not null default '{}'::jsonb,
  gutter_settings           jsonb not null default '{}'::jsonb,
  estimate_settings         jsonb not null default '{}'::jsonb,
  payment_settings          jsonb not null default '{}'::jsonb,
  scheduling_settings       jsonb not null default '{}'::jsonb,
  onboarding_state          jsonb not null default '{}'::jsonb,
  brand                     jsonb,
  service_area              jsonb,
  business_hours            jsonb,
  created_at                timestamptz not null default now(),
  created_by                uuid,
  updated_at                timestamptz not null default now(),
  updated_by                uuid,
  deleted_at                timestamptz,
  row_version               bigint not null default 1
);
-- Поля Company, не вошедшие в MVP-миграцию: ein (шифрование), inbound_lead_address,
-- sms_number, a2p_*, referral_reward, costing_settings, subcontractor_settings, trade_modules.

alter table public.users
  add constraint users_last_active_company_fk
  foreign key (last_active_company_id) references public.companies (id) on delete set null;

-- Membership (§1). Одна роль на пару (user, company).
create table public.memberships (
  id                    uuid primary key default public.uuid_generate_v7(),
  company_id            uuid not null references public.companies (id),
  user_id               uuid not null references public.users (id),
  role                  text not null check (role in ('owner', 'admin', 'office', 'sales', 'tech', 'subcontractor')),
  status                text not null default 'invited' check (status in ('invited', 'active', 'suspended')),
  permissions_override  jsonb not null default '{}'::jsonb,
  color                 text,
  invited_by            uuid references public.users (id),
  invite_token_hash     text,
  invite_expires_at     timestamptz,
  suspended_at          timestamptz,
  share_location        boolean not null default false,
  can_sign_contracts    boolean not null default false,
  his_registration_number text,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  deleted_at            timestamptz,
  row_version           bigint not null default 1,
  unique (company_id, user_id),
  check (role <> 'subcontractor' or share_location = false)
);
create index memberships_user_idx on public.memberships (user_id, status);

-- =============================================================================
-- 2. Служебные таблицы: нумерация и переходы статусов
-- =============================================================================

-- Счётчики документов на компанию. Строка блокируется в транзакции
-- (insert … on conflict do update) → номера без дублей и без дыр при откате.
create table app.company_numbering (
  company_id  uuid not null references public.companies (id),
  doc_type    text not null check (doc_type in ('estimate', 'job', 'invoice', 'receipt', 'purchase_order', 'change_order')),
  last_value  bigint not null default 0,
  primary key (company_id, doc_type)
);

create or replace function app.next_document_number(p_company_id uuid, p_doc_type text, p_default_prefix text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v_next   bigint;
  v_prefix text;
begin
  insert into app.company_numbering as n (company_id, doc_type, last_value)
  values (p_company_id, p_doc_type, 1)
  on conflict (company_id, doc_type) do update set last_value = n.last_value + 1
  returning n.last_value into v_next;

  select coalesce(nullif(c.numbering -> p_doc_type ->> 'prefix', ''), p_default_prefix)
    into v_prefix
    from public.companies c where c.id = p_company_id;

  return coalesce(v_prefix, p_default_prefix) || '-' || lpad(v_next::text, 4, '0');
end;
$$;

-- Разрешённые переходы (§9). Источник один: таблица; триггер app.tg_guard_status
-- проверяет каждое изменение status. В будущем генерируется из packages/domain.
create table app.status_transitions (
  entity_type  text not null,
  from_status  text not null,
  to_status    text not null,
  primary key (entity_type, from_status, to_status)
);

insert into app.status_transitions (entity_type, from_status, to_status) values
  -- Visit: scheduled → en_route → on_site → completed / cancelled / no_show; пропуск en_route допустим
  ('visit', 'scheduled', 'en_route'),
  ('visit', 'scheduled', 'on_site'),
  ('visit', 'en_route',  'on_site'),
  ('visit', 'on_site',   'completed'),
  ('visit', 'scheduled', 'cancelled'),
  ('visit', 'en_route',  'cancelled'),
  ('visit', 'on_site',   'cancelled'),
  ('visit', 'scheduled', 'no_show'),
  ('visit', 'en_route',  'no_show'),
  -- Job
  ('job', 'draft',       'scheduled'),
  ('job', 'scheduled',   'in_progress'),
  ('job', 'in_progress', 'completed'),
  ('job', 'completed',   'closed'),
  ('job', 'scheduled',   'on_hold'),
  ('job', 'in_progress', 'on_hold'),
  ('job', 'on_hold',     'in_progress'),
  ('job', 'on_hold',     'scheduled'),
  ('job', 'draft',       'cancelled'),
  ('job', 'scheduled',   'cancelled'),
  ('job', 'on_hold',     'cancelled'),
  ('job', 'in_progress', 'cancelled'),
  -- Estimate (revised = событие: sent/viewed → draft с новой версией)
  ('estimate', 'draft',                'sent'),
  ('estimate', 'sent',                 'viewed'),
  ('estimate', 'sent',                 'declined'),
  ('estimate', 'viewed',               'declined'),
  ('estimate', 'sent',                 'expired'),
  ('estimate', 'viewed',               'expired'),
  ('estimate', 'expired',              'sent'),
  ('estimate', 'expired',              'viewed'),
  ('estimate', 'sent',                 'awaiting_countersign'),
  ('estimate', 'viewed',               'awaiting_countersign'),
  ('estimate', 'awaiting_countersign', 'approved'),
  ('estimate', 'sent',                 'approved'),   -- автоподпись проходит awaiting_countersign мгновенно
  ('estimate', 'viewed',               'approved'),
  ('estimate', 'approved',             'cancelled_by_customer'),
  ('estimate', 'sent',                 'draft'),
  ('estimate', 'viewed',               'draft'),
  -- Invoice (статус документа; оплата — payment_status)
  ('invoice', 'draft', 'sent'),
  ('invoice', 'draft', 'void'),
  ('invoice', 'sent',  'void'),
  -- Payment
  ('payment', 'pending',            'succeeded'),
  ('payment', 'pending',            'failed'),
  ('payment', 'succeeded',          'partially_refunded'),
  ('payment', 'partially_refunded', 'partially_refunded'),
  ('payment', 'succeeded',          'refunded'),
  ('payment', 'partially_refunded', 'refunded'),
  ('payment', 'succeeded',          'returned'),
  ('payment', 'succeeded',          'voided');

-- Lead: вперёд по воронке (с пропусками: «запись на осмотр» прямо из new), won — только из estimate_sent, lost из любого открытого,
-- lost → contacted («клиент вернулся»), won/lost → archived.
insert into app.status_transitions (entity_type, from_status, to_status)
select 'lead', a.s, b.s
from (values (1, 'new'), (2, 'contacted'), (3, 'qualified'), (4, 'inspection_scheduled'), (5, 'estimate_sent')) a(i, s)
join (values (2, 'contacted'), (3, 'qualified'), (4, 'inspection_scheduled'), (5, 'estimate_sent')) b(i, s)
  on b.i > a.i
union all
select 'lead', s, 'lost' from (values ('new'), ('contacted'), ('qualified'), ('inspection_scheduled'), ('estimate_sent')) x(s)
union all
values ('lead', 'estimate_sent', 'won'),   -- won ставит сервер при одобрении сметы
       ('lead', 'lost', 'contacted'), ('lead', 'won', 'archived'), ('lead', 'lost', 'archived');

-- =============================================================================
-- 3. Общие триггерные функции
-- =============================================================================

-- Служебные поля §0: created_*, updated_*, row_version. created_by/updated_by
-- берутся из JWT (клиент не может подделать); при системной записи (без JWT) — как передано.
create or replace function app.tg_service_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at  := coalesce(new.created_at, now());
    new.created_by  := coalesce(auth.uid(), new.created_by);
    new.updated_at  := new.created_at;
    new.updated_by  := new.created_by;
    new.row_version := 1;
  else
    new.created_at  := old.created_at;
    new.created_by  := old.created_by;
    new.updated_at  := now();
    new.updated_by  := coalesce(auth.uid(), new.updated_by);
    new.row_version := old.row_version + 1;
  end if;
  return new;
end;
$$;

-- Строка не может «переехать» в другую компанию.
create or replace function app.tg_company_id_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'company_id is immutable (% %)', tg_table_name, old.id using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Номер документа присваивает только сервер (§0). tg_argv[0] = doc_type, tg_argv[1] = префикс.
create or replace function app.tg_assign_number()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.number := app.next_document_number(new.company_id, tg_argv[0], tg_argv[1]);
  else
    new.number := old.number;
  end if;
  return new;
end;
$$;

-- Страж state machine. tg_argv[0] = entity_type в app.status_transitions.
create or replace function app.tg_guard_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if not exists (
      select 1 from app.status_transitions t
      where t.entity_type = tg_argv[0] and t.from_status = old.status and t.to_status = new.status
    ) then
      raise exception 'invalid status transition for %: % -> %', tg_argv[0], old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- Каждый переход статуса → StatusEvent (§0, §8). Причина — из сессии app.status_reason (опционально).
create or replace function app.tg_status_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.status_events (company_id, entity_type, entity_id, from_status, to_status,
                                      actor_type, actor_id, reason)
    values (new.company_id, tg_argv[0], new.id,
            case when tg_op = 'UPDATE' then old.status end, new.status,
            case when auth.uid() is null then 'system' else 'user' end, auth.uid(),
            nullif(current_setting('app.status_reason', true), ''));
  end if;
  return null;
end;
$$;

-- AuditLog для денег и доступа (было → стало).
create or replace function app.tg_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (company_id, actor_type, actor_id, entity_type, entity_id, action, before, after)
  values (coalesce((v_row ->> 'company_id')::uuid, (v_row ->> 'id')::uuid),
          case when auth.uid() is null then 'system' else 'user' end, auth.uid(),
          tg_table_name, (v_row ->> 'id')::uuid, lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end;
$$;

-- Документы с деньгами не удаляются (§0 «Удаление»): ни hard delete, ни мягкое удаление.
create or replace function app.tg_forbid_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception '% cannot be deleted; use void/refund', tg_table_name using errcode = '42501';
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    raise exception '% cannot be soft-deleted; use void/refund', tg_table_name using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Хелпер: повесить стандартные триггеры на таблицу компании.
create or replace function app.attach_standard_triggers(p_table regclass, p_has_company boolean default true)
returns void language plpgsql set search_path = '' as $$
begin
  execute format('create trigger t10_service_fields before insert or update on %s
                  for each row execute function app.tg_service_fields()', p_table);
  if p_has_company then
    execute format('create trigger t11_company_id_immutable before update on %s
                    for each row execute function app.tg_company_id_immutable()', p_table);
  end if;
end;
$$;

-- =============================================================================
-- 4. CRM: источники, клиенты, контакты, объекты, лиды (§2)
-- =============================================================================

create table public.lead_sources (
  id                  uuid primary key default public.uuid_generate_v7(),
  company_id          uuid not null references public.companies (id),
  name                text not null,
  kind                text not null check (kind in ('paid_per_lead', 'paid_ads', 'organic', 'referral', 'repeat')),
  is_system           boolean not null default false,
  is_active           boolean not null default true,
  default_cost_cents  bigint check (default_cost_cents >= 0),
  currency            char(3) not null default 'USD',
  sender_patterns     text[] not null default '{}',
  deep_link_template  text,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  unique (company_id, name)
);

create table public.customers (
  id                       uuid primary key default public.uuid_generate_v7(),
  company_id               uuid not null references public.companies (id),
  kind                     text not null default 'person' check (kind in ('person', 'business')),
  display_name             text not null,
  first_name               text,
  last_name                text,
  company_name             text,
  primary_contact_id       uuid,                                    -- FK ниже
  billing_address_line1    text,
  billing_address_line2    text,
  billing_address_unit     text,
  billing_address_city     text,
  billing_address_state    text,
  billing_address_zip      text,
  billing_address_country  text default 'US',
  lead_source_id           uuid,
  tags                     text[] not null default '{}',
  status                   text not null default 'active' check (status in ('active', 'archived', 'do_not_service')),
  do_not_service_reason    text,
  notes                    text,
  match_key                text,
  merged_into_customer_id  uuid,
  anonymized_at            timestamptz,
  referral_code            text,
  review_status            text not null default 'not_asked' check (review_status in ('not_asked', 'asked', 'left', 'do_not_ask')),
  review_status_at         timestamptz,
  created_at_device        timestamptz,
  synced_at                timestamptz,
  origin_device_id         uuid,                                    -- → Device (позже)
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  unique (company_id, referral_code),
  check (status <> 'do_not_service' or do_not_service_reason is not null),
  foreign key (company_id, lead_source_id) references public.lead_sources (company_id, id),
  foreign key (company_id, merged_into_customer_id) references public.customers (company_id, id)
);
create index customers_company_name_idx on public.customers (company_id, display_name);
create index customers_match_key_idx on public.customers (company_id, match_key);

create table public.contacts (
  id                  uuid primary key default public.uuid_generate_v7(),
  company_id          uuid not null references public.companies (id),
  customer_id         uuid not null,
  name                text not null,
  phone               text,
  email               text,
  role                text not null default 'owner' check (role in ('owner', 'tenant', 'property_manager', 'spouse', 'other')),
  is_primary          boolean not null default false,
  is_active           boolean not null default true,
  preferred_language  text check (preferred_language in ('en', 'es')),
  sms_consent_status  text not null default 'unknown' check (sms_consent_status in ('unknown', 'opted_in', 'opted_out', 'pending_revocation_review')),
  sms_opted_out_at    timestamptz,
  email_unsubscribed_at timestamptz,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  foreign key (company_id, customer_id) references public.customers (company_id, id)
);
create unique index contacts_one_primary_idx on public.contacts (customer_id) where is_primary and deleted_at is null;
create index contacts_customer_idx on public.contacts (company_id, customer_id);

alter table public.customers
  add constraint customers_primary_contact_fk
  foreign key (company_id, primary_contact_id) references public.contacts (company_id, id);

create table public.properties (
  id                         uuid primary key default public.uuid_generate_v7(),
  company_id                 uuid not null references public.companies (id),
  customer_id                uuid not null,
  label                      text,
  kind                       text check (kind in ('single_family', 'multi_family', 'commercial', 'hoa_common')),
  address_line1              text not null,
  address_line2              text,
  address_unit               text,
  address_city               text not null,
  address_state              text not null default 'CA',
  address_zip                text,
  address_country            text not null default 'US',
  address_normalized         text,
  geo_lat                    numeric(9,6),
  geo_lng                    numeric(9,6),
  geo_source                 text check (geo_source in ('geocoder', 'manual')),
  stories                    int check (stories between 1 and 10),
  story_heights_override_ft  jsonb,
  roof_type                  text check (roof_type in ('comp_shingle', 'tile_clay', 'tile_concrete', 'metal', 'flat', 'other')),
  fire_zone                  text check (fire_zone in ('none', 'moderate', 'high', 'very_high')),
  access_notes               text,
  attributes                 jsonb not null default '{}'::jsonb,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  foreign key (company_id, customer_id) references public.customers (company_id, id)
);
-- gate_code намеренно не здесь: шифрование поля + RPC get_gate_code() (08-security §5.4) — следующая миграция.
create index properties_customer_idx on public.properties (company_id, customer_id);

create table public.leads (
  id                    uuid primary key default public.uuid_generate_v7(),
  company_id            uuid not null references public.companies (id),
  status                text not null default 'new'
                        check (status in ('new', 'contacted', 'qualified', 'inspection_scheduled', 'estimate_sent', 'won', 'lost', 'archived')),
  source_id             uuid not null,
  source_ref            text,
  customer_id           uuid,
  property_id           uuid,
  contact_name          text,
  phone                 text,
  email                 text,
  address_text          text,
  phone_is_relay        boolean not null default false,
  geo_lat               numeric(9,6),
  geo_lng               numeric(9,6),
  geo_status            text check (geo_status in ('ok', 'failed', 'manual', 'approx')),
  service_requested     text,
  message               text,                       -- текст обращения (app: Lead.message)
  received_at           timestamptz not null default now(),
  cost_cents            bigint check (cost_cents >= 0),
  cost_origin           text check (cost_origin in ('provider', 'manual', 'source_default')),
  cost_refunded_cents   bigint not null default 0 check (cost_refunded_cents >= 0),
  currency              char(3) not null default 'USD',
  first_response_at     timestamptz,
  first_response_kind   text check (first_response_kind in ('call', 'sms', 'email', 'marketplace', 'manual')),
  last_inbound_at       timestamptz,
  last_outbound_at      timestamptz,
  assigned_to           uuid references public.users (id),
  lost_reason           text check (lost_reason in ('price_too_high', 'no_response', 'chose_competitor', 'not_ready_timing',
                                                    'out_of_service_area', 'service_not_offered', 'junk_spam', 'duplicate', 'other')),
  lost_reason_text      text,
  duplicate_of_lead_id  uuid,
  inbound_message_id    text,
  referred_from_visit_id uuid,                      -- FK после visits
  utm                   jsonb,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  check (status <> 'lost' or lost_reason is not null),
  check (lost_reason is distinct from 'other' or lost_reason_text is not null),
  foreign key (company_id, source_id) references public.lead_sources (company_id, id),
  foreign key (company_id, customer_id) references public.customers (company_id, id),
  foreign key (company_id, property_id) references public.properties (company_id, id),
  foreign key (company_id, duplicate_of_lead_id) references public.leads (company_id, id)
);
create index leads_company_status_idx on public.leads (company_id, status, received_at desc);
create unique index leads_inbound_message_idx on public.leads (company_id, inbound_message_id) where inbound_message_id is not null;

-- =============================================================================
-- 5. Сметы (§4)
-- =============================================================================

create table public.estimates (
  id                    uuid primary key default public.uuid_generate_v7(),
  company_id            uuid not null references public.companies (id),
  number                text not null,
  customer_id           uuid not null,
  property_id           uuid not null,
  lead_id               uuid,
  service_category_id   uuid,                               -- → ServiceCategory (позже)
  title                 text,                               -- app: Estimate.title (в модели нет; см. README)
  status                text not null default 'draft'
                        check (status in ('draft', 'sent', 'viewed', 'awaiting_countersign', 'approved', 'declined', 'expired', 'cancelled_by_customer')),
  current_version_id    uuid,                               -- FK ниже; nullable до создания первой версии
  sent_version_id       uuid,
  expires_at            date,
  owner_user_id         uuid references public.users (id),
  viewed_count          int not null default 0,
  last_viewed_at        timestamptz,
  declined_reason       text check (declined_reason in ('price', 'chose_competitor', 'postponed', 'other')),
  declined_reason_text  text,
  created_via           text not null default 'manual'
                        check (created_via in ('manual', 'template', 'drawing', 'copy', 'ai', 'map_nearby', 'portal', 'import')),
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  unique (company_id, number),
  check (status <> 'declined' or declined_reason is not null),
  foreign key (company_id, customer_id) references public.customers (company_id, id),
  foreign key (company_id, property_id) references public.properties (company_id, id),
  foreign key (company_id, lead_id) references public.leads (company_id, id)
);
create index estimates_property_idx on public.estimates (company_id, property_id);
create index estimates_customer_idx on public.estimates (company_id, customer_id);

create table public.estimate_versions (
  id                            uuid primary key default public.uuid_generate_v7(),
  company_id                    uuid not null references public.companies (id),
  estimate_id                   uuid not null,
  version_no                    int not null check (version_no >= 1),
  drawing_id                    uuid,                       -- → Drawing (позже)
  drawing_version               int,
  intro_text                    text,
  scope_text                    text,
  terms_text                    text,
  exclusions_text               text,
  deposit_rule                  jsonb,
  contract_type                 text check (contract_type in ('ca_home_improvement', 'ca_service_repair', 'non_hic')),
  contract_template_id          uuid,
  contract_template_version     text,
  contract_rule_set_version     text,
  payment_schedule              jsonb,
  bond_attestation              jsonb,
  disaster_emergency_repair     boolean not null default false,
  emergency_declaration_ref     text,
  negotiated_at_contractor_office boolean not null default false,
  customer_initiated            boolean,
  service_request_scope         text,
  start_date_approx             date,
  completion_date_approx        date,
  substantial_commencement_text text,
  tax_enabled                   boolean not null default false,
  tax_rate_id                   uuid,                       -- → TaxRate (позже)
  tax_rate_bps                  int check (tax_rate_bps between 0 and 10000),
  tax_profile_id                uuid,                       -- → TaxProfile (позже)
  tax_mode                      text,
  include_purchase_tax_in_cost  boolean not null default false,
  totals                        jsonb,                      -- только видимое клиенту: subtotal, discount, tax, total по вариантам
  locked_at                     timestamptz,
  sent_at                       timestamptz,
  content_hash                  text,
  pdf_file_id                   uuid,
  engine_version                text,
  calc_inputs                   jsonb,
  calc_outputs                  jsonb,
  source                        text not null default 'scratch' check (source in ('scratch', 'template', 'drawing', 'ai', 'copy', 'import')),
  template_id                   uuid,
  copied_from_version_id        uuid,
  created_by_ai_action_id       uuid,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  unique (estimate_id, version_no),
  foreign key (company_id, estimate_id) references public.estimates (company_id, id),
  foreign key (company_id, copied_from_version_id) references public.estimate_versions (company_id, id)
);
create index estimate_versions_estimate_idx on public.estimate_versions (company_id, estimate_id);

alter table public.estimates
  add constraint estimates_current_version_fk
    foreign key (company_id, current_version_id) references public.estimate_versions (company_id, id),
  add constraint estimates_sent_version_fk
    foreign key (company_id, sent_version_id) references public.estimate_versions (company_id, id);

create table public.estimate_options (
  id              uuid primary key default public.uuid_generate_v7(),
  company_id      uuid not null references public.companies (id),
  version_id      uuid not null,
  name            text not null,
  position        int not null default 0,
  is_recommended  boolean not null default false,
  description     text,
  discount_mode   text check (discount_mode in ('pct', 'fixed')),
  discount_value  bigint check (discount_value >= 0),     -- bps при pct, центы при fixed
  tax_enabled     boolean,
  tax_rate_id     uuid,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  check ((discount_mode is null) = (discount_value is null)),
  foreign key (company_id, version_id) references public.estimate_versions (company_id, id)
);
create unique index estimate_options_one_recommended_idx on public.estimate_options (version_id) where is_recommended and deleted_at is null;
create index estimate_options_version_idx on public.estimate_options (company_id, version_id);

create table public.estimate_line_items (
  id                uuid primary key default public.uuid_generate_v7(),
  company_id        uuid not null references public.companies (id),
  option_id         uuid not null,
  position          int not null default 0,
  line_group        text,                                   -- модель: `group` (зарезервированное слово)
  catalog_item_id   uuid,                                   -- → CatalogItem (позже)
  assembly_id       uuid,                                   -- → Assembly (позже)
  origin            text not null default 'manual' check (origin in ('assembly', 'catalog', 'manual', 'ai')),
  name              text not null,
  description       text,
  quantity          numeric(14,4) not null default 1,
  calc_quantity     numeric(14,4),
  is_override       boolean not null default false,
  is_assumption     boolean not null default false,
  unit              text not null default 'ea',
  unit_price_cents  bigint not null default 0,
  currency          char(3) not null default 'USD',
  taxable           boolean not null default true,
  is_optional       boolean not null default false,
  client_visible    boolean not null default true,
  -- round half up (§0): floor(x + 0.5)
  line_total_cents  bigint generated always as (floor(quantity * unit_price_cents + 0.5)::bigint) stored,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  check (client_visible or unit_price_cents = 0),        -- BOM-строки всегда с ценой 0
  foreign key (company_id, option_id) references public.estimate_options (company_id, id)
);
create index estimate_line_items_option_idx on public.estimate_line_items (company_id, option_id, position);

-- Себестоимость строки — в таблице-спутнике со строгой RLS (06-architecture §4.3, 08-security §5.4):
-- tech и sub её не получают ни через API, ни через синхронизацию.
create table public.estimate_line_costs (
  line_item_id              uuid primary key,
  company_id                uuid not null references public.companies (id),
  unit_cost_cents           bigint not null default 0,
  unit_material_cost_cents  bigint,
  purchase_tax_bps          int check (purchase_tax_bps between 0 and 10000),
  markup_bps                int,
  line_cost_cents           bigint,                          -- считает движок (PRD 19 §7.6), сервер проверяет
  currency                  char(3) not null default 'USD',
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  foreign key (company_id, line_item_id) references public.estimate_line_items (company_id, id) on delete cascade
);

-- Отправленная версия не редактируется (§4, триггер БД).
create or replace function app.version_is_locked(p_version_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select locked_at is not null from public.estimate_versions where id = p_version_id), false);
$$;

create or replace function app.tg_estimate_version_lock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.locked_at is not null then
      raise exception 'estimate version % is locked', old.id using errcode = '42501';
    end if;
    return old;
  end if;
  if old.locked_at is not null then
    raise exception 'estimate version % is locked (sent versions are immutable; create a new version)', old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function app.tg_estimate_child_lock()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_version_id uuid;
  v_row        jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if tg_table_name = 'estimate_options' then
    v_version_id := (v_row ->> 'version_id')::uuid;
  elsif tg_table_name = 'estimate_line_items' then
    select o.version_id into v_version_id from public.estimate_options o where o.id = (v_row ->> 'option_id')::uuid;
  else -- estimate_line_costs
    select o.version_id into v_version_id
      from public.estimate_line_items li join public.estimate_options o on o.id = li.option_id
     where li.id = (v_row ->> 'line_item_id')::uuid;
  end if;
  if app.version_is_locked(v_version_id) then
    raise exception 'estimate version % is locked', v_version_id using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- =============================================================================
-- 6. Работы и визиты (§5)
-- =============================================================================

create table public.jobs (
  id                      uuid primary key default public.uuid_generate_v7(),
  company_id              uuid not null references public.companies (id),
  number                  text not null,
  title                   text,                               -- app: Job.title (в модели нет; см. README)
  customer_id             uuid not null,
  property_id             uuid not null,
  estimate_id             uuid,
  approved_version_id     uuid,
  option_id               uuid,
  status                  text not null default 'draft'
                          check (status in ('draft', 'scheduled', 'in_progress', 'on_hold', 'completed', 'closed', 'cancelled')),
  type                    text not null default 'install' check (type in ('install', 'repair', 'cleaning', 'inspection', 'warranty')),
  service_category_id     uuid,
  recurring_plan_id       uuid,                               -- → RecurringPlan (позже)
  occurrence_date         date,
  estimated_duration_min  int check (estimated_duration_min > 0),
  attributed_source_id    uuid,
  completed_at            timestamptz,
  closed_at               timestamptz,
  cancel_reason           text,
  cancelled_at            timestamptz,
  requires_permit         boolean not null default false,
  permit_number           text,
  checklist_template_id   uuid,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  unique (company_id, number),
  unique (estimate_id),                                       -- идемпотентная конверсия смета → работа
  unique (recurring_plan_id, occurrence_date),
  foreign key (company_id, customer_id) references public.customers (company_id, id),
  foreign key (company_id, property_id) references public.properties (company_id, id),
  foreign key (company_id, estimate_id) references public.estimates (company_id, id),
  foreign key (company_id, approved_version_id) references public.estimate_versions (company_id, id),
  foreign key (company_id, option_id) references public.estimate_options (company_id, id),
  foreign key (company_id, attributed_source_id) references public.lead_sources (company_id, id)
);
-- planned/actual/committed_cost_cents и cost_breakdown — в спутник job_costs (следующая миграция), не видны tech.
create index jobs_property_idx on public.jobs (company_id, property_id);
create index jobs_customer_idx on public.jobs (company_id, customer_id);

create table public.visits (
  id                          uuid primary key default public.uuid_generate_v7(),
  company_id                  uuid not null references public.companies (id),
  job_id                      uuid,
  lead_id                     uuid,                           -- осмотр по лиду до работы
  kind                        text not null default 'install' check (kind in ('inspection', 'install', 'service', 'follow_up')),
  starts_at                   timestamptz,
  ends_at                     timestamptz,
  schedule_mode               text not null default 'exact' check (schedule_mode in ('exact', 'flex_week')),
  flex_week_start             date,
  crew_id                     uuid,                           -- → Crew (позже)
  subcontractor_assignment_id uuid,                           -- → SubcontractorAssignment (позже)
  status                      text not null default 'scheduled'
                              check (status in ('scheduled', 'en_route', 'on_site', 'completed', 'cancelled', 'no_show')),
  arrival_window_start        timestamptz,
  arrival_window_end          timestamptz,
  sequence_in_route           int,
  eta_at                      timestamptz,
  notify_customer             boolean not null default true,
  customer_notified_at        timestamptz,
  created_via                 text not null default 'manual'
                              check (created_via in ('manual', 'template', 'drawing', 'copy', 'ai', 'map_nearby', 'portal', 'import')),
  notes                       text,
  -- Подшаги на объекте из приложения мастера (app VisitStep working/signed); в модели нет, см. README.
  work_started_at             timestamptz,
  signed_at                   timestamptz,
  signature_file_id           uuid,                           -- → File(kind=signature) (позже)
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  check (job_id is not null or lead_id is not null),
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  foreign key (company_id, job_id) references public.jobs (company_id, id),
  foreign key (company_id, lead_id) references public.leads (company_id, id)
);
create index visits_job_idx on public.visits (company_id, job_id);
create index visits_schedule_idx on public.visits (company_id, starts_at);

alter table public.leads
  add constraint leads_referred_from_visit_fk
  foreign key (company_id, referred_from_visit_id) references public.visits (company_id, id);

-- Назначенные на визит (модель: Visit.assigned_users[]). Отдельная таблица — для индексов
-- под RLS tech («exists visit_assignee», 06-architecture §4.2) и для синхронизации.
create table public.visit_assignees (
  id          uuid primary key default public.uuid_generate_v7(),
  company_id  uuid not null references public.companies (id),
  visit_id    uuid not null,
  user_id     uuid not null,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (visit_id, user_id),
  foreign key (company_id, visit_id) references public.visits (company_id, id) on delete cascade,
  foreign key (company_id, user_id) references public.memberships (company_id, user_id)   -- только члены этой компании
);
create index visit_assignees_user_idx on public.visit_assignees (user_id, visit_id) where deleted_at is null;

-- Подшаги визита только вперёд: работа начинается на объекте, подпись — после начала работы.
create or replace function app.tg_visit_steps()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.work_started_at is not null and new.work_started_at is distinct from old.work_started_at then
      raise exception 'visit step cannot go back: work_started_at is already set' using errcode = 'check_violation';
    end if;
    if old.signed_at is not null and new.signed_at is distinct from old.signed_at then
      raise exception 'visit step cannot go back: signed_at is already set' using errcode = 'check_violation';
    end if;
  end if;
  if new.work_started_at is not null and (tg_op = 'INSERT' or old.work_started_at is null)
     and new.status not in ('on_site', 'completed') then
    raise exception 'invalid visit step: work can start only on_site (status %)', new.status using errcode = 'check_violation';
  end if;
  if new.signed_at is not null and new.work_started_at is null then
    raise exception 'invalid visit step: signature requires work_started_at' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and new.status not in ('scheduled') and auth.uid() is not null then
    raise exception 'visit must be created as scheduled' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- =============================================================================
-- 7. Деньги (§6)
-- =============================================================================

create table public.invoices (
  id                          uuid primary key default public.uuid_generate_v7(),
  company_id                  uuid not null references public.companies (id),
  number                      text not null,
  customer_id                 uuid not null,
  job_id                      uuid,
  kind                        text not null default 'final' check (kind in ('deposit', 'progress', 'final', 'standalone', 'recurring')),
  status                      text not null default 'draft' check (status in ('draft', 'sent', 'void')),
  payment_status              text not null default 'unpaid' check (payment_status in ('unpaid', 'partially_paid', 'paid', 'refunded')),
  due_date                    date,
  currency                    char(3) not null default 'USD',
  subtotal_cents              bigint not null default 0,
  discount_cents              bigint not null default 0 check (discount_cents >= 0),
  tax_cents                   bigint not null default 0 check (tax_cents >= 0),
  total_cents                 bigint not null default 0,
  paid_cents                  bigint not null default 0,   -- ведёт триггер по платежам (paid_net)
  balance_cents               bigint generated always as (total_cents - paid_cents) stored,
  tax_enabled                 boolean not null default false,
  tax_rate_id                 uuid,
  tax_rate_bps                int check (tax_rate_bps between 0 and 10000),
  tax_profile_id              uuid,
  tax_mode                    text,
  include_purchase_tax_in_cost boolean not null default false,
  revision                    int not null default 1,
  sent_at                     timestamptz,
  viewed_at                   timestamptz,
  reminders_paused            boolean not null default false,
  reminder_state              jsonb,
  source_estimate_version_id  uuid,
  void_reason                 text,
  voided_by                   uuid references public.users (id),
  voided_at                   timestamptz,
  customer_payment_claim      jsonb,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  unique (company_id, number),
  check (job_id is not null or kind in ('standalone', 'recurring')),
  check (status <> 'void' or void_reason is not null),
  foreign key (company_id, customer_id) references public.customers (company_id, id),
  foreign key (company_id, job_id) references public.jobs (company_id, id),
  foreign key (company_id, source_estimate_version_id) references public.estimate_versions (company_id, id)
);
-- На Job ≤ 1 не-void deposit и ≤ 1 не-void final.
create unique index invoices_one_deposit_final_idx on public.invoices (job_id, kind)
  where kind in ('deposit', 'final') and status <> 'void';
create index invoices_customer_idx on public.invoices (company_id, customer_id);
create index invoices_job_idx on public.invoices (company_id, job_id);

create table public.payments (
  id                        uuid primary key default public.uuid_generate_v7(),
  company_id                uuid not null references public.companies (id),
  invoice_id                uuid,
  customer_id               uuid not null,
  visit_id                  uuid,                          -- выезд, на котором принята оплата (нет в модели; см. README)
  method                    text not null check (method in ('card', 'ach', 'tap_to_pay', 'cash', 'check', 'zelle', 'financing', 'other')),
  amount_cents              bigint not null check (amount_cents > 0),
  refunded_cents            bigint not null default 0,     -- Σ Refund (таблица Refund — позже)
  fee_cents                 bigint not null default 0 check (fee_cents >= 0),
  platform_fee_cents        bigint not null default 0 check (platform_fee_cents >= 0),
  currency                  char(3) not null default 'USD',
  status                    text not null default 'pending'
                            check (status in ('pending', 'succeeded', 'failed', 'partially_refunded', 'refunded', 'returned', 'voided')),
  stripe_payment_intent_id  text,
  stripe_charge_id          text,
  payout_id                 text,
  idempotency_key           text not null unique,
  received_by               uuid references public.users (id),
  received_at               timestamptz not null default now(),
  reference                 text,
  proof_file_id             uuid,
  needs_review              boolean not null default false,
  dispute_status            text not null default 'none' check (dispute_status in ('none', 'open', 'won', 'lost')),
  offline_created           boolean not null default false,
  return_reason             text,
  receipt_number            text,
  receipt_file_id           uuid,
  receipt_sent_at           timestamptz,
  void_reason               text,
  voided_by                 uuid references public.users (id),
  voided_at                 timestamptz,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  unique (company_id, receipt_number),
  check (refunded_cents between 0 and amount_cents),
  check (status <> 'voided' or void_reason is not null),
  foreign key (company_id, invoice_id) references public.invoices (company_id, id),
  foreign key (company_id, customer_id) references public.customers (company_id, id),
  foreign key (company_id, visit_id) references public.visits (company_id, id)
);
create index payments_invoice_idx on public.payments (company_id, invoice_id);
create index payments_visit_idx on public.payments (company_id, visit_id);

-- Инвойс: оплата (paid_cents, payment_status) меняется только триггером платежей;
-- void — только owner/admin, с причиной, при paid_net = 0 (§6, матрица прав).
create or replace function app.tg_invoice_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.paid_cents := 0;
    new.payment_status := 'unpaid';
    if new.status = 'void' then
      raise exception 'invoice cannot be created void' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if pg_trigger_depth() = 1 then          -- прямое изменение пользователем, не пересчёт из платежей
    new.paid_cents := old.paid_cents;
    new.payment_status := old.payment_status;
  end if;

  if old.status = 'void' then
    raise exception 'void invoice % is immutable', old.number using errcode = '42501';
  end if;

  if new.status = 'void' and old.status <> 'void' then
    if auth.uid() is not null and not app.has_role(new.company_id, array['owner', 'admin']) then
      raise exception 'only owner/admin can void an invoice' using errcode = '42501';
    end if;
    if old.paid_cents <> 0 or exists (
         select 1 from public.payments p
         where p.invoice_id = old.id and p.status in ('pending', 'succeeded', 'partially_refunded')
           and p.amount_cents - p.refunded_cents > 0) then
      raise exception 'invoice % has payments; refund or move to credit before void', old.number
        using errcode = 'check_violation';
    end if;
    new.voided_at := coalesce(new.voided_at, now());
    new.voided_by := coalesce(auth.uid(), new.voided_by);
  end if;
  return new;
end;
$$;

-- Платёж: суммы, метод, привязки неизменяемы; только переходы статуса (void/refund/return).
create or replace function app.tg_payment_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('pending', 'succeeded') then
      raise exception 'payment must be created as pending or succeeded' using errcode = 'check_violation';
    end if;
    if new.refunded_cents <> 0 then
      raise exception 'new payment cannot be refunded' using errcode = 'check_violation';
    end if;
    new.received_by := coalesce(new.received_by, auth.uid());
  else
    if new.amount_cents is distinct from old.amount_cents
       or new.method is distinct from old.method
       or new.currency is distinct from old.currency
       or new.invoice_id is distinct from old.invoice_id and old.invoice_id is not null
       or new.customer_id is distinct from old.customer_id
       or new.visit_id is distinct from old.visit_id
       or new.idempotency_key is distinct from old.idempotency_key
       or new.received_by is distinct from old.received_by
       or new.received_at is distinct from old.received_at
       or new.receipt_number is distinct from old.receipt_number and old.receipt_number is not null then
      raise exception 'payment % is immutable except status (use void/refund)', old.id using errcode = '42501';
    end if;
    if new.refunded_cents < old.refunded_cents then
      raise exception 'refunded_cents can only grow' using errcode = 'check_violation';
    end if;
    if new.status = 'voided' and old.status <> 'voided' then
      if auth.uid() is not null and not app.has_role(new.company_id, array['owner', 'admin']) then
        raise exception 'only owner/admin can void a payment' using errcode = '42501';
      end if;
      if old.method in ('card', 'ach', 'tap_to_pay') then
        raise exception 'processor payments are refunded, not voided' using errcode = 'check_violation';
      end if;
      new.voided_at := coalesce(new.voided_at, now());
      new.voided_by := coalesce(auth.uid(), new.voided_by);
    end if;
    if new.status in ('partially_refunded', 'refunded') and new.status is distinct from old.status
       and auth.uid() is not null and not app.has_role(new.company_id, array['owner', 'admin']) then
      raise exception 'only owner/admin can refund' using errcode = '42501';
    end if;
    if new.status = 'refunded' then
      new.refunded_cents := new.amount_cents;
    end if;
  end if;

  -- Квитанция RCT-0001 — сервер при succeeded (§6 Payment.receipt_number)
  if new.status = 'succeeded' and new.receipt_number is null then
    new.receipt_number := app.next_document_number(new.company_id, 'receipt', 'RCT');
  end if;
  return new;
end;
$$;

-- Пересчёт оплаты инвойса: paid_net = Σ (amount − refunded) по succeeded / partially_refunded / refunded.
create or replace function app.recalc_invoice_payment(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_paid      bigint;
  v_refunded  boolean;
begin
  if p_invoice_id is null then return; end if;
  select coalesce(sum(p.amount_cents - p.refunded_cents) filter (where p.status in ('succeeded', 'partially_refunded', 'refunded')), 0),
         coalesce(bool_or(p.refunded_cents > 0), false)
    into v_paid, v_refunded
    from public.payments p where p.invoice_id = p_invoice_id;

  update public.invoices i
     set paid_cents = v_paid,
         payment_status = case
           when v_paid > 0 and v_paid >= i.total_cents then 'paid'
           when v_paid > 0 then 'partially_paid'
           when v_refunded then 'refunded'
           else 'unpaid' end
   where i.id = p_invoice_id;
end;
$$;

create or replace function app.tg_payment_recalc()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app.recalc_invoice_payment(new.invoice_id);
  if tg_op = 'UPDATE' and old.invoice_id is distinct from new.invoice_id then
    perform app.recalc_invoice_payment(old.invoice_id);
  end if;
  return null;
end;
$$;

-- =============================================================================
-- 8. Журналы (§8): StatusEvent, AuditLog — append-only
-- =============================================================================

create table public.status_events (
  id           uuid primary key default public.uuid_generate_v7(),
  company_id   uuid not null references public.companies (id),
  entity_type  text not null,
  entity_id    uuid not null,
  from_status  text,
  to_status    text not null,
  actor_type   text not null check (actor_type in ('user', 'ai', 'system', 'customer', 'subcontractor', 'support')),
  actor_id     uuid,
  reason       text,
  at           timestamptz not null default now(),   -- для офлайна — время действия на устройстве (ставит /sync/ops)
  synced_at    timestamptz not null default now()
);
create index status_events_entity_idx on public.status_events (company_id, entity_type, entity_id, at);

create table public.audit_log (
  id                    uuid primary key default public.uuid_generate_v7(),
  company_id            uuid not null references public.companies (id),
  actor_type            text not null check (actor_type in ('user', 'ai', 'system', 'customer', 'subcontractor', 'support')),
  actor_id              uuid,
  on_behalf_of_user_id  uuid,
  entity_type           text not null,
  entity_id             uuid,
  action                text not null,
  before                jsonb,
  after                 jsonb,
  ip                    inet,
  at                    timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (company_id, entity_type, entity_id, at);

create or replace function app.tg_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

-- =============================================================================
-- 9. Пользователи и компании: автоматизация
-- =============================================================================

-- auth.users → public.users (стандартный приём Supabase).
create or replace function app.tg_handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, full_name, locale)
  values (new.id, new.email,
          coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email),
          coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'en'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.tg_handle_new_auth_user();

-- Создатель компании становится её owner (онбординг).
create or replace function app.tg_company_owner_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    insert into public.memberships (company_id, user_id, role, status, can_sign_contracts)
    values (new.id, auth.uid(), 'owner', 'active', true);
  end if;
  return null;
end;
$$;

-- Роль owner выдаёт только owner; admin не может менять членство owner и повышать себя.
create or replace function app.tg_membership_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;      -- система / онбординг (триггер компании)
  end if;
  if (new.role = 'owner' or (tg_op = 'UPDATE' and old.role = 'owner'))
     and not app.has_role(new.company_id, array['owner']) then
    raise exception 'only owner can grant or change the owner role' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.user_id = auth.uid() and new.role is distinct from old.role then
    raise exception 'cannot change your own role' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- =============================================================================
-- 10. Подключение триггеров
-- =============================================================================

do $$
declare t regclass;
begin
  perform app.attach_standard_triggers('public.users', false);
  perform app.attach_standard_triggers('public.companies', false);
  foreach t in array array[
  'public.memberships', 'public.lead_sources', 'public.customers', 'public.contacts', 'public.properties',
  'public.leads', 'public.estimates', 'public.estimate_versions', 'public.estimate_options',
  'public.estimate_line_items', 'public.estimate_line_costs', 'public.jobs', 'public.visits',
    'public.visit_assignees', 'public.invoices', 'public.payments'
  ]::regclass[] loop
    perform app.attach_standard_triggers(t);
  end loop;
end $$;

create trigger t90_company_owner after insert on public.companies
  for each row execute function app.tg_company_owner_membership();
create trigger t20_membership_guard before insert or update on public.memberships
  for each row execute function app.tg_membership_guard();
create trigger t90_audit after insert or update or delete on public.memberships
  for each row execute function app.tg_audit();

-- Номера документов
create trigger t20_number before insert or update on public.estimates
  for each row execute function app.tg_assign_number('estimate', 'EST');
create trigger t20_number before insert or update on public.jobs
  for each row execute function app.tg_assign_number('job', 'JOB');
create trigger t20_number before insert or update on public.invoices
  for each row execute function app.tg_assign_number('invoice', 'INV');

-- State machines + StatusEvent
create trigger t30_guard_status before update on public.leads
  for each row execute function app.tg_guard_status('lead');
create trigger t30_guard_status before update on public.estimates
  for each row execute function app.tg_guard_status('estimate');
create trigger t30_guard_status before update on public.jobs
  for each row execute function app.tg_guard_status('job');
create trigger t30_guard_status before update on public.visits
  for each row execute function app.tg_guard_status('visit');
create trigger t30_guard_status before update on public.invoices
  for each row execute function app.tg_guard_status('invoice');
create trigger t30_guard_status before update on public.payments
  for each row execute function app.tg_guard_status('payment');

create trigger t80_status_event after insert or update of status on public.leads
  for each row execute function app.tg_status_event('lead');
create trigger t80_status_event after insert or update of status on public.estimates
  for each row execute function app.tg_status_event('estimate');
create trigger t80_status_event after insert or update of status on public.jobs
  for each row execute function app.tg_status_event('job');
create trigger t80_status_event after insert or update of status on public.visits
  for each row execute function app.tg_status_event('visit');
create trigger t80_status_event after insert or update of status on public.invoices
  for each row execute function app.tg_status_event('invoice');
create trigger t80_status_event after insert or update of status on public.payments
  for each row execute function app.tg_status_event('payment');

create trigger t40_visit_steps before insert or update on public.visits
  for each row execute function app.tg_visit_steps();

-- Сметы: блокировка отправленной версии
create trigger t40_version_lock before update or delete on public.estimate_versions
  for each row execute function app.tg_estimate_version_lock();
create trigger t40_child_lock before insert or update or delete on public.estimate_options
  for each row execute function app.tg_estimate_child_lock();
create trigger t40_child_lock before insert or update or delete on public.estimate_line_items
  for each row execute function app.tg_estimate_child_lock();
create trigger t40_child_lock before insert or update or delete on public.estimate_line_costs
  for each row execute function app.tg_estimate_child_lock();

-- Деньги
create trigger t05_forbid_delete before update or delete on public.invoices
  for each row execute function app.tg_forbid_delete();
create trigger t05_forbid_delete before update or delete on public.payments
  for each row execute function app.tg_forbid_delete();
create trigger t40_invoice_guard before insert or update on public.invoices
  for each row execute function app.tg_invoice_guard();
create trigger t40_payment_guard before insert or update on public.payments
  for each row execute function app.tg_payment_guard();
create trigger t85_payment_recalc after insert or update on public.payments
  for each row execute function app.tg_payment_recalc();
create trigger t90_audit after insert or update on public.invoices
  for each row execute function app.tg_audit();
create trigger t90_audit after insert or update on public.payments
  for each row execute function app.tg_audit();

-- Журналы — только добавление
create trigger t01_append_only before update or delete on public.status_events
  for each row execute function app.tg_append_only();
create trigger t01_append_only before update or delete on public.audit_log
  for each row execute function app.tg_append_only();

-- =============================================================================
-- 11. Helper-функции доступа (SECURITY DEFINER, search_path = '')
--    Не возвращают данных — только bool; используются в политиках RLS.
-- =============================================================================

create or replace function app.is_member(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
  );
$$;

create or replace function app.has_role(p_company_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
      and m.role = any (p_roles)
  );
$$;

-- «Офис»: видит всех клиентов и цены (матрица прав: owner, admin, office, sales).
create or replace function app.is_staff(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.has_role(p_company_id, array['owner', 'admin', 'office', 'sales']);
$$;

-- Себестоимость и маржа: owner/admin/office или override view_costs (матрица прав, строка 1).
create or replace function app.can_view_costs(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
      and (m.role in ('owner', 'admin', 'office')
           or coalesce((m.permissions_override ->> 'view_costs')::boolean, false))
  );
$$;

create or replace function app.is_visit_assignee(p_visit_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.visit_assignees a
    join public.visits v on v.id = a.visit_id
    where a.visit_id = p_visit_id
      and a.user_id = auth.uid()
      and a.deleted_at is null
      and v.deleted_at is null
  );
$$;

create or replace function app.is_job_assignee(p_job_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.visits v
    join public.visit_assignees a on a.visit_id = v.id and a.deleted_at is null
    where v.job_id = p_job_id
      and v.deleted_at is null
      and a.user_id = auth.uid()
  );
$$;

create or replace function app.is_customer_assignee(p_customer_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.jobs j
    join public.visits v on v.job_id = j.id and v.deleted_at is null
    join public.visit_assignees a on a.visit_id = v.id and a.deleted_at is null
    where j.customer_id = p_customer_id
      and j.deleted_at is null
      and a.user_id = auth.uid()
  );
$$;

create or replace function app.is_property_assignee(p_property_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.jobs j
    join public.visits v on v.job_id = j.id and v.deleted_at is null
    join public.visit_assignees a on a.visit_id = v.id and a.deleted_at is null
    where j.property_id = p_property_id
      and j.deleted_at is null
      and a.user_id = auth.uid()
  );
$$;

create or replace function app.shares_company(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.company_id = mine.company_id and theirs.deleted_at is null
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and mine.deleted_at is null
      and theirs.user_id = p_user_id
  );
$$;

-- Смета: офис видит все; tech — свои черновики и сметы по объектам своих работ.
create or replace function app.can_read_estimate(p_estimate_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.estimates e
    where e.id = p_estimate_id
      and (app.is_staff(e.company_id)
           or (app.has_role(e.company_id, array['tech'])
               and (e.created_by = auth.uid() or app.is_property_assignee(e.property_id))))
  );
$$;

-- Правка: офис — любая; tech — только свой черновик (матрица: «черновик (⚙ отправка)»).
create or replace function app.can_edit_estimate(p_estimate_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.estimates e
    where e.id = p_estimate_id
      and e.deleted_at is null
      and (app.is_staff(e.company_id)
           or (app.has_role(e.company_id, array['tech'])
               and e.created_by = auth.uid()
               and e.status = 'draft'))
  );
$$;

create or replace function app.version_estimate_id(p_version_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select estimate_id from public.estimate_versions where id = p_version_id;
$$;

create or replace function app.option_estimate_id(p_option_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select v.estimate_id from public.estimate_options o
  join public.estimate_versions v on v.id = o.version_id
  where o.id = p_option_id;
$$;

create or replace function app.line_item_estimate_id(p_line_item_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select v.estimate_id from public.estimate_line_items li
  join public.estimate_options o on o.id = li.option_id
  join public.estimate_versions v on v.id = o.version_id
  where li.id = p_line_item_id;
$$;

-- Оплата на объекте: tech назначен на визит, инвойс (если указан) — той же работы, клиент — клиент работы.
create or replace function app.tech_can_record_payment(p_visit_id uuid, p_invoice_id uuid, p_customer_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_visit_assignee(p_visit_id)
     and exists (
       select 1 from public.visits v
       join public.jobs j on j.id = v.job_id
       where v.id = p_visit_id
         and v.status in ('on_site', 'completed')
         and j.customer_id = p_customer_id
         and (p_invoice_id is null
              or exists (select 1 from public.invoices i
                         where i.id = p_invoice_id and i.job_id = j.id and i.status <> 'void'))
     );
$$;

-- =============================================================================
-- 12. Row Level Security
--     Правило: строку видит только член компании (active membership);
--     роли сужают по матрице прав (§1). Удаление — только где явно разрешено.
-- =============================================================================

alter table public.users                enable row level security;
alter table public.companies            enable row level security;
alter table public.memberships          enable row level security;
alter table public.lead_sources         enable row level security;
alter table public.customers            enable row level security;
alter table public.contacts             enable row level security;
alter table public.properties           enable row level security;
alter table public.leads                enable row level security;
alter table public.estimates            enable row level security;
alter table public.estimate_versions    enable row level security;
alter table public.estimate_options     enable row level security;
alter table public.estimate_line_items  enable row level security;
alter table public.estimate_line_costs  enable row level security;
alter table public.jobs                 enable row level security;
alter table public.visits               enable row level security;
alter table public.visit_assignees      enable row level security;
alter table public.invoices             enable row level security;
alter table public.payments             enable row level security;
alter table public.status_events        enable row level security;
alter table public.audit_log            enable row level security;
alter table app.company_numbering       enable row level security;   -- без политик: только definer-функции
alter table app.status_transitions      enable row level security;

alter table public.users                force row level security;
alter table public.companies            force row level security;
alter table public.memberships          force row level security;
alter table public.lead_sources         force row level security;
alter table public.customers            force row level security;
alter table public.contacts             force row level security;
alter table public.properties           force row level security;
alter table public.leads                force row level security;
alter table public.estimates            force row level security;
alter table public.estimate_versions    force row level security;
alter table public.estimate_options     force row level security;
alter table public.estimate_line_items  force row level security;
alter table public.estimate_line_costs  force row level security;
alter table public.jobs                 force row level security;
alter table public.visits               force row level security;
alter table public.visit_assignees      force row level security;
alter table public.invoices             force row level security;
alter table public.payments             force row level security;
alter table public.status_events        force row level security;
alter table public.audit_log            force row level security;

-- ---- users -------------------------------------------------------------------
create policy users_select on public.users for select to authenticated
  using (id = (select auth.uid()) or app.shares_company(id));
create policy users_update on public.users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---- companies ---------------------------------------------------------------
create policy companies_select on public.companies for select to authenticated
  using (app.is_member(id) or created_by = (select auth.uid()));
create policy companies_insert on public.companies for insert to authenticated
  with check ((select auth.uid()) is not null);
create policy companies_update on public.companies for update to authenticated
  using (app.has_role(id, array['owner', 'admin'])) with check (app.has_role(id, array['owner', 'admin']));

-- ---- memberships -------------------------------------------------------------
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or app.is_member(company_id));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (app.has_role(company_id, array['owner', 'admin']));
create policy memberships_update on public.memberships for update to authenticated
  using (app.has_role(company_id, array['owner', 'admin']))
  with check (app.has_role(company_id, array['owner', 'admin']));

-- ---- lead_sources: видят все члены; меняет офис -----------------------------
create policy lead_sources_select on public.lead_sources for select to authenticated
  using (app.is_member(company_id));
create policy lead_sources_insert on public.lead_sources for insert to authenticated
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));
create policy lead_sources_update on public.lead_sources for update to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office']))
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));

-- ---- customers / contacts / properties: офис — все; tech — только по своим работам
create policy customers_select on public.customers for select to authenticated
  using (app.is_staff(company_id)
         or (app.has_role(company_id, array['tech']) and deleted_at is null and app.is_customer_assignee(id)));
create policy customers_insert on public.customers for insert to authenticated
  with check (app.is_staff(company_id));
create policy customers_update on public.customers for update to authenticated
  using (app.is_staff(company_id)) with check (app.is_staff(company_id));

create policy contacts_select on public.contacts for select to authenticated
  using (app.is_staff(company_id)
         or (app.has_role(company_id, array['tech']) and deleted_at is null and app.is_customer_assignee(customer_id)));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (app.is_staff(company_id));
create policy contacts_update on public.contacts for update to authenticated
  using (app.is_staff(company_id)) with check (app.is_staff(company_id));

create policy properties_select on public.properties for select to authenticated
  using (app.is_staff(company_id)
         or (app.has_role(company_id, array['tech']) and deleted_at is null and app.is_property_assignee(id)));
create policy properties_insert on public.properties for insert to authenticated
  with check (app.is_staff(company_id));
create policy properties_update on public.properties for update to authenticated
  using (app.is_staff(company_id)) with check (app.is_staff(company_id));

-- ---- leads: только офис (у лида cost_cents; tech лиды не видит в MVP) -------
create policy leads_select on public.leads for select to authenticated
  using (app.is_staff(company_id));
create policy leads_insert on public.leads for insert to authenticated
  with check (app.is_staff(company_id));
create policy leads_update on public.leads for update to authenticated
  using (app.is_staff(company_id)) with check (app.is_staff(company_id));

-- ---- jobs --------------------------------------------------------------------
create policy jobs_select on public.jobs for select to authenticated
  using (app.is_staff(company_id)
         or (app.has_role(company_id, array['tech']) and deleted_at is null and app.is_job_assignee(id)));
create policy jobs_insert on public.jobs for insert to authenticated
  with check (app.has_role(company_id, array['owner', 'admin', 'office', 'sales']));
create policy jobs_update on public.jobs for update to authenticated
  using (app.is_staff(company_id)) with check (app.is_staff(company_id));

-- ---- visits / visit_assignees ------------------------------------------------
create policy visits_select on public.visits for select to authenticated
  using (app.is_staff(company_id)
         or (app.has_role(company_id, array['tech']) and deleted_at is null and app.is_visit_assignee(id)));
create policy visits_insert on public.visits for insert to authenticated
  with check (app.is_staff(company_id));
create policy visits_update_staff on public.visits for update to authenticated
  using (app.is_staff(company_id)) with check (app.is_staff(company_id));
create policy visits_update_tech on public.visits for update to authenticated
  using (app.has_role(company_id, array['tech']) and deleted_at is null and app.is_visit_assignee(id))
  with check (app.has_role(company_id, array['tech']) and deleted_at is null and app.is_visit_assignee(id));

create policy visit_assignees_select on public.visit_assignees for select to authenticated
  using (app.is_staff(company_id)
         or (app.has_role(company_id, array['tech']) and app.is_visit_assignee(visit_id)));
create policy visit_assignees_insert on public.visit_assignees for insert to authenticated
  with check (app.is_staff(company_id));
create policy visit_assignees_update on public.visit_assignees for update to authenticated
  using (app.is_staff(company_id)) with check (app.is_staff(company_id));
create policy visit_assignees_delete on public.visit_assignees for delete to authenticated
  using (app.is_staff(company_id));

-- ---- estimates (+ versions, options, lines) ----------------------------------
create policy estimates_select on public.estimates for select to authenticated
  using (app.is_staff(company_id)
         or (app.has_role(company_id, array['tech']) and deleted_at is null
             and (created_by = (select auth.uid()) or app.is_property_assignee(property_id))));
create policy estimates_insert on public.estimates for insert to authenticated
  with check (app.is_staff(company_id)
              or (app.has_role(company_id, array['tech']) and status = 'draft'
                  and app.is_property_assignee(property_id)));
create policy estimates_update on public.estimates for update to authenticated
  using (app.can_edit_estimate(id))
  with check (app.is_staff(company_id) or (app.has_role(company_id, array['tech']) and status = 'draft'));

create policy estimate_versions_select on public.estimate_versions for select to authenticated
  using (app.is_member(company_id) and app.can_read_estimate(estimate_id));
create policy estimate_versions_insert on public.estimate_versions for insert to authenticated
  with check (app.is_member(company_id) and app.can_edit_estimate(estimate_id));
create policy estimate_versions_update on public.estimate_versions for update to authenticated
  using (app.is_member(company_id) and app.can_edit_estimate(estimate_id))
  with check (app.is_member(company_id) and app.can_edit_estimate(estimate_id));

create policy estimate_options_select on public.estimate_options for select to authenticated
  using (app.is_member(company_id) and app.can_read_estimate(app.version_estimate_id(version_id)));
create policy estimate_options_insert on public.estimate_options for insert to authenticated
  with check (app.is_member(company_id) and app.can_edit_estimate(app.version_estimate_id(version_id)));
create policy estimate_options_update on public.estimate_options for update to authenticated
  using (app.is_member(company_id) and app.can_edit_estimate(app.version_estimate_id(version_id)))
  with check (app.is_member(company_id) and app.can_edit_estimate(app.version_estimate_id(version_id)));
create policy estimate_options_delete on public.estimate_options for delete to authenticated
  using (app.is_member(company_id) and app.can_edit_estimate(app.version_estimate_id(version_id)));

create policy estimate_line_items_select on public.estimate_line_items for select to authenticated
  using (app.is_member(company_id) and app.can_read_estimate(app.option_estimate_id(option_id)));
create policy estimate_line_items_insert on public.estimate_line_items for insert to authenticated
  with check (app.is_member(company_id) and app.can_edit_estimate(app.option_estimate_id(option_id)));
create policy estimate_line_items_update on public.estimate_line_items for update to authenticated
  using (app.is_member(company_id) and app.can_edit_estimate(app.option_estimate_id(option_id)))
  with check (app.is_member(company_id) and app.can_edit_estimate(app.option_estimate_id(option_id)));
create policy estimate_line_items_delete on public.estimate_line_items for delete to authenticated
  using (app.is_member(company_id) and app.can_edit_estimate(app.option_estimate_id(option_id)));

-- Себестоимость: только owner/admin/office (или override view_costs)
create policy estimate_line_costs_select on public.estimate_line_costs for select to authenticated
  using (app.can_view_costs(company_id));
create policy estimate_line_costs_insert on public.estimate_line_costs for insert to authenticated
  with check (app.can_view_costs(company_id) and app.can_edit_estimate(app.line_item_estimate_id(line_item_id)));
create policy estimate_line_costs_update on public.estimate_line_costs for update to authenticated
  using (app.can_view_costs(company_id) and app.can_edit_estimate(app.line_item_estimate_id(line_item_id)))
  with check (app.can_view_costs(company_id) and app.can_edit_estimate(app.line_item_estimate_id(line_item_id)));
create policy estimate_line_costs_delete on public.estimate_line_costs for delete to authenticated
  using (app.can_view_costs(company_id) and app.can_edit_estimate(app.line_item_estimate_id(line_item_id)));

-- ---- invoices: офис создаёт и меняет; tech видит инвойсы своих работ; удаления нет
create policy invoices_select on public.invoices for select to authenticated
  using (app.is_staff(company_id)
         or (app.has_role(company_id, array['tech']) and job_id is not null and app.is_job_assignee(job_id)));
create policy invoices_insert on public.invoices for insert to authenticated
  with check (app.has_role(company_id, array['owner', 'admin', 'office', 'sales']));
create policy invoices_update on public.invoices for update to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office', 'sales']))
  with check (app.has_role(company_id, array['owner', 'admin', 'office', 'sales']));

-- ---- payments: принимают owner/admin/office/sales; tech — «на объекте» по своему визиту;
--      изменения (void/refund) — только owner/admin; удаления нет
create policy payments_select on public.payments for select to authenticated
  using (app.is_staff(company_id)
         or (app.has_role(company_id, array['tech'])
             and (received_by = (select auth.uid()) or (visit_id is not null and app.is_visit_assignee(visit_id)))));
create policy payments_insert_staff on public.payments for insert to authenticated
  with check (app.has_role(company_id, array['owner', 'admin', 'office', 'sales']));
create policy payments_insert_tech on public.payments for insert to authenticated
  with check (app.has_role(company_id, array['tech'])
              and visit_id is not null
              and received_by = (select auth.uid())
              and app.tech_can_record_payment(visit_id, invoice_id, customer_id));
create policy payments_update on public.payments for update to authenticated
  using (app.has_role(company_id, array['owner', 'admin']))
  with check (app.has_role(company_id, array['owner', 'admin']));

-- ---- журналы -----------------------------------------------------------------
create policy status_events_select on public.status_events for select to authenticated
  using (app.is_staff(company_id)
         or (app.has_role(company_id, array['tech']) and entity_type = 'visit' and app.is_visit_assignee(entity_id)));
create policy audit_log_select on public.audit_log for select to authenticated
  using (app.has_role(company_id, array['owner', 'admin']));

-- =============================================================================
-- 13. Представления
-- =============================================================================

-- Баланс клиента (app: Customer.balanceCents): Σ остатков не-void отправленных инвойсов.
-- security_invoker → работает под RLS вызывающего.
create view public.customer_balances
with (security_invoker = true) as
select i.company_id,
       i.customer_id,
       i.currency,
       sum(i.balance_cents)::bigint as balance_cents
from public.invoices i
where i.status = 'sent'
group by i.company_id, i.customer_id, i.currency;

-- =============================================================================
-- 14. Права (Supabase по умолчанию выдаёт anon/authenticated всё — сужаем явно)
-- =============================================================================

revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema app from public, anon, authenticated;
revoke all on all functions in schema app from public, anon, authenticated;

grant usage on schema app to authenticated;
grant execute on function
  app.is_member(uuid), app.has_role(uuid, text[]), app.is_staff(uuid), app.can_view_costs(uuid),
  app.is_visit_assignee(uuid), app.is_job_assignee(uuid), app.is_customer_assignee(uuid),
  app.is_property_assignee(uuid), app.shares_company(uuid), app.can_read_estimate(uuid),
  app.can_edit_estimate(uuid), app.version_estimate_id(uuid), app.option_estimate_id(uuid),
  app.line_item_estimate_id(uuid), app.tech_can_record_payment(uuid, uuid, uuid),
  app.version_is_locked(uuid)
to authenticated;

grant select, update on public.users to authenticated;
grant select, insert, update on
  public.companies, public.memberships, public.lead_sources, public.customers, public.contacts,
  public.properties, public.leads, public.estimates, public.estimate_versions, public.jobs,
  public.visits, public.invoices, public.payments
to authenticated;
grant select, insert, update, delete on
  public.visit_assignees, public.estimate_options, public.estimate_line_items, public.estimate_line_costs
to authenticated;
grant select on public.status_events, public.audit_log, public.customer_balances to authenticated;

-- Колонка row_version / служебные поля ставит триггер; ничего не выдаём anon.
