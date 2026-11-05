-- Leads L2 part 2 (docs/14-leads-spec.md §2 "Человек", decision Р12; story map S3 "лид → клиент: люди"):
--   1. People of a lead live in contacts (lead_id, customer_id null): the same shape as people of a client,
--      each with several phones / emails (contact_phones, contact_emails from C1).
--   2. Old leads.phone / phone2 / email and lead_contacts are copied in once. leads.phone / email stay as the cached
--      main phone / email (search, duplicates, list); lead_contacts is no longer written by the app.
--   3. A new lead gets its main person from contact_name / phone / phone2 / email, whoever inserts it (app, web form, intake).
--      Renaming the lead renames its main person.
--   4. When a lead gets its client (customer_id set: estimate, booking, "make client"), its people move to the client.
--      A person whose phone or email the client already has is merged into that person (missing phones / emails added).
--   5. save_lead_people: the app saves all people of a lead in one transaction (like save_customer_people).
--   6. Audit debt: the leads_full tables get revoke all first, then the minimal grants.

-- ---- 1. Contacts of a lead ------------------------------------------------------------------
alter table public.contacts alter column customer_id drop not null;
alter table public.contacts add column if not exists lead_id uuid;
alter table public.contacts drop constraint if exists contacts_lead_fk;
alter table public.contacts add constraint contacts_lead_fk foreign key (company_id, lead_id) references public.leads (company_id, id);
alter table public.contacts drop constraint if exists contacts_owner_check;
alter table public.contacts add constraint contacts_owner_check check (customer_id is not null or lead_id is not null);
create index if not exists contacts_lead_idx on public.contacts (company_id, lead_id) where lead_id is not null;
create unique index if not exists contacts_one_primary_lead_idx on public.contacts (lead_id)
  where is_primary and deleted_at is null and customer_id is null;

-- Who sees a lead's people: whoever sees the lead (app.can_see_lead). The client's people keep their rules.
drop policy if exists contacts_select on public.contacts;
drop policy if exists contacts_insert on public.contacts;
drop policy if exists contacts_update on public.contacts;
create policy contacts_select on public.contacts for select to authenticated
  using (app.is_staff(company_id)
         or (customer_id is not null and app.has_role(company_id, array['tech']) and deleted_at is null and app.is_customer_assignee(customer_id))
         -- deleted ones too: a soft delete by the lead's own people must stay visible to them (UPDATE checks the new row)
         or (customer_id is null and app.can_see_lead(lead_id)));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (app.is_staff(company_id) or (customer_id is null and app.can_see_lead(lead_id)));
create policy contacts_update on public.contacts for update to authenticated
  using (app.is_staff(company_id) or (customer_id is null and app.can_see_lead(lead_id)))
  with check (app.is_staff(company_id) or (customer_id is null and app.can_see_lead(lead_id)));

-- A person of a lead the caller sees (RLS of contacts decides; runs as the caller): its phones / emails are editable
-- by the same people who edit the lead, not only the office.
create or replace function app.is_lead_contact(p_contact_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.contacts c where c.id = p_contact_id and c.customer_id is null);
$$;
drop policy if exists contact_phones_select on public.contact_phones;
drop policy if exists contact_emails_select on public.contact_emails;
create policy contact_phones_select on public.contact_phones for select to authenticated
  using (app.can_see_contact(contact_id) and (deleted_at is null or app.is_staff(company_id) or app.is_lead_contact(contact_id)));
create policy contact_emails_select on public.contact_emails for select to authenticated
  using (app.can_see_contact(contact_id) and (deleted_at is null or app.is_staff(company_id) or app.is_lead_contact(contact_id)));
drop policy if exists contact_phones_insert on public.contact_phones;
drop policy if exists contact_phones_update on public.contact_phones;
drop policy if exists contact_emails_insert on public.contact_emails;
drop policy if exists contact_emails_update on public.contact_emails;
create policy contact_phones_insert on public.contact_phones for insert to authenticated
  with check ((app.is_staff(company_id) or app.is_lead_contact(contact_id)) and app.can_see_contact(contact_id));
create policy contact_phones_update on public.contact_phones for update to authenticated
  using (app.is_staff(company_id) or app.is_lead_contact(contact_id))
  with check ((app.is_staff(company_id) or app.is_lead_contact(contact_id)) and app.can_see_contact(contact_id));
create policy contact_emails_insert on public.contact_emails for insert to authenticated
  with check ((app.is_staff(company_id) or app.is_lead_contact(contact_id)) and app.can_see_contact(contact_id));
create policy contact_emails_update on public.contact_emails for update to authenticated
  using (app.is_staff(company_id) or app.is_lead_contact(contact_id))
  with check ((app.is_staff(company_id) or app.is_lead_contact(contact_id)) and app.can_see_contact(contact_id));

-- ---- helpers: phone / email keys of a person (the contact row's own columns count too) ------
create or replace function app.phone_key(p text)
returns text language sql immutable set search_path = '' as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 10
              then right(regexp_replace(p, '\D', '', 'g'), 10) end;
$$;
create or replace function app.contact_phone_keys(p_contact_id uuid)
returns setof text language sql stable set search_path = '' as $$
  select app.phone_key(p.number) from public.contact_phones p where p.contact_id = p_contact_id and p.deleted_at is null
  union
  select app.phone_key(c.phone) from public.contacts c where c.id = p_contact_id;
$$;
create or replace function app.contact_email_keys(p_contact_id uuid)
returns setof text language sql stable set search_path = '' as $$
  select lower(trim(e.address)) from public.contact_emails e where e.contact_id = p_contact_id and e.deleted_at is null
  union
  select lower(trim(c.email)) from public.contacts c where c.id = p_contact_id and position('@' in coalesce(c.email, '')) > 1;
$$;

-- ---- 3. The main person of a new lead ---------------------------------------------------------
create or replace function app.add_lead_main_person(p_lead public.leads)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_k int := 0;
begin
  if coalesce(trim(p_lead.contact_name), '') = '' and coalesce(trim(p_lead.phone), '') = '' and position('@' in coalesce(p_lead.email, '')) <= 1 then
    return null;
  end if;
  insert into public.contacts (company_id, lead_id, name, role, is_primary, phone, email, preferred_language)
  values (p_lead.company_id, p_lead.id, coalesce(nullif(trim(p_lead.contact_name), ''), '—'), 'main', true,
          nullif(trim(p_lead.phone), ''), case when position('@' in coalesce(p_lead.email, '')) > 1 then trim(p_lead.email) end,
          case when p_lead.language in ('en', 'es') then p_lead.language end)
  returning id into v_id;
  if coalesce(trim(p_lead.phone), '') <> '' then
    insert into public.contact_phones (company_id, contact_id, number, label, is_primary, position)
    values (p_lead.company_id, v_id, trim(p_lead.phone), 'mobile', true, 0);
    v_k := 1;
  end if;
  if coalesce(trim(p_lead.phone2), '') <> '' and app.phone_key(p_lead.phone2) is distinct from app.phone_key(p_lead.phone) then
    insert into public.contact_phones (company_id, contact_id, number, label, is_primary, position)
    values (p_lead.company_id, v_id, trim(p_lead.phone2), coalesce(p_lead.phone2_label, 'home'), v_k = 0, v_k);
  end if;
  if position('@' in coalesce(p_lead.email, '')) > 1 then
    insert into public.contact_emails (company_id, contact_id, address, is_primary, position)
    values (p_lead.company_id, v_id, trim(p_lead.email), true, 0);
  end if;
  return v_id;
end;
$$;

create or replace function app.tg_lead_main_person()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.customer_id is null then perform app.add_lead_main_person(new); end if;
  return null;
end;
$$;
drop trigger if exists t85_lead_main_person on public.leads;
create trigger t85_lead_main_person after insert on public.leads
  for each row execute function app.tg_lead_main_person();

-- renaming the lead renames its main person (the main person is the lead itself, like the client)
create or replace function app.tg_lead_rename_person()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.customer_id is null and coalesce(trim(new.contact_name), '') <> '' and new.contact_name is distinct from old.contact_name then
    update public.contacts set name = trim(new.contact_name)
     where lead_id = new.id and customer_id is null and is_primary and deleted_at is null;
  end if;
  return null;
end;
$$;
drop trigger if exists t86_lead_rename_person on public.leads;
create trigger t86_lead_rename_person after update of contact_name on public.leads
  for each row execute function app.tg_lead_rename_person();

-- ---- 4. Lead → client: people move to the client ------------------------------------------------
create or replace function app.move_lead_people(p_lead_id uuid, p_customer_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_target uuid;
  v_company uuid;
  v_primary uuid;
  v_now timestamptz := now();
  v_pos int;
begin
  select company_id, primary_contact_id into v_company, v_primary from public.customers where id = p_customer_id;
  if v_company is null then return; end if;
  if v_primary is null then
    select id into v_primary from public.contacts where customer_id = p_customer_id and is_primary and deleted_at is null;
  end if;
  for r in select * from public.contacts where lead_id = p_lead_id and customer_id is null and deleted_at is null
            order by is_primary desc, created_at, id loop
    -- the same person on the client: a shared phone (last 10 digits) or email
    select c.id into v_target
      from public.contacts c
     where c.customer_id = p_customer_id and c.deleted_at is null
       and (exists (select 1 from app.contact_phone_keys(c.id) a(k) join app.contact_phone_keys(r.id) b(k) on a.k = b.k where a.k is not null)
            or exists (select 1 from app.contact_email_keys(c.id) a(k) join app.contact_email_keys(r.id) b(k) on a.k = b.k))
     order by c.is_primary desc, c.created_at
     limit 1;
    if v_target is not null then
      -- a client person known only by its own columns (made by the app before C1) first gets them as rows,
      -- so adding rows does not hide them
      insert into public.contact_phones (company_id, contact_id, number, label, is_primary, position)
      select c.company_id, c.id, trim(c.phone), 'mobile', true, 0 from public.contacts c
       where c.id = v_target and coalesce(trim(c.phone), '') <> ''
         and not exists (select 1 from public.contact_phones p where p.contact_id = c.id and p.deleted_at is null);
      insert into public.contact_emails (company_id, contact_id, address, is_primary, position)
      select c.company_id, c.id, trim(c.email), true, 0 from public.contacts c
       where c.id = v_target and position('@' in coalesce(c.email, '')) > 1
         and not exists (select 1 from public.contact_emails e where e.contact_id = c.id and e.deleted_at is null);
      select coalesce(max(position) + 1, 0) into v_pos from public.contact_phones where contact_id = v_target and deleted_at is null;
      insert into public.contact_phones (company_id, contact_id, number, label, is_primary, position)
      select v_company, v_target, p.number, p.label,
             not exists (select 1 from public.contact_phones x where x.contact_id = v_target and x.is_primary and x.deleted_at is null) and p.is_primary,
             v_pos + p.position
        from public.contact_phones p
       where p.contact_id = r.id and p.deleted_at is null
         and app.phone_key(p.number) is not null
         and app.phone_key(p.number) not in (select k from app.contact_phone_keys(v_target) t(k) where k is not null);
      select coalesce(max(position) + 1, 0) into v_pos from public.contact_emails where contact_id = v_target and deleted_at is null;
      insert into public.contact_emails (company_id, contact_id, address, is_primary, position)
      select v_company, v_target, e.address,
             not exists (select 1 from public.contact_emails x where x.contact_id = v_target and x.is_primary and x.deleted_at is null) and e.is_primary,
             v_pos + e.position
        from public.contact_emails e
       where e.contact_id = r.id and e.deleted_at is null
         and lower(trim(e.address)) not in (select k from app.contact_email_keys(v_target) t(k));
      update public.contact_phones set deleted_at = v_now where contact_id = r.id and deleted_at is null;
      update public.contact_emails set deleted_at = v_now where contact_id = r.id and deleted_at is null;
      update public.contacts set deleted_at = v_now, is_primary = false where id = r.id;
    else
      update public.contacts
         set customer_id = p_customer_id,
             is_primary = (v_primary is null),
             role = case when r.role = 'main' and v_primary is not null then 'other' else r.role end
       where id = r.id;
      if v_primary is null then
        v_primary := r.id;
        update public.customers set primary_contact_id = r.id where id = p_customer_id;
      end if;
    end if;
  end loop;
end;
$$;

create or replace function app.tg_lead_people_to_client()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.customer_id is null and new.customer_id is not null then
    perform app.move_lead_people(new.id, new.customer_id);
  end if;
  return null;
end;
$$;
drop trigger if exists t87_lead_people_to_client on public.leads;
create trigger t87_lead_people_to_client after update of customer_id on public.leads
  for each row execute function app.tg_lead_people_to_client();

-- ---- 2. Existing leads: people from the old columns and lead_contacts (once) ------------------------
-- user triggers off on leads / contacts / phones / emails would also skip the company and audit fields, so they stay on;
-- leads themselves are not updated here (updated_at / row_version unchanged).
do $$
declare l public.leads; r record; v_id uuid; v_main uuid;
begin
  for l in select * from public.leads where deleted_at is null order by company_id, created_at, id loop
    if exists (select 1 from public.contacts c where c.lead_id = l.id) then continue; end if;
    v_main := app.add_lead_main_person(l);
    for r in select * from public.lead_contacts where lead_id = l.id and deleted_at is null order by created_at, id loop
      insert into public.contacts (company_id, lead_id, name, role, is_primary, phone, email)
      values (l.company_id, l.id, coalesce(nullif(trim(r.name), ''), '—'), case when r.role = 'owner' then 'other' else r.role end, v_main is null,
              nullif(trim(r.phone), ''), case when position('@' in coalesce(r.email, '')) > 1 then trim(r.email) end)
      returning id into v_id;
      if v_main is null then v_main := v_id; end if;
      if coalesce(trim(r.phone), '') <> '' then
        insert into public.contact_phones (company_id, contact_id, number, label, is_primary) values (l.company_id, v_id, trim(r.phone), 'mobile', true);
      end if;
      if position('@' in coalesce(r.email, '')) > 1 then
        insert into public.contact_emails (company_id, contact_id, address, is_primary) values (l.company_id, v_id, trim(r.email), true);
      end if;
    end loop;
    -- a lead that already has its client: its people join the client the same way as from now on
    if l.customer_id is not null then perform app.move_lead_people(l.id, l.customer_id); end if;
  end loop;
end $$;

-- ---- 5. Save all people of a lead in one call -------------------------------------------------
-- security invoker: the caller's RLS applies to every row touched (who sees the lead edits its people).
create or replace function public.save_lead_people(p_lead_id uuid, p_people jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_company uuid;
  v_customer uuid;
  v_name text;
  v_now timestamptz := now();
  v_ids uuid[];
  v_p jsonb;
  v_x jsonb;
  v_i int := 0;
  v_k int;
  v_id uuid;
  v_phone text;
  v_email text;
begin
  select company_id, customer_id, contact_name into v_company, v_customer, v_name from public.leads where id = p_lead_id and deleted_at is null;
  if v_company is null then raise exception 'lead not found' using errcode = 'P0002'; end if;
  if v_customer is not null then raise exception 'the lead has a client: edit the client''s people' using errcode = '42501'; end if;
  select coalesce(array_agg((e ->> 'id')::uuid), '{}') into v_ids from jsonb_array_elements(coalesce(p_people, '[]')) e;
  update public.contact_phones set deleted_at = v_now
   where deleted_at is null and contact_id in (select id from public.contacts where lead_id = p_lead_id and customer_id is null);
  update public.contact_emails set deleted_at = v_now
   where deleted_at is null and contact_id in (select id from public.contacts where lead_id = p_lead_id and customer_id is null);
  update public.contacts set is_primary = false where lead_id = p_lead_id and customer_id is null and is_primary;
  update public.contacts set deleted_at = v_now
   where lead_id = p_lead_id and customer_id is null and deleted_at is null and not (id = any (v_ids));
  for v_p in select * from jsonb_array_elements(coalesce(p_people, '[]')) loop
    v_id := (v_p ->> 'id')::uuid;
    insert into public.contacts (id, company_id, lead_id, name, role, is_primary, phone, email, preferred_language)
    values (
      v_id, v_company, p_lead_id,
      -- the main person is the lead itself: same name
      case when v_i = 0 then coalesce(nullif(trim(v_name), ''), nullif(trim(v_p ->> 'name'), ''), '—') else coalesce(nullif(trim(v_p ->> 'name'), ''), '—') end,
      case when v_i = 0 then 'main' else coalesce(nullif(v_p ->> 'role', 'main'), 'other') end,
      v_i = 0,
      (select x ->> 'number' from jsonb_array_elements(coalesce(v_p -> 'phones', '[]')) with ordinality a(x, o) order by coalesce((x ->> 'primary')::boolean, false) desc, o limit 1),
      (select x ->> 'address' from jsonb_array_elements(coalesce(v_p -> 'emails', '[]')) with ordinality a(x, o) order by coalesce((x ->> 'primary')::boolean, false) desc, o limit 1),
      nullif(v_p ->> 'language', '')
    )
    on conflict (id) do update set
      name = excluded.name, role = excluded.role, is_primary = excluded.is_primary, phone = excluded.phone, email = excluded.email,
      preferred_language = excluded.preferred_language, deleted_at = null
      where public.contacts.lead_id = p_lead_id and public.contacts.customer_id is null;
    if not exists (select 1 from public.contacts where id = v_id and lead_id = p_lead_id and customer_id is null) then
      raise exception 'person % belongs to someone else', v_id using errcode = '42501';
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
    if v_i = 0 then
      select phone, email into v_phone, v_email from public.contacts where id = v_id;
    end if;
    v_i := v_i + 1;
  end loop;
  -- the lead keeps the main person's primary phone / email for search and duplicates; phone2 is now a person's phone
  update public.leads set phone = coalesce(v_phone, ''), email = v_email, phone2 = null, phone2_label = null
   where id = p_lead_id and (phone is distinct from coalesce(v_phone, '') or email is distinct from v_email or phone2 is not null);
end;
$$;

-- ---- 6. Grants -------------------------------------------------------------------------------
revoke all on public.lead_costs, public.lead_contacts, public.tasks, public.activities from anon, authenticated;
grant select, insert, update on public.lead_costs, public.lead_contacts, public.tasks, public.activities to authenticated;
revoke execute on function app.add_lead_main_person(public.leads) from public;
revoke execute on function app.move_lead_people(uuid, uuid) from public;
revoke execute on function app.tg_lead_main_person() from public;
revoke execute on function app.tg_lead_rename_person() from public;
revoke execute on function app.tg_lead_people_to_client() from public;
revoke execute on function public.save_lead_people(uuid, jsonb) from public, anon;
grant execute on function public.save_lead_people(uuid, jsonb) to authenticated;
