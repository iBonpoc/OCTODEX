-- #1631: the team's notes about a client, a property or a job are read and written (besides the office and the author)
-- by a tech of that work — not by a subcontractor on the visit (the rights matrix: a subcontractor sees the visit and
-- its photos, not the company's notes). The 14-day window of a tech's visits stays as it was (tech_visit_counts and
-- the assignee functions). Leads and estimates keep their own rules (can_see_lead, can_read_estimate).
-- Rule 16: the same signature; nothing renamed or dropped. An older app of a subcontractor that tries to add such a note
-- gets a refusal (the outbox shows it), as for any other right he does not have.
create or replace function app.can_see_note_subject(p_type text, p_id uuid, p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'lead' then exists (select 1 from public.leads x where x.id = p_id and x.company_id = p_company_id) and app.can_see_lead(p_id)
    when 'property' then app.has_role(p_company_id, array['tech'])
                         and exists (select 1 from public.properties x where x.id = p_id and x.company_id = p_company_id and x.deleted_at is null)
                         and app.is_property_assignee(p_id)
    when 'job' then app.has_role(p_company_id, array['tech'])
                    and exists (select 1 from public.jobs j join public.visits v on v.job_id = j.id
                                 where j.id = p_id and j.company_id = p_company_id and j.deleted_at is null and app.tech_visit_counts(v.id))
    when 'customer' then app.has_role(p_company_id, array['tech'])
                         and exists (select 1 from public.customers x where x.id = p_id and x.company_id = p_company_id)
                         and app.is_customer_assignee(p_id)
    when 'estimate' then exists (select 1 from public.estimates x where x.id = p_id and x.company_id = p_company_id and x.deleted_at is null)
                         and app.can_read_estimate(p_id)
    else false end;
$$;
revoke all on function app.can_see_note_subject(text, uuid, uuid) from public, anon, authenticated;
grant execute on function app.can_see_note_subject(text, uuid, uuid) to authenticated;
