-- Wave П-1 (docs/specs/13-app-structure.md §5 «Поля и сущности», §8): shared fields for the waves 3 (jobs and visits),
-- 4 (clients) and 6 (calls, messages). Data only, no screens.
-- * job_types: the company's own list of job types (13 §3.4 п. 8), five common ones by default; jobs.job_type_id.
--   The old jobs.type is not used: nobody ever picked it (default 'install'), so old jobs stay without a type (null).
-- * jobs.description.
-- * notifications.invoice_id, visit_id: a notice leads to its invoice / visit. portal_pay_simulated writes invoice_id;
--   old paid notices get it from payload.number (the invoice number the function always wrote).
-- * activities.contact_id: the person an event was with («Сообщения по людям»). activities.direction already exists.
-- * activities: a tech sees the feed of the jobs and clients of his visits and writes events on the job of his visit.
-- * files.customer_id: files of a client; only the office or a tech of that client puts one there.

-- ---- job types -------------------------------------------------------------------------------
create table public.job_types (
  id            uuid primary key default public.uuid_generate_v7(),
  company_id    uuid not null references public.companies (id),
  seed_key      text check (seed_key in ('install', 'repair', 'service', 'warranty', 'other')),
  name          text check (name is null or (btrim(name) <> '' and char_length(name) <= 80)),
  position      int not null default 0 check (position >= 0),
  archived_at   timestamptz,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  row_version bigint not null default 1,
  unique (company_id, id),
  check (seed_key is not null or name is not null)
);
create unique index job_types_seed_key_uq on public.job_types (company_id, seed_key)
  where archived_at is null and seed_key is not null;
create unique index job_types_name_uq on public.job_types (company_id, lower(btrim(name)))
  where archived_at is null and name is not null;
do $$ begin perform app.attach_standard_triggers('public.job_types'); end $$;

-- no delete, even for the service role: archive instead (old jobs keep their type)
create or replace function app.tg_job_type_no_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'a job type is never deleted: archive it' using errcode = '42501';
end;
$$;
create trigger t05_no_delete before delete on public.job_types
  for each row execute function app.tg_job_type_no_delete();

-- the five common types (an inspection is a visit without a job, docs/specs/03 П1 — not a type)
create or replace function app.seed_job_types(p_company uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.job_types (company_id, seed_key, position)
  select p_company, k, pos
    from (values ('install', 0), ('repair', 1), ('service', 2), ('warranty', 3), ('other', 4)) as x(k, pos)
   where not exists (select 1 from public.job_types t where t.company_id = p_company);
$$;
create or replace function app.tg_company_seed_job_types()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app.seed_job_types(new.id);
  return null;
end;
$$;
create trigger t93_company_seed_job_types after insert on public.companies
  for each row execute function app.tg_company_seed_job_types();
do $$ declare c uuid; begin
  for c in select id from public.companies loop perform app.seed_job_types(c); end loop;
end $$;

-- ---- job fields ------------------------------------------------------------------------------
alter table public.jobs add column if not exists job_type_id uuid;
alter table public.jobs add column if not exists description text check (description is null or char_length(description) <= 4000);
alter table public.jobs add constraint jobs_job_type_fk
  foreign key (company_id, job_type_id) references public.job_types (company_id, id);
create index jobs_job_type_idx on public.jobs (company_id, job_type_id) where job_type_id is not null;

-- ---- notifications lead to the invoice / the visit -------------------------------------------
alter table public.notifications add column if not exists invoice_id uuid;
alter table public.notifications add column if not exists visit_id uuid;
alter table public.notifications add constraint notifications_invoice_fk
  foreign key (company_id, invoice_id) references public.invoices (company_id, id);
alter table public.notifications add constraint notifications_visit_fk
  foreign key (company_id, visit_id) references public.visits (company_id, id);
-- old paid notices: the invoice by its number (payload.number, written by portal_pay_simulated)
update public.notifications x
   set invoice_id = i.id
  from public.invoices i
 where x.invoice_id is null
   and x.kind in ('invoice.paid', 'deposit.paid')
   and i.company_id = x.company_id
   and i.number = x.payload ->> 'number';

-- the same function as 20261104080000, the notice now carries invoice_id
create or replace function public.portal_pay_simulated(p_token text, p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e    public.estimates;
  inv  public.invoices;
  amt  bigint;
  v_cust text;
begin
  select * into e from public.estimates where public_token = p_token and deleted_at is null;
  if not found or p_token is null then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  select i.* into inv from public.invoices i join public.jobs j on j.id = i.job_id
   where i.id = p_invoice_id and j.estimate_id = e.id and i.status = 'sent' and i.deleted_at is null
   for update of i;
  if not found then
    raise exception 'invoice does not belong to this estimate' using errcode = '22023';
  end if;
  amt := inv.total_cents - inv.paid_cents;
  if amt > 0 then
    insert into public.payments (company_id, invoice_id, customer_id, method, amount_cents, status, idempotency_key, reference)
    values (e.company_id, inv.id, inv.customer_id, 'card', amt, 'succeeded', 'sim-' || inv.id || '-' || inv.paid_cents, 'stripe-simulated');
    select display_name into v_cust from public.customers where id = inv.customer_id;
    insert into public.notifications (company_id, kind, estimate_id, job_id, invoice_id, payload)
    values (e.company_id, case when inv.kind = 'deposit' then 'deposit.paid' else 'invoice.paid' end, e.id, inv.job_id, inv.id,
            jsonb_build_object('customer', v_cust, 'number', inv.number, 'deposit', amt, 'total', amt, 'simulated', true));
  end if;
  return public.portal_estimate(p_token);
end;
$$;
revoke all on function public.portal_pay_simulated(text, uuid) from public;
grant execute on function public.portal_pay_simulated(text, uuid) to anon, authenticated;

-- ---- activities: the person, and the tech's feed ---------------------------------------------
alter table public.activities add column if not exists contact_id uuid;
alter table public.activities add constraint activities_contact_fk
  foreign key (company_id, contact_id) references public.contacts (company_id, id);
create index activities_contact_idx on public.activities (company_id, contact_id, at) where contact_id is not null;

-- the job / client of the row's own company that the tech sees through his visits (same rules as jobs_select,
-- customers_select): security definer so the answer does not depend on RLS of the caller
create or replace function app.tech_sees_activity_subject(p_company uuid, p_type text, p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.has_role(p_company, array['tech']) and case p_type
    -- the same window as notes (app.tech_visit_counts): a live visit of his, not cancelled, not older than 14 days,
    -- on a job that is not cancelled or closed
    when 'job' then exists (select 1 from public.visits v where v.job_id = p_id and v.company_id = p_company and app.tech_visit_counts(v.id))
    when 'customer' then exists (select 1 from public.customers c where c.id = p_id and c.company_id = p_company and c.deleted_at is null)
                    and app.is_customer_assignee(p_id)
    else false
  end;
$$;
revoke all on function app.tech_sees_activity_subject(uuid, text, uuid) from public, anon, authenticated;
grant execute on function app.tech_sees_activity_subject(uuid, text, uuid) to authenticated;

-- the person of an event a tech writes on a job: none, or a person of that job's client
create or replace function app.contact_of_job_customer(p_company uuid, p_job uuid, p_contact uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_contact is null or exists (
    select 1 from public.contacts k join public.jobs j on j.customer_id = k.customer_id and j.company_id = k.company_id
     where k.id = p_contact and k.company_id = p_company and j.id = p_job and k.deleted_at is null);
$$;
revoke all on function app.contact_of_job_customer(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function app.contact_of_job_customer(uuid, uuid, uuid) to authenticated;

drop policy if exists activities_select on public.activities;
-- a lead branch also ties the lead to the row's company (a member of another company cannot drop rows into ours)
create policy activities_select on public.activities for select to authenticated
  using (app.is_staff(company_id)
         or (subject_type = 'lead' and app.can_see_lead(subject_id)
             and exists (select 1 from public.leads l where l.id = subject_id and l.company_id = activities.company_id))
         or (subject_type in ('job', 'customer') and app.tech_sees_activity_subject(company_id, subject_type, subject_id)));
-- a tech writes on the job of his visit («В пути», a call from the job, wave 3); not on the client. Not staff: the event
-- is always his own (actor_id), on a job only a contact kind, and the person is one of that job's client
drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities for insert to authenticated
  with check (app.is_staff(company_id)
              or (actor_id = (select auth.uid())
                  and ((subject_type = 'lead' and app.can_see_lead(subject_id)
                        and exists (select 1 from public.leads l where l.id = subject_id and l.company_id = activities.company_id))
                       or (subject_type = 'job' and kind in ('call', 'sms', 'email')
                           and app.tech_sees_activity_subject(company_id, 'job', subject_id)
                           and app.contact_of_job_customer(company_id, subject_id, contact_id)))));

-- ---- files of a client -----------------------------------------------------------------------
alter table public.files add column if not exists customer_id uuid;
alter table public.files add constraint files_customer_fk
  foreign key (company_id, customer_id) references public.customers (company_id, id);
create index files_customer_idx on public.files (company_id, customer_id) where customer_id is not null;
drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert to authenticated
  with check (app.is_staff(company_id)
              or (app.is_member(company_id)
                  and (customer_id is null or app.is_customer_assignee(customer_id))
                  and (job_id is null or app.is_job_assignee(job_id))
                  and (visit_id is null or app.is_visit_assignee(visit_id))));
-- only a member of the company edits his own file (a removed employee does not)
drop policy if exists files_update on public.files;
create policy files_update on public.files for update to authenticated
  using (app.is_staff(company_id) or (app.is_member(company_id) and created_by = (select auth.uid())))
  with check (app.is_staff(company_id)
              or (app.is_member(company_id) and created_by = (select auth.uid())
                  and (customer_id is null or app.is_customer_assignee(customer_id))
                  and (job_id is null or app.is_job_assignee(job_id))
                  and (visit_id is null or app.is_visit_assignee(visit_id))));

-- ---- rights ----------------------------------------------------------------------------------
alter table public.job_types enable row level security;
alter table public.job_types force row level security;
create policy job_types_select on public.job_types for select to authenticated
  using (app.is_member(company_id));
create policy job_types_insert on public.job_types for insert to authenticated
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));
create policy job_types_update on public.job_types for update to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office']))
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));

revoke all on public.job_types from anon, authenticated;
grant select on public.job_types to authenticated;
grant insert (id, company_id, seed_key, name, position, archived_at, created_at_device, origin_device_id) on public.job_types to authenticated;
grant update (name, position, archived_at) on public.job_types to authenticated;

revoke all on function app.tg_job_type_no_delete() from public, anon, authenticated;
revoke all on function app.seed_job_types(uuid) from public, anon, authenticated;
revoke all on function app.tg_company_seed_job_types() from public, anon, authenticated;
