-- Пуши: no «signed» / «opened» push about a deleted estimate (docs/specs/27-push.md §4.12; security-check #315, lead 07.11).
-- At sending time app.push_still_recipient now skips (not_member) a row whose estimate has deleted_at. Only create or
-- replace (rule 16); the body is that of 20261107140000 plus the check.

create or replace function app.push_still_recipient(p_row public.push_outbox)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_author uuid;
  v_lead   public.leads;
  v_role   text;
begin
  if app.company_closed(p_row.company_id) then
    return false;
  end if;
  if p_row.kind in ('estimate.client_signed', 'estimate.viewed') then
    -- the estimate was deleted after the push was queued: nothing to open any more (security-check #315)
    if exists (select 1 from public.notifications n join public.estimates e on e.id = n.estimate_id and e.company_id = n.company_id
                where n.id = p_row.notification_id and e.deleted_at is not null) then
      return false;
    end if;
    select app.push_estimate_author(n.company_id, n.estimate_id) into v_author
      from public.notifications n where n.id = p_row.notification_id;
    return p_row.user_id in (select app.push_recipients(p_row.company_id,
             case when p_row.kind = 'estimate.viewed' then array[]::text[] else array['owner', 'admin'] end, v_author));
  elsif p_row.kind = 'payment.received' then
    return p_row.user_id in (select app.push_recipients(p_row.company_id, array['owner', 'admin'], null));
  elsif p_row.kind in ('visit.assigned', 'visit.rescheduled') then
    -- still on the visit, and the visit still ahead; not a subcontractor (he cannot open the visit yet, §4.8)
    return app.push_member(p_row.company_id, p_row.user_id)
       and app.push_role(p_row.company_id, p_row.user_id) is distinct from 'subcontractor'
       and exists (select 1 from public.visit_assignees a join public.visits v on v.id = a.visit_id and v.company_id = a.company_id
                    where a.visit_id = p_row.source_id and a.user_id = p_row.user_id and a.company_id = p_row.company_id
                      and a.deleted_at is null and v.deleted_at is null and v.status in ('scheduled', 'en_route'));
  elsif p_row.kind in ('lead.reminder', 'lead.escalation') then
    -- still without an answer; the reminder — still the assignee's; the escalation — an owner, and someone else holds it
    v_role := app.push_role(p_row.company_id, p_row.user_id);
    if v_role is null or v_role = 'subcontractor' or not app.push_member(p_row.company_id, p_row.user_id) then
      return false;
    end if;
    select * into v_lead from public.leads l where l.id = p_row.source_id and l.company_id = p_row.company_id;
    if v_lead.id is null or not app.push_lead_unanswered(v_lead) then
      return false;
    end if;
    return case when p_row.kind = 'lead.reminder' then v_lead.assigned_to = p_row.user_id
                else v_role = 'owner' and v_lead.assigned_to is distinct from p_row.user_id end;
  elsif p_row.kind in ('lead.new', 'lead.assigned') then
    v_role := app.push_role(p_row.company_id, p_row.user_id);
    if v_role is null or v_role = 'subcontractor' or not app.push_member(p_row.company_id, p_row.user_id) then
      return false;
    end if;
    select * into v_lead from public.leads l where l.id = p_row.source_id and l.company_id = p_row.company_id;
    if v_lead.id is null or not app.push_lead_open(v_lead) then
      return false;
    end if;
    -- «assigned to you»: still theirs; «new lead»: still theirs, or they handle the flow (owner, admin, office)
    return v_lead.assigned_to = p_row.user_id or (p_row.kind = 'lead.new' and v_role in ('owner', 'admin', 'office'));
  end if;
  return false;
end;
$$;
revoke all on function app.push_still_recipient(public.push_outbox) from public, anon, authenticated;
