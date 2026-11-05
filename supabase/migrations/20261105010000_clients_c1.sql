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

-- the trigger first, so a client created while this migration runs is numbered too
drop trigger if exists t20_number on public.customers;
create trigger t20_number before insert or update on public.customers
  for each row execute function app.tg_assign_number('customer', 'CLT');

-- existing clients get numbers in the order they were created; user triggers off for this one update so
-- updated_at / row_version stay as they were (and t20_number does not keep the old empty number)
alter table public.customers disable trigger user;
do $$
declare r record;
begin
  for r in select id, company_id from public.customers where number is null order by company_id, created_at, id loop
    update public.customers set number = app.next_document_number(r.company_id, 'customer', 'CLT') where id = r.id;
  end loop;
end $$;
alter table public.customers enable trigger user;
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
  using (app.can_see_contact(contact_id) and (deleted_at is null or app.is_staff(company_id)));
create policy contact_phones_insert on public.contact_phones for insert to authenticated
  with check (app.is_staff(company_id) and app.can_see_contact(contact_id));
create policy contact_phones_update on public.contact_phones for update to authenticated
  using (app.is_staff(company_id)) with check (app.is_staff(company_id) and app.can_see_contact(contact_id));
create policy contact_emails_select on public.contact_emails for select to authenticated
  using (app.can_see_contact(contact_id) and (deleted_at is null or app.is_staff(company_id)));
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
  with check (app.is_staff(company_id) and exists (select 1 from public.customers c where c.id = customer_id)
              and exists (select 1 from public.tags t where t.id = tag_id and t.deleted_at is null and t.is_active));
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

-- 6. System tags keep their name (the app shows them translated) and nobody makes a tag "system" by hand.
create or replace function app.tg_tag_system_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.is_system and (new.name is distinct from old.name or not new.is_system) then
    raise exception 'a standard tag keeps its name; hide it instead' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists t25_tag_system_guard on public.tags;
create trigger t25_tag_system_guard before update on public.tags
  for each row execute function app.tg_tag_system_guard();

-- 7. Grants: nothing by default (Supabase gives anon/authenticated everything on new tables, TRUNCATE skips RLS);
--    is_system and created_by are not writable from the app.
revoke all on public.contact_phones, public.contact_emails, public.tags, public.customer_tags from anon, authenticated;
grant select, insert, update on public.contact_phones, public.contact_emails to authenticated;
grant select on public.tags to authenticated;
grant insert (id, company_id, name, is_active, position) on public.tags to authenticated;
grant update (id, company_id, name, is_active, position) on public.tags to authenticated;
grant select, delete on public.customer_tags to authenticated;
grant insert (company_id, customer_id, tag_id) on public.customer_tags to authenticated;
revoke execute on function app.tg_company_seed_tags() from public;
revoke execute on function app.tg_tag_system_guard() from public;

-- 8. Writes from the app in one transaction each (a failed insert must not leave a client without phones or tags).
--    security invoker: the caller's RLS applies to every row touched.
create or replace function public.save_customer_people(p_customer_id uuid, p_people jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_company uuid;
  v_now timestamptz := now();
  v_ids uuid[];
  v_p jsonb;
  v_x jsonb;
  v_i int := 0;
  v_k int;
  v_id uuid;
begin
  select company_id into v_company from public.customers where id = p_customer_id;
  if v_company is null then raise exception 'client not found' using errcode = 'P0002'; end if;
  if not app.is_staff(v_company) then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(array_agg((e ->> 'id')::uuid), '{}') into v_ids from jsonb_array_elements(coalesce(p_people, '[]')) e;
  -- phones / emails of every current person of the client are replaced (also of people who are removed)
  update public.contact_phones set deleted_at = v_now
   where deleted_at is null and contact_id in (select id from public.contacts where customer_id = p_customer_id);
  update public.contact_emails set deleted_at = v_now
   where deleted_at is null and contact_id in (select id from public.contacts where customer_id = p_customer_id);
  update public.contacts set is_primary = false where customer_id = p_customer_id and is_primary;
  update public.contacts set deleted_at = v_now where customer_id = p_customer_id and deleted_at is null and not (id = any (v_ids));
  for v_p in select * from jsonb_array_elements(coalesce(p_people, '[]')) loop
    v_id := (v_p ->> 'id')::uuid;
    insert into public.contacts (id, company_id, customer_id, name, role, is_primary, phone, email, preferred_language)
    values (
      v_id, v_company, p_customer_id, coalesce(nullif(trim(v_p ->> 'name'), ''), '—'), coalesce(v_p ->> 'role', 'other'), v_i = 0,
      (select x ->> 'number' from jsonb_array_elements(coalesce(v_p -> 'phones', '[]')) with ordinality a(x, o) order by coalesce((x ->> 'primary')::boolean, false) desc, o limit 1),
      (select x ->> 'address' from jsonb_array_elements(coalesce(v_p -> 'emails', '[]')) with ordinality a(x, o) order by coalesce((x ->> 'primary')::boolean, false) desc, o limit 1),
      nullif(v_p ->> 'language', '')
    )
    on conflict (id) do update set
      name = excluded.name, role = excluded.role, is_primary = excluded.is_primary, phone = excluded.phone, email = excluded.email,
      preferred_language = excluded.preferred_language, deleted_at = null
      where public.contacts.customer_id = p_customer_id;
    if not exists (select 1 from public.contacts where id = v_id and customer_id = p_customer_id) then
      raise exception 'person % belongs to another client', v_id using errcode = '42501';
    end if;
    v_k := 0;
    for v_x in select * from jsonb_array_elements(coalesce(v_p -> 'phones', '[]')) loop
      insert into public.contact_phones (company_id, contact_id, number, label, is_primary, position)
      values (v_company, v_id, v_x ->> 'number', coalesce(v_x ->> 'label', 'mobile'), coalesce((v_x ->> 'primary')::boolean, false), v_k);
      v_k := v_k + 1;
    end loop;
    v_k := 0;
    for v_x in select * from jsonb_array_elements(coalesce(v_p -> 'emails', '[]')) loop
      insert into public.contact_emails (company_id, contact_id, address, is_primary, position)
      values (v_company, v_id, v_x ->> 'address', coalesce((v_x ->> 'primary')::boolean, false), v_k);
      v_k := v_k + 1;
    end loop;
    v_i := v_i + 1;
  end loop;
  if array_length(v_ids, 1) > 0 then
    update public.customers set primary_contact_id = v_ids[1] where id = p_customer_id;
  end if;
end;
$$;

create or replace function public.set_customer_tags(p_customer_id uuid, p_tag_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare v_company uuid;
begin
  select company_id into v_company from public.customers where id = p_customer_id;
  if v_company is null then raise exception 'client not found' using errcode = 'P0002'; end if;
  if not app.is_staff(v_company) then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.customer_tags where customer_id = p_customer_id;
  insert into public.customer_tags (company_id, customer_id, tag_id)
  select v_company, p_customer_id, t from unnest(coalesce(p_tag_ids, '{}')) t group by t;
end;
$$;
revoke execute on function public.save_customer_people(uuid, jsonb) from public, anon;
revoke execute on function public.set_customer_tags(uuid, uuid[]) from public, anon;
grant execute on function public.save_customer_people(uuid, jsonb) to authenticated;
grant execute on function public.set_customer_tags(uuid, uuid[]) to authenticated;
