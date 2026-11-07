-- Пуши, автор сметы (docs/specs/27-push.md §4.11 №1–№2; P4a-fix, решение руководителя №5 07.11).
-- The «author» of «the client signed» / «the client opened» was estimates.owner_user_id — and the app never fills it in
-- (nothing in apps/mobile writes it; T81/T84 set it by hand). So «opened» reached nobody and «signed» only owner and admin.
-- Now the author is owner_user_id, else created_by (set by the core trigger on every insert, core.sql:269).
-- A person whose only role is tech is not an author here (§4.11 №2): a tech sees the switches «Выезды» and «Лиды» only,
-- so every push he gets has a switch on his screen.
-- Only create or replace of functions (rule 16: nothing renamed or dropped); the bodies are those of 20261107110000
-- (tg_notification_push) and 20261107120000 (push_still_recipient) with the author read through app.push_estimate_author.

create or replace function app.push_estimate_author(p_company uuid, p_estimate uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  -- the role is checked before the choice: a tech put as owner_user_id falls back to who made it (security-check, low)
  select coalesce(case when app.push_role(p_company, e.owner_user_id) is distinct from 'tech' then e.owner_user_id end,
                  case when app.push_role(p_company, e.created_by) is distinct from 'tech' then e.created_by end)
    from public.estimates e where e.id = p_estimate and e.company_id = p_company;
$$;
revoke all on function app.push_estimate_author(uuid, uuid) from public, anon, authenticated;

-- the feed rows → the queue (body of 20261107110000, the author through app.push_estimate_author)
create or replace function app.tg_notification_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_kind   text;
  v_route  text;
  v_author uuid;
  v_roles  text[] := array['owner', 'admin'];
begin
  begin
    if new.kind in ('estimate.client_signed', 'estimate.viewed') and new.estimate_id is not null then
      v_kind := new.kind;
      v_route := '/estimate/' || new.estimate_id::text;
      v_author := app.push_estimate_author(new.company_id, new.estimate_id);
      if new.kind = 'estimate.viewed' then
        -- only the author, and only if they switched it on (off by default, §4.7 №7)
        v_roles := array[]::text[];
        if v_author is null then
          return null;
        end if;
      end if;
    elsif new.kind in ('deposit.paid', 'invoice.paid') then
      v_kind := 'payment.received';
      v_route := case when new.invoice_id is not null then '/invoice/' || new.invoice_id::text
                      when new.estimate_id is not null then '/estimate/' || new.estimate_id::text
                      else '/notifications' end;
    else
      -- estimate.approved is the office's own act
      return null;
    end if;
    insert into public.push_outbox (company_id, user_id, notification_id, kind, route)
    select new.company_id, r, new.id, v_kind, v_route
      from app.push_recipients(new.company_id, v_roles, v_author) r
     where app.push_enabled(new.company_id, r, v_kind)
    on conflict (notification_id, user_id) do nothing;
  exception when others then
    -- the push never rolls back what happened (a signature, a payment); the reason goes to the server log only
    raise warning 'push queue: %', sqlstate;
  end;
  return null;
end;
$$;
revoke all on function app.tg_notification_push() from public, anon, authenticated;

-- at sending time (body of 20261107120000, the author through app.push_estimate_author)
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
