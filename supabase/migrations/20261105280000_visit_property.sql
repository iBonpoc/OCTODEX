-- Visit and Plan, wave П1a (docs/specs/03-visit-and-plan.md §3.1, §4; story map S4, S4a, S9a).
-- * A visit belongs to a property (visits.property_id): an inspection is a visit of a lead at a property, without a job.
--   The rule "a job or a lead" becomes "a property". Until the app sends property_id (wave П1b) a trigger fills it
--   from the job, else from the lead.
-- * Old inspections stored as jobs ("Estimate visit", type inspection, no estimate) move to their visits: the visit gets
--   the property and the lead, loses the job; the job is soft-deleted. A job with an estimate, an invoice, an expense,
--   a file, a task or a note is never touched.
-- * Cancellation reason on a visit; transitions for the roll-backs S4a (last inspection cancelled: lead back to
--   contacted) and S9a (last visit of a job cancelled: job back to draft = "waits for a date"). A visit already on site
--   is no longer cancelled (the tech is there: only through the job).
-- * The tech guard: a tech does not cancel or no-show a visit and does not move it to another property.
-- * What a tech sees goes through the visit's own property (an inspection has no job): properties, clients, notes,
--   gate code.

-- ---- the field and the rule -----------------------------------------------------------------
alter table public.visits add column if not exists property_id uuid;
alter table public.visits drop constraint if exists visits_property_fk;
alter table public.visits add constraint visits_property_fk
  foreign key (company_id, property_id) references public.properties (company_id, id);
create index if not exists visits_property_idx on public.visits (company_id, property_id) where deleted_at is null;

alter table public.visits
  add column if not exists cancel_reason      text check (cancel_reason in ('client_cancelled', 'no_show', 'reschedule_later', 'we_cancelled', 'other')),
  add column if not exists cancel_reason_text text check (cancel_reason_text is null or char_length(cancel_reason_text) <= 500),
  add column if not exists cancelled_at       timestamptz,
  add column if not exists cancelled_by       uuid;
alter table public.visits drop constraint if exists visits_cancel_other_text;
alter table public.visits add constraint visits_cancel_other_text
  check (cancel_reason is distinct from 'other' or coalesce(btrim(cancel_reason_text), '') <> '');

-- fill from the job, else from the lead; never overwrite (the app sends it from wave П1b)
create or replace function app.tg_visit_property()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.property_id is null and new.job_id is not null then
    select j.property_id into new.property_id from public.jobs j where j.id = new.job_id and j.company_id = new.company_id;
  end if;
  if new.property_id is null and new.lead_id is not null then
    select l.property_id into new.property_id from public.leads l where l.id = new.lead_id and l.company_id = new.company_id;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_visit_property() from public, anon, authenticated;
drop trigger if exists t04_visit_property on public.visits;
create trigger t04_visit_property before insert or update of job_id, lead_id, property_id on public.visits
  for each row execute function app.tg_visit_property();

-- existing rows: from the job, else the lead (service fields untouched)
alter table public.visits disable trigger user;
update public.visits v set property_id = j.property_id
  from public.jobs j where v.property_id is null and j.id = v.job_id and j.company_id = v.company_id;
update public.visits v set property_id = l.property_id
  from public.leads l where v.property_id is null and l.id = v.lead_id and l.company_id = v.company_id and l.property_id is not null;

-- ---- old inspections stored as jobs → visits of the lead ------------------------------------
create temporary table _inspection_jobs as
select j.id, j.company_id, j.property_id
  from public.jobs j
 where j.deleted_at is null and j.estimate_id is null
   and (j.type = 'inspection' or j.title = 'Estimate visit')
   and not exists (select 1 from public.invoices i where i.job_id = j.id)
   and not exists (select 1 from public.expenses x where x.job_id = j.id)
   and not exists (select 1 from public.files f where f.job_id = j.id)
   and not exists (select 1 from public.tasks t where t.subject_type = 'job' and t.subject_id = j.id and t.deleted_at is null)
   and not exists (select 1 from public.notes n where n.subject_type = 'job' and n.subject_id = j.id and n.deleted_at is null)
   -- only jobs whose every visit knows its lead (S4: an inspection belongs to a lead)
   and exists (select 1 from public.visits v where v.job_id = j.id)
   and not exists (select 1 from public.visits v where v.job_id = j.id and v.lead_id is null);
update public.visits v set property_id = coalesce(v.property_id, ij.property_id), job_id = null, kind = 'inspection'
  from _inspection_jobs ij where v.job_id = ij.id;
alter table public.visits enable trigger user;
alter table public.jobs disable trigger user;
update public.jobs j set deleted_at = now() from _inspection_jobs ij where j.id = ij.id;
alter table public.jobs enable trigger user;
drop table _inspection_jobs;

-- the new rule: a visit is at a property. NOT VALID: an old visit of a lead without a property keeps loading;
-- every new or changed row must have one (the trigger above fills it in for the current app).
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.visits'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%job_id IS NOT NULL%lead_id IS NOT NULL%'
  loop
    execute format('alter table public.visits drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.visits drop constraint if exists visits_property_required;
alter table public.visits add constraint visits_property_required check (property_id is not null) not valid;

-- ---- transitions --------------------------------------------------------------------------
insert into app.status_transitions (entity_type, from_status, to_status) values
  ('lead', 'inspection_scheduled', 'contacted'),   -- S4a: the last open inspection cancelled
  ('job', 'scheduled', 'draft')                    -- S9a: the last open visit of a job cancelled → waits for a date again
on conflict do nothing;
delete from app.status_transitions where entity_type = 'visit' and from_status = 'on_site' and to_status = 'cancelled';

-- ---- the tech guard (20261105170000 + status and property) ----------------------------------
create or replace function app.tg_visit_tech_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or app.is_staff(old.company_id) then return new; end if;
  if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
     or new.job_id is distinct from old.job_id or new.lead_id is distinct from old.lead_id
     or new.property_id is distinct from old.property_id
     or new.company_id is distinct from old.company_id or new.kind is distinct from old.kind
     or new.deleted_at is distinct from old.deleted_at
     or new.arrival_window_start is distinct from old.arrival_window_start or new.arrival_window_end is distinct from old.arrival_window_end
     or new.notify_customer is distinct from old.notify_customer or new.crew_id is distinct from old.crew_id
     or new.subcontractor_assignment_id is distinct from old.subcontractor_assignment_id or new.schedule_mode is distinct from old.schedule_mode
     or new.flex_week_start is distinct from old.flex_week_start or new.sequence_in_route is distinct from old.sequence_in_route
     or new.cancel_reason is distinct from old.cancel_reason or new.cancel_reason_text is distinct from old.cancel_reason_text
     or new.cancelled_at is distinct from old.cancelled_at or new.cancelled_by is distinct from old.cancelled_by then
    raise exception 'only the office changes the time, job or place of a visit' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and new.status in ('cancelled', 'no_show') then
    raise exception 'only the office cancels a visit' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_visit_tech_guard() from public, anon, authenticated;

-- ---- what a tech sees: through the visit's own property --------------------------------------
create or replace function app.is_property_assignee(p_property_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.visits v
     where v.property_id = p_property_id and v.deleted_at is null
       and app.tech_visit_counts(v.id)
  );
$$;

create or replace function app.is_customer_assignee(p_customer_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.visits v
      join public.properties p on p.id = v.property_id and p.company_id = v.company_id
     where p.customer_id = p_customer_id and v.deleted_at is null
       and app.tech_visit_counts(v.id)
  );
$$;

create or replace function app.can_see_note_subject(p_type text, p_id uuid, p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'lead' then exists (select 1 from public.leads x where x.id = p_id and x.company_id = p_company_id) and app.can_see_lead(p_id)
    when 'property' then exists (select 1 from public.properties x where x.id = p_id and x.company_id = p_company_id and x.deleted_at is null)
                         and app.is_property_assignee(p_id)
    when 'job' then exists (select 1 from public.jobs j join public.visits v on v.job_id = j.id
                             where j.id = p_id and j.company_id = p_company_id and j.deleted_at is null and app.tech_visit_counts(v.id))
    when 'customer' then exists (select 1 from public.customers x where x.id = p_id and x.company_id = p_company_id)
                         and app.is_customer_assignee(p_id)
    when 'estimate' then exists (select 1 from public.estimates x where x.id = p_id and x.company_id = p_company_id and x.deleted_at is null)
                         and app.can_read_estimate(p_id)
    else false end;
$$;

-- gate code: today or tomorrow by the company calendar, a live visit of the tech at this property;
-- a visit of a job needs a live job, an inspection has none
create or replace function app.can_see_gate_code(p_property_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.properties p
      join public.companies co on co.id = p.company_id
     where p.id = p_property_id and p.deleted_at is null
       and (app.is_staff(p.company_id)
            or (app.has_role(p.company_id, array['tech'])
                and exists (
                  select 1 from public.visits v
                    join public.visit_assignees a on a.visit_id = v.id and a.deleted_at is null and a.user_id = auth.uid()
                    left join public.jobs j on j.id = v.job_id
                   where v.property_id = p.id and v.deleted_at is null and v.status not in ('cancelled', 'no_show', 'completed')
                     and (v.job_id is null or (j.deleted_at is null and j.status not in ('cancelled', 'closed', 'completed')))
                     and v.starts_at is not null
                     and (v.starts_at at time zone coalesce(nullif(co.timezone, ''), 'America/Los_Angeles'))::date
                         between (now() at time zone coalesce(nullif(co.timezone, ''), 'America/Los_Angeles'))::date
                             and (now() at time zone coalesce(nullif(co.timezone, ''), 'America/Los_Angeles'))::date + 1)))
  );
$$;

revoke all on function app.is_property_assignee(uuid) from public, anon, authenticated;
revoke all on function app.is_customer_assignee(uuid) from public, anon, authenticated;
revoke all on function app.can_see_note_subject(text, uuid, uuid) from public, anon, authenticated;
revoke all on function app.can_see_gate_code(uuid) from public, anon, authenticated;
grant execute on function app.is_property_assignee(uuid) to authenticated;
grant execute on function app.is_customer_assignee(uuid) to authenticated;
grant execute on function app.can_see_note_subject(text, uuid, uuid) to authenticated;
grant execute on function app.can_see_gate_code(uuid) to authenticated;
