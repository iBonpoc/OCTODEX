-- Security review of #67 (handover 05.11 §4): what a tech sees.
-- 1) app.is_property_assignee ignored time and status: a tech kept seeing a property (and, through it,
--    app.can_see_property, property tasks, estimates of the property) after any visit there, even a cancelled one.
--    docs/specs/04 §8: a tech sees the properties of their visits today, in the future and in the last 14 days
--    (company calendar), never through a cancelled or no-show visit.
-- 2) notes_select opened every team note of the company to a tech: an office note with a gate code bypassed
--    "the code only on the day of the visit". Outside the office a member sees their own notes and the team notes
--    of subjects they see: their lead, a property they see, a job with their visit in the window, the client of
--    such a job, an estimate they may read.

-- A visit of the caller counts for a tech: not deleted, not cancelled, not no-show, its job (if any) not deleted,
-- cancelled or closed, and dated today, in the future or within the last 14 days by the company's calendar.
-- A visit with no time yet counts by the last day of its flex week; with neither, by the day it was created
-- (so a visit never booked drops out 14 days after it was made).
create or replace function app.tech_visit_counts(p_visit_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.visits v
      join public.companies co on co.id = v.company_id
      join public.visit_assignees a on a.visit_id = v.id and a.deleted_at is null and a.user_id = auth.uid()
      left join public.jobs j on j.id = v.job_id
     where v.id = p_visit_id
       and v.deleted_at is null
       and v.status not in ('cancelled', 'no_show')
       and (v.job_id is null or (j.deleted_at is null and j.status not in ('cancelled', 'closed')))
       and coalesce((v.starts_at at time zone coalesce(nullif(co.timezone, ''), 'America/Los_Angeles'))::date,
                    v.flex_week_start + 6,
                    (v.created_at at time zone coalesce(nullif(co.timezone, ''), 'America/Los_Angeles'))::date)
           >= (now() at time zone coalesce(nullif(co.timezone, ''), 'America/Los_Angeles'))::date - 14
  );
$$;

create or replace function app.is_property_assignee(p_property_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.jobs j
    join public.visits v on v.job_id = j.id and v.deleted_at is null
    where j.property_id = p_property_id
      and j.deleted_at is null
      and app.tech_visit_counts(v.id)
  );
$$;

-- the subject of a note is visible to the caller; security definer: checks the subject itself, then the caller's
-- rights through the helpers (can_see_lead, is_property_assignee, tech_visit_counts, can_read_estimate), all by auth.uid()
create or replace function app.can_see_note_subject(p_type text, p_id uuid, p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'lead' then exists (select 1 from public.leads x where x.id = p_id and x.company_id = p_company_id) and app.can_see_lead(p_id)
    when 'property' then exists (select 1 from public.properties x where x.id = p_id and x.company_id = p_company_id and x.deleted_at is null)
                         and app.is_property_assignee(p_id)
    when 'job' then exists (select 1 from public.jobs j join public.visits v on v.job_id = j.id
                             where j.id = p_id and j.company_id = p_company_id and j.deleted_at is null and app.tech_visit_counts(v.id))
    when 'customer' then exists (select 1 from public.jobs j join public.visits v on v.job_id = j.id
                                  where j.customer_id = p_id and j.company_id = p_company_id and j.deleted_at is null and app.tech_visit_counts(v.id))
    when 'estimate' then exists (select 1 from public.estimates x where x.id = p_id and x.company_id = p_company_id and x.deleted_at is null)
                         and app.can_read_estimate(p_id)
    else false end;
$$;

revoke all on function app.tech_visit_counts(uuid) from public, anon, authenticated;
revoke all on function app.can_see_note_subject(text, uuid, uuid) from public, anon, authenticated;
revoke all on function app.is_property_assignee(uuid) from public, anon, authenticated;
grant execute on function app.tech_visit_counts(uuid) to authenticated;
grant execute on function app.can_see_note_subject(text, uuid, uuid) to authenticated;
grant execute on function app.is_property_assignee(uuid) to authenticated;

drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes for select to authenticated
  using (app.is_member(company_id)
         and (created_by = (select auth.uid())
              or (visibility = 'team'
                  and (app.is_staff(company_id) or app.can_see_note_subject(subject_type, subject_id, company_id)))));
