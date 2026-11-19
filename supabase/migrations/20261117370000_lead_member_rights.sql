-- #2075: the rights of a member who is not staff (the tech) on his own lead follow the roles decision (audit of roles
-- #2064): he works his lead — its contact fields, the next step, close / reopen / snooze, the first reply — and the rest
-- of the lead stays the office's.
--   * leads_update: WITH CHECK = USING without «not deleted» — the lead stays «his» after his change (assigned to him or
--     brought by him; a subcontractor has no leads); moving his own lead to the Trash stays with t03_trash_guard
--     (spec 38: the author may).
--   * t12_lead_member_guard (not staff, the app's role only; server functions and the service role pass):
--       - a new lead of his is a plain new one (status new, the receipt time the server's, no intake / marketplace /
--         price / result / link fields — the app sends none);
--       - assigned_to — unchanged, or to himself;
--       - unchanged: company, author, created time, source, the lead's price, client and property, «referred by»,
--         number and receipt time, how it was won, the marketplace / intake fields, the duplicate and «from a visit»
--         links, archived_at; the first reply is set once and never moved;
--       - status «won» (making a client) and «archived» — the office's.
--     The deletion stays with the Trash rules (t03_trash_guard), the status transitions with t30_guard_status.
-- An old phone's queued change is refused with 42501 and shown in «Требует внимания» (outboxRetry isAccessDenied).
-- db T417–T419. Rule 16: the policy altered in place, a new trigger function and a trigger, nothing renamed or dropped.
-- Rule 18: the new function — revoke all from public, anon, authenticated; a trigger needs no execute right.

alter policy leads_update on public.leads
  using (app.is_staff(company_id)
         or (app.is_member(company_id) and not app.has_role(company_id, array['subcontractor']) and deleted_at is null
             and (assigned_to = (select auth.uid()) or created_by = (select auth.uid()))))
  with check (app.is_staff(company_id)
              or (app.is_member(company_id) and not app.has_role(company_id, array['subcontractor'])
                  and (assigned_to = (select auth.uid()) or created_by = (select auth.uid()))));

create or replace function app.tg_lead_member_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- a server function or the service role pass (their own checks); a separate «if», so the service role never plans
  -- app.is_staff, which it may not execute (CHECKS §9 №47)
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if app.is_staff(new.company_id) then
    return new;   -- the office
  end if;

  if tg_op = 'INSERT' then
    -- a lead he brings is a plain new lead: the receipt time is the server's, nothing of the intake, the marketplace,
    -- the price, a result or a link the office makes (the app sends none of these: lead.add, leadCols)
    new.received_at := now();
    if new.status <> 'new' or new.won_via is not null or new.archived_at is not null
       or new.provider is not null or new.provider_ref is not null or new.parse_status is not null
       or new.intake_event_id is not null or new.inbound_message_id is not null or new.utm is not null
       or new.duplicate_of_lead_id is not null or new.referred_by_customer_id is not null
       or new.cost_origin is not null or new.cost_refunded_cents <> 0 or new.phone_is_relay
       or new.first_response_at is not null or new.first_response_kind is not null then
      raise exception 'only the office makes a lead like this' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is distinct from auth.uid() then
    raise exception 'a lead is given to someone else by the office' using errcode = '42501';
  end if;
  if new.company_id is distinct from old.company_id or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at or new.created_at_device is distinct from old.created_at_device
     or new.source_id is distinct from old.source_id or new.source_ref is distinct from old.source_ref
     or new.cost_cents is distinct from old.cost_cents or new.cost_origin is distinct from old.cost_origin
     or new.cost_refunded_cents is distinct from old.cost_refunded_cents or new.currency is distinct from old.currency
     or new.customer_id is distinct from old.customer_id or new.property_id is distinct from old.property_id
     or new.referred_by_customer_id is distinct from old.referred_by_customer_id
     or new.number is distinct from old.number or new.received_at is distinct from old.received_at
     or new.won_via is distinct from old.won_via or new.archived_at is distinct from old.archived_at
     or new.duplicate_of_lead_id is distinct from old.duplicate_of_lead_id
     or new.inbound_message_id is distinct from old.inbound_message_id
     or new.referred_from_visit_id is distinct from old.referred_from_visit_id or new.utm is distinct from old.utm
     or new.provider is distinct from old.provider or new.provider_ref is distinct from old.provider_ref
     or new.parse_status is distinct from old.parse_status or new.intake_event_id is distinct from old.intake_event_id
     or new.phone_is_relay is distinct from old.phone_is_relay
     -- the first reply is set once (the app: «is first_response_at null»), never moved
     or (old.first_response_at is not null and (new.first_response_at is distinct from old.first_response_at
                                                or new.first_response_kind is distinct from old.first_response_kind)) then
    raise exception 'only the office changes this of a lead' using errcode = '42501';
  end if;
  -- making a client and archiving are the office's (his buttons: close, reopen, snooze)
  if new.status in ('won', 'archived') and new.status is distinct from old.status then
    raise exception 'only the office makes a lead won or archived' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_lead_member_guard() from public, anon, authenticated;

-- t12: before the place guard (t06 runs earlier by name, it only checks), the assignee rule (t13), the status (t30)
drop trigger if exists t12_lead_member_guard on public.leads;
create trigger t12_lead_member_guard before insert or update on public.leads
  for each row execute function app.tg_lead_member_guard();
