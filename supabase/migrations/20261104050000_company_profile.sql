-- =============================================================================
-- OCTODEX волна 7: профиль компании (docs/13-core-workflow-spec.md §2, §7).
--   * companies: DBA, форма бизнеса, сайт, почтовый адрес, направления работ (trades[] — ядро без ниши);
--     brand {logo (маленький data URI), color}; contract_settings {insurance, cancel_email};
--     estimate_settings {valid_days, deposit_pct, terms}; payment_settings {zelle, check_payable_to, methods}.
--   * company_secrets: EIN — только owner/admin.
--   * company_licenses: несколько лицензий (CSLB, городская, HIS…), «печатать на документах».
--   * company_contacts: люди компании для клиентов (имя, должность, телефон, email), не путать с memberships.
--   * notes: заметки к лиду / клиенту / объекту / работе / смете; «команда» или «только я» (видит автор).
--   * customers.status 'prospect' (клиент из сметы до подписи), leads.won_via (approval / deposit / manual).
--   * portal_estimate: на странице клиента — DBA, логотип, лицензии и люди «на документах», условия.
-- =============================================================================

alter table public.companies
  add column if not exists dba                    text,
  add column if not exists entity_type            text check (entity_type in ('llc', 'corporation', 'sole_proprietor', 'partnership', 'other')),
  add column if not exists website                text,
  add column if not exists mailing_address_line1  text,
  add column if not exists mailing_address_city   text,
  add column if not exists mailing_address_state  text,
  add column if not exists mailing_address_zip    text,
  add column if not exists trades                 text[] not null default '{}';

-- ---- EIN (только owner/admin) ---------------------------------------------------------
create table public.company_secrets (
  company_id  uuid primary key references public.companies (id),
  ein         text check (ein is null or ein ~ '^[0-9]{2}-?[0-9]{7}$'),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  row_version bigint not null default 1
);
do $$ begin perform app.attach_standard_triggers('public.company_secrets', false); end $$;
alter table public.company_secrets enable row level security;
alter table public.company_secrets force row level security;
create policy company_secrets_select on public.company_secrets for select to authenticated using (app.has_role(company_id, array['owner', 'admin']));
create policy company_secrets_insert on public.company_secrets for insert to authenticated with check (app.has_role(company_id, array['owner', 'admin']));
create policy company_secrets_update on public.company_secrets for update to authenticated
  using (app.has_role(company_id, array['owner', 'admin'])) with check (app.has_role(company_id, array['owner', 'admin']));
grant select, insert, update on public.company_secrets to authenticated;

-- ---- Лицензии ------------------------------------------------------------------------
create table public.company_licenses (
  id            uuid primary key default public.uuid_generate_v7(),
  company_id    uuid not null references public.companies (id),
  kind          text not null check (kind in ('cslb', 'city_business', 'his', 'other')),
  number        text not null check (length(trim(number)) > 0),
  classes       text[] not null default '{}',
  issuer        text,
  expires_on    date,
  on_documents  boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id)
);
create unique index company_licenses_unique_idx on public.company_licenses (company_id, kind, upper(trim(number))) where deleted_at is null;

-- ---- Люди компании для клиентов -------------------------------------------------------
create table public.company_contacts (
  id            uuid primary key default public.uuid_generate_v7(),
  company_id    uuid not null references public.companies (id),
  name          text not null check (length(trim(name)) > 0),
  title         text,
  phone         text,
  email         text,
  is_primary    boolean not null default false,
  on_documents  boolean not null default true,
  user_id       uuid references public.users (id),             -- если это ещё и сотрудник с входом
  position      int not null default 0,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id)
);
create unique index company_contacts_one_primary_idx on public.company_contacts (company_id) where is_primary and deleted_at is null;

do $$
declare t regclass;
begin
  foreach t in array array['public.company_licenses', 'public.company_contacts']::regclass[] loop
    perform app.attach_standard_triggers(t);
    execute format('alter table %s enable row level security', t);
    execute format('alter table %s force row level security', t);
    execute format('create policy %I on %s for select to authenticated using (app.is_member(company_id))', replace(t::text, 'public.', '') || '_select', t);
    execute format('create policy %I on %s for insert to authenticated with check (app.has_role(company_id, array[''owner'', ''admin'']))', replace(t::text, 'public.', '') || '_insert', t);
    execute format('create policy %I on %s for update to authenticated using (app.has_role(company_id, array[''owner'', ''admin''])) with check (app.has_role(company_id, array[''owner'', ''admin'']))', replace(t::text, 'public.', '') || '_update', t);
    execute format('grant select, insert, update on %s to authenticated', t);
  end loop;
end $$;

-- ---- Заметки -------------------------------------------------------------------------
create table public.notes (
  id            uuid primary key default public.uuid_generate_v7(),
  company_id    uuid not null references public.companies (id),
  subject_type  text not null check (subject_type in ('lead', 'customer', 'property', 'job', 'estimate')),
  subject_id    uuid not null,
  body          text not null check (length(trim(body)) > 0),
  visibility    text not null default 'team' check (visibility in ('team', 'private')),
  pinned        boolean not null default false,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id)
);
create index notes_subject_idx on public.notes (company_id, subject_type, subject_id) where deleted_at is null;
do $$ begin perform app.attach_standard_triggers('public.notes'); end $$;
alter table public.notes enable row level security;
alter table public.notes force row level security;
create policy notes_select on public.notes for select to authenticated
  using (app.is_member(company_id) and (visibility = 'team' or created_by = (select auth.uid())));
create policy notes_insert on public.notes for insert to authenticated
  with check (app.is_member(company_id));
create policy notes_update on public.notes for update to authenticated
  using (created_by = (select auth.uid())) with check (app.is_member(company_id) and created_by = (select auth.uid()));
grant select, insert, update on public.notes to authenticated;

-- ---- Лид → клиент ----------------------------------------------------------------------
alter table public.customers drop constraint if exists customers_status_check;
alter table public.customers add constraint customers_status_check check (status in ('prospect', 'active', 'archived', 'do_not_service'));
alter table public.leads add column if not exists won_via text check (won_via in ('approval', 'deposit', 'manual'));

-- ---- Страница клиента: данные компании --------------------------------------------------
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
    'company', jsonb_build_object(
      'name', coalesce(nullif(co.dba, ''), co.name), 'legal_name', co.legal_name, 'phone', co.phone, 'email', co.email,
      'website', co.website, 'license', co.license_number,
      'address', concat_ws(', ', co.address_line1, co.address_city, concat_ws(' ', co.address_state, co.address_zip)),
      'logo', co.brand ->> 'logo', 'color', co.brand ->> 'color',
      'terms', co.estimate_settings ->> 'terms',
      'licenses', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'number', l.number, 'classes', l.classes) order by l.created_at)
                              from public.company_licenses l
                             where l.company_id = co.id and l.on_documents and l.deleted_at is null), '[]'::jsonb),
      'contacts', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'title', c.title, 'phone', c.phone, 'email', c.email)
                                             order by c.is_primary desc, c.position)
                              from public.company_contacts c
                             where c.company_id = co.id and c.on_documents and c.deleted_at is null), '[]'::jsonb)),
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


revoke all on function public.portal_estimate(text) from public;
grant execute on function public.portal_estimate(text) to anon, authenticated;
