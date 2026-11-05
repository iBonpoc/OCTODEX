-- Clients wave C1 (docs/specs/04-clients-and-properties.md §3, §6, §10; founder's answers 04.11.2026):
--   1. Client number CLT-0001 (three letters, like LEA / EST / INV / RCT / JOB), assigned by the server.
--   2. People of a client: several phones and emails per person (contact_phones, contact_emails).
--      Old contacts.phone / contacts.email are copied in; the columns stay as the cached main phone / email.
--   3. Contact roles: + main, assistant, accountant ('owner' stays readable; the app shows it as "main").
--   4. Company tags (VIP, Regular, Favorite, "No calls after 6 pm") and customer_tags.
-- contacts.customer_id stays NOT NULL here; the leads chat relaxes it in its L2 migration (contacts.lead_id).

-- ---- 1. Client number -----------------------------------------------------------------------
alter table app.company_numbering drop constraint if exists company_numbering_doc_type_check;
alter table app.company_numbering add constraint company_numbering_doc_type_check
  check (doc_type in ('estimate', 'job', 'invoice', 'receipt', 'purchase_order', 'change_order', 'lead', 'customer'));

alter table public.customers add column if not exists number text;

-- existing clients get numbers in the order they were created; triggers off so updated_at / row_version stay as they were
alter table public.customers disable trigger user;
do $$
declare r record;
begin
  for r in select id, company_id from public.customers where number is null order by company_id, created_at, id loop
    update public.customers set number = app.next_document_number(r.company_id, 'customer', 'CLT') where id = r.id;
  end loop;
end $$;
alter table public.customers enable trigger user;

drop trigger if exists t20_number on public.customers;
create trigger t20_number before insert or update on public.customers
  for each row execute function app.tg_assign_number('customer', 'CLT');
create unique index if not exists customers_company_number_uq on public.customers (company_id, number) where number is not null;

-- ---- 2. Contact roles -----------------------------------------------------------------------
alter table public.contacts drop constraint if exists contacts_role_check;
alter table public.contacts add constraint contacts_role_check
  check (role in ('main', 'owner', 'spouse', 'assistant', 'tenant', 'property_manager', 'accountant', 'other'));

-- ---- 3. Phones and emails of a person -------------------------------------------------------
create table if not exists public.contact_phones (
  id          uuid primary key default public.uuid_generate_v7(),
  company_id  uuid not null references public.companies (id),
  contact_id  uuid not null,
  number      text not null check (length(trim(number)) > 0),
  label       text not null default 'mobile' check (label in ('mobile', 'home', 'work', 'other')),
  is_primary  boolean not null default false,
  position    integer not null default 0,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  foreign key (company_id, contact_id) references public.contacts (company_id, id)
);
create index if not exists contact_phones_contact_idx on public.contact_phones (company_id, contact_id);
create unique index if not exists contact_phones_one_primary on public.contact_phones (contact_id) where is_primary and deleted_at is null;

create table if not exists public.contact_emails (
  id          uuid primary key default public.uuid_generate_v7(),
  company_id  uuid not null references public.companies (id),
  contact_id  uuid not null,
  address     text not null check (position('@' in address) > 1),
  is_primary  boolean not null default false,
  position    integer not null default 0,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  foreign key (company_id, contact_id) references public.contacts (company_id, id)
);
create index if not exists contact_emails_contact_idx on public.contact_emails (company_id, contact_id);
create unique index if not exists contact_emails_one_primary on public.contact_emails (contact_id) where is_primary and deleted_at is null;

select app.attach_standard_triggers('public.contact_phones');
select app.attach_standard_triggers('public.contact_emails');

-- Who may see a person's phones: whoever may see the person (contacts RLS decides; this runs as the caller).
create or replace function app.can_see_contact(p_contact_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.contacts c where c.id = p_contact_id);
$$;

alter table public.contact_phones enable row level security;
alter table public.contact_phones force row level security;
alter table public.contact_emails enable row level security;
alter table public.contact_emails force row level security;
create policy contact_phones_select on public.contact_phones for select to authenticated
  using (app.can_see_contact(contact_id));
create policy contact_phones_insert on public.contact_phones for insert to authenticated
  with check (app.is_staff(company_id) and app.can_see_contact(contact_id));
create policy contact_phones_update on public.contact_phones for update to authenticated
  using (app.is_staff(company_id)) with check (app.is_staff(company_id) and app.can_see_contact(contact_id));
create policy contact_emails_select on public.contact_emails for select to authenticated
  using (app.can_see_contact(contact_id));
create policy contact_emails_insert on public.contact_emails for insert to authenticated
  with check (app.is_staff(company_id) and app.can_see_contact(contact_id));
create policy contact_emails_update on public.contact_emails for update to authenticated
  using (app.is_staff(company_id)) with check (app.is_staff(company_id) and app.can_see_contact(contact_id));

-- existing people: their one phone / email become the primary ones
insert into public.contact_phones (company_id, contact_id, number, label, is_primary)
select c.company_id, c.id, c.phone, 'mobile', true
  from public.contacts c
 where c.deleted_at is null and coalesce(trim(c.phone), '') <> ''
   and not exists (select 1 from public.contact_phones p where p.contact_id = c.id);
insert into public.contact_emails (company_id, contact_id, address, is_primary)
select c.company_id, c.id, c.email, true
  from public.contacts c
 where c.deleted_at is null and position('@' in coalesce(c.email, '')) > 1
   and not exists (select 1 from public.contact_emails e where e.contact_id = c.id);

-- ---- 4. Tags --------------------------------------------------------------------------------
create table if not exists public.tags (
  id          uuid primary key default public.uuid_generate_v7(),
  company_id  uuid not null references public.companies (id),
  name        text not null check (length(trim(name)) > 0),
  is_active   boolean not null default true,
  is_system   boolean not null default false,
  position    integer not null default 100,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id)
);
create unique index if not exists tags_company_name_uq on public.tags (company_id, lower(name)) where deleted_at is null;
select app.attach_standard_triggers('public.tags');

create table if not exists public.customer_tags (
  company_id   uuid not null references public.companies (id),
  customer_id  uuid not null,
  tag_id       uuid not null,
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  primary key (customer_id, tag_id),
  foreign key (company_id, customer_id) references public.customers (company_id, id),
  foreign key (company_id, tag_id) references public.tags (company_id, id)
);
create index if not exists customer_tags_tag_idx on public.customer_tags (company_id, tag_id);

alter table public.tags enable row level security;
alter table public.tags force row level security;
alter table public.customer_tags enable row level security;
alter table public.customer_tags force row level security;
-- everyone in the company reads the list; the office edits it (like lead sources)
create policy tags_select on public.tags for select to authenticated using (app.is_member(company_id));
create policy tags_insert on public.tags for insert to authenticated
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));
create policy tags_update on public.tags for update to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office']))
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));
-- a client's tags: seen with the client (customers RLS), set by staff
create policy customer_tags_select on public.customer_tags for select to authenticated
  using (exists (select 1 from public.customers c where c.id = customer_id));
create policy customer_tags_insert on public.customer_tags for insert to authenticated
  with check (app.is_staff(company_id) and exists (select 1 from public.customers c where c.id = customer_id));
create policy customer_tags_delete on public.customer_tags for delete to authenticated
  using (app.is_staff(company_id));

-- default tags: new companies (seed trigger) and the companies that already exist
create or replace function app.tg_company_seed_tags()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tags (company_id, name, is_system, position)
  values (new.id, 'VIP', true, 1), (new.id, 'Regular', true, 2), (new.id, 'Favorite', true, 3), (new.id, 'No calls after 6 pm', true, 4);
  return null;
end;
$$;
drop trigger if exists t92_company_seed_tags on public.companies;
create trigger t92_company_seed_tags after insert on public.companies
  for each row execute function app.tg_company_seed_tags();

insert into public.tags (company_id, name, is_system, position)
select c.id, s.name, true, s.pos
  from public.companies c
  cross join (values ('VIP', 1), ('Regular', 2), ('Favorite', 3), ('No calls after 6 pm', 4)) s(name, pos)
 where not exists (select 1 from public.tags t where t.company_id = c.id and lower(t.name) = lower(s.name) and t.deleted_at is null);

grant select, insert, update on public.contact_phones, public.contact_emails, public.tags to authenticated;
grant select, insert, delete on public.customer_tags to authenticated;
