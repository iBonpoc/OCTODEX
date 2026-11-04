-- =============================================================================
-- OCTODEX волна 11: полный лид (решения основателя 04.11).
--   * Источники — сущности компании: площадка / реклама / человек / свои. Свой список, «+ новый», скрыть (не удалять).
--     Человек-источник: имя, телефон, почта, связь с клиентом. Цены по умолчанию нет (0), Thumbtack — позже по вебхуку.
--   * Лид: статус «Отклонён» (решил подрядчик: невыгодно, не наш профиль, далеко, спам, дубль) отдельно от «Потерян»
--     (решил клиент: не отвечает, выбрал другого, дорого, отложил). Причина обязательна; оба можно вернуть в работу.
--   * Поля лида: второй телефон, как связываться, язык, адрес по частям, услуга (из каталога и/или текст), сроки, бюджет.
--   * Доп. контакты лида (супруг, арендатор, управляющий).
--   * Цена лида — отдельная таблица, видна только owner/admin/office (мастер не видит её даже запросом к базе).
--   * Задачи (по лиду, клиенту, работе, смете) и лента событий (звонок, SMS, письмо, площадка, «я ответил», заметка).
--     Первое исходящее касание ставит first_response_at и переводит new → contacted (сервер, а не часы телефона).
--   * Мастер видит лиды, назначенные ему или заведённые им (сосед на объекте); офис — все.
-- =============================================================================

-- ---- 1. Источники ---------------------------------------------------------------
alter table public.lead_sources drop constraint if exists lead_sources_kind_check;
update public.lead_sources set kind = case
  when name in ('Thumbtack', 'Yelp', 'Google', 'Angi', 'Nextdoor') then 'marketplace'
  when kind = 'paid_ads' then 'ads'
  when kind = 'paid_per_lead' then 'marketplace'
  else 'own' end;
alter table public.lead_sources add constraint lead_sources_kind_check check (kind in ('marketplace', 'ads', 'person', 'own'));
alter table public.lead_sources
  add column if not exists phone       text,
  add column if not exists email       text,
  add column if not exists customer_id uuid,
  add column if not exists note        text,
  add column if not exists position    integer not null default 0;
alter table public.lead_sources drop constraint if exists lead_sources_customer_fk;
alter table public.lead_sources add constraint lead_sources_customer_fk
  foreign key (company_id, customer_id) references public.customers (company_id, id);
-- Стандартный список для новой компании (правится в приложении).
create or replace function app.tg_company_seed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.lead_sources (company_id, name, kind, is_system, position)
  values (new.id, 'Thumbtack', 'marketplace', true, 1),
         (new.id, 'Yelp', 'marketplace', true, 2),
         (new.id, 'Google', 'marketplace', true, 3),
         (new.id, 'Angi', 'marketplace', true, 4),
         (new.id, 'Nextdoor', 'marketplace', true, 5),
         (new.id, 'Facebook', 'ads', true, 6),
         (new.id, 'Website', 'own', true, 7),
         (new.id, 'Referral', 'own', true, 8),
         (new.id, 'Repeat', 'own', true, 9),
         (new.id, 'Other', 'own', true, 10);
  return null;
end;
$$;
-- Существующим компаниям — недостающие стандартные источники.
insert into public.lead_sources (company_id, name, kind, is_system, position)
select c.id, s.name, s.kind, true, s.pos
  from public.companies c
  cross join (values ('Angi', 'marketplace', 4), ('Nextdoor', 'marketplace', 5), ('Facebook', 'ads', 6), ('Other', 'own', 10)) s(name, kind, pos)
on conflict (company_id, name) do nothing;
-- Источник с лидами не удаляется — только скрывается (история и отчёты не ломаются).
create or replace function app.tg_source_keep()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.deleted_at is not null and old.deleted_at is null and exists (
       select 1 from public.leads l where l.source_id = old.id and l.deleted_at is null
       union all select 1 from public.customers c where c.lead_source_id = old.id and c.deleted_at is null) then
    raise exception 'source has leads: hide it instead (is_active = false)' using errcode = '23503';
  end if;
  return new;
end;
$$;
drop trigger if exists t20_source_keep on public.lead_sources;
create trigger t20_source_keep before update on public.lead_sources for each row execute function app.tg_source_keep();

-- ---- 2. Лид: статусы, причины, новые поля ---------------------------------------
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('new', 'contacted', 'qualified', 'inspection_scheduled', 'estimate_sent', 'won', 'lost', 'declined', 'archived'));
-- Старые «закрытые подрядчиком» причины у lost → declined.
update public.leads set status = 'declined'
 where status = 'lost' and lost_reason in ('out_of_service_area', 'service_not_offered', 'junk_spam', 'duplicate');
alter table public.leads drop constraint if exists leads_lost_reason_check;
alter table public.leads add constraint leads_lost_reason_check check (lost_reason in (
  'no_response', 'chose_competitor', 'price_too_high', 'not_ready_timing',
  'not_profitable', 'service_not_offered', 'out_of_service_area', 'junk_spam', 'duplicate', 'other'));
alter table public.leads drop constraint if exists leads_close_reason_check;
alter table public.leads add constraint leads_close_reason_check check (
  (status = 'lost' and lost_reason in ('no_response', 'chose_competitor', 'price_too_high', 'not_ready_timing', 'other'))
  or (status = 'declined' and lost_reason in ('not_profitable', 'service_not_offered', 'out_of_service_area', 'junk_spam', 'duplicate', 'other'))
  or status not in ('lost', 'declined')) not valid;
alter table public.leads drop constraint if exists leads_other_text_check;
alter table public.leads add constraint leads_other_text_check
  check (lost_reason is distinct from 'other' or coalesce(trim(lost_reason_text), '') <> '') not valid;

insert into app.status_transitions (entity_type, from_status, to_status)
select 'lead', s, 'declined' from (values ('new'), ('contacted'), ('qualified'), ('inspection_scheduled'), ('estimate_sent')) x(s)
union all values ('lead', 'declined', 'contacted'), ('lead', 'declined', 'archived'), ('lead', 'lost', 'new'), ('lead', 'declined', 'new')
on conflict do nothing;

alter table public.leads
  add column if not exists phone2            text,
  add column if not exists phone2_label      text check (phone2_label in ('mobile', 'home', 'work', 'other')),
  add column if not exists preferred_contact text check (preferred_contact in ('call', 'sms', 'email')),
  add column if not exists language          text check (language in ('en', 'es')),
  add column if not exists address_line1     text,
  add column if not exists address_city      text,
  add column if not exists address_state     text,
  add column if not exists address_zip       text,
  add column if not exists service_item_id   uuid,
  add column if not exists timeframe         text check (timeframe in ('asap', 'this_week', 'this_month', 'flexible', 'date')),
  add column if not exists timeframe_date    date,
  add column if not exists budget_cents      bigint check (budget_cents >= 0),
  add column if not exists referred_by_customer_id uuid;

-- ---- 3. Цена лида (только owner/admin/office) -----------------------------------
create table if not exists public.lead_costs (
  lead_id        uuid primary key,
  company_id     uuid not null references public.companies (id),
  cost_cents     bigint not null default 0 check (cost_cents >= 0),
  origin         text not null default 'manual' check (origin in ('manual', 'provider')),
  refunded_cents bigint not null default 0 check (refunded_cents >= 0 and refunded_cents <= cost_cents),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  foreign key (company_id, lead_id) references public.leads (company_id, id)
);
insert into public.lead_costs (lead_id, company_id, cost_cents, origin)
select id, company_id, cost_cents, case when cost_origin = 'provider' then 'provider' else 'manual' end
  from public.leads where cost_cents is not null and cost_cents > 0
on conflict do nothing;
select app.attach_standard_triggers('public.lead_costs');
alter table public.lead_costs enable row level security;
alter table public.lead_costs force row level security;
create policy lead_costs_select on public.lead_costs for select to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office']));
create policy lead_costs_insert on public.lead_costs for insert to authenticated
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));
create policy lead_costs_update on public.lead_costs for update to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office']))
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));

-- ---- 4. Кто видит лид ------------------------------------------------------------
create or replace function app.can_see_lead(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.leads l
     where l.id = p_lead_id and l.deleted_at is null
       and (app.is_staff(l.company_id)
            or (app.is_member(l.company_id) and (l.assigned_to = auth.uid() or l.created_by = auth.uid())))
  );
$$;
drop policy if exists leads_select on public.leads;
drop policy if exists leads_insert on public.leads;
drop policy if exists leads_update on public.leads;
create policy leads_select on public.leads for select to authenticated
  using (app.is_staff(company_id) or (app.is_member(company_id) and (assigned_to = (select auth.uid()) or created_by = (select auth.uid()))));
create policy leads_insert on public.leads for insert to authenticated
  with check (app.is_member(company_id));
create policy leads_update on public.leads for update to authenticated
  using (app.is_staff(company_id) or (app.is_member(company_id) and (assigned_to = (select auth.uid()) or created_by = (select auth.uid()))))
  with check (app.is_member(company_id));

-- ---- 5. Доп. контакты лида -----------------------------------------------------------
create table if not exists public.lead_contacts (
  id          uuid primary key default public.uuid_generate_v7(),
  company_id  uuid not null references public.companies (id),
  lead_id     uuid not null,
  name        text not null,
  role        text not null default 'other' check (role in ('spouse', 'tenant', 'property_manager', 'owner', 'other')),
  phone       text,
  email       text,
  note        text,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  foreign key (company_id, lead_id) references public.leads (company_id, id)
);
create index if not exists lead_contacts_lead_idx on public.lead_contacts (company_id, lead_id);
select app.attach_standard_triggers('public.lead_contacts');
alter table public.lead_contacts enable row level security;
alter table public.lead_contacts force row level security;
create policy lead_contacts_all on public.lead_contacts for all to authenticated
  using (app.can_see_lead(lead_id)) with check (app.can_see_lead(lead_id));

-- ---- 6. Задачи (любая сущность) ---------------------------------------------------------
create table if not exists public.tasks (
  id            uuid primary key default public.uuid_generate_v7(),
  company_id    uuid not null references public.companies (id),
  subject_type  text not null check (subject_type in ('lead', 'customer', 'job', 'estimate')),
  subject_id    uuid not null,
  title         text not null check (length(trim(title)) > 0),
  due_at        timestamptz,
  assignee_id   uuid references public.users (id),
  done_at       timestamptz,
  done_by       uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id)
);
create index if not exists tasks_subject_idx on public.tasks (company_id, subject_type, subject_id);
create index if not exists tasks_open_idx on public.tasks (company_id, assignee_id, due_at) where done_at is null and deleted_at is null;
select app.attach_standard_triggers('public.tasks');
alter table public.tasks enable row level security;
alter table public.tasks force row level security;
create policy tasks_select on public.tasks for select to authenticated
  using (app.is_staff(company_id) or assignee_id = (select auth.uid()) or created_by = (select auth.uid())
         or (subject_type = 'lead' and app.can_see_lead(subject_id)));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (app.is_staff(company_id) or (app.is_member(company_id) and subject_type = 'lead' and app.can_see_lead(subject_id)));
create policy tasks_update on public.tasks for update to authenticated
  using (app.is_staff(company_id) or assignee_id = (select auth.uid()) or created_by = (select auth.uid()))
  with check (app.is_member(company_id));

-- ---- 7. Лента событий ------------------------------------------------------------------------
create table if not exists public.activities (
  id            uuid primary key default public.uuid_generate_v7(),
  company_id    uuid not null references public.companies (id),
  subject_type  text not null check (subject_type in ('lead', 'customer', 'job', 'estimate')),
  subject_id    uuid not null,
  kind          text not null check (kind in ('call', 'sms', 'email', 'marketplace', 'reply', 'status', 'assigned', 'edited')),
  direction     text check (direction in ('out', 'in')),
  body          text,
  meta          jsonb not null default '{}',
  at            timestamptz not null default now(),
  actor_id      uuid default auth.uid(),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id)
);
create index if not exists activities_subject_idx on public.activities (company_id, subject_type, subject_id, at);
select app.attach_standard_triggers('public.activities');
alter table public.activities enable row level security;
alter table public.activities force row level security;
create policy activities_select on public.activities for select to authenticated
  using (app.is_staff(company_id) or (subject_type = 'lead' and app.can_see_lead(subject_id)));
create policy activities_insert on public.activities for insert to authenticated
  with check (app.is_staff(company_id) or (subject_type = 'lead' and app.can_see_lead(subject_id)));

-- Первое исходящее касание: first_response_at (время действия) и new → contacted.
create or replace function app.tg_lead_first_response()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.subject_type = 'lead' and new.kind in ('call', 'sms', 'email', 'marketplace', 'reply') and coalesce(new.direction, 'out') = 'out' then
    update public.leads
       set first_response_at = coalesce(first_response_at, new.at),
           first_response_kind = coalesce(first_response_kind, case when new.kind = 'reply' then 'manual' else new.kind end),
           last_outbound_at = greatest(coalesce(last_outbound_at, new.at), new.at),
           status = case when status = 'new' then 'contacted' else status end
     where id = new.subject_id and company_id = new.company_id;
  end if;
  return null;
end;
$$;
drop trigger if exists t90_lead_first_response on public.activities;
create trigger t90_lead_first_response after insert on public.activities
  for each row execute function app.tg_lead_first_response();

-- ---- 8. Доступ (строки ограничивает RLS выше) ------------------------------------------------
grant select, insert, update on public.lead_costs, public.lead_contacts, public.tasks, public.activities to authenticated;
