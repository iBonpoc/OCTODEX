-- Security review of C2 (gate code, migration 20261105160000), blocker: visits_update_tech lets a tech change any column
-- of their visit. A tech could set starts_at = now() and get the gate code at once, or point job_id at another job and
-- see that property, client and code. A tech only moves a visit through its steps (status, work started, checklist,
-- signature); time, job, lead, company and deletion are the office's.
-- Also: a cancelled job no longer opens the gate code.

create or replace function app.tg_visit_tech_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_staff(old.company_id) then return new; end if;
  if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
     or new.job_id is distinct from old.job_id or new.lead_id is distinct from old.lead_id
     or new.company_id is distinct from old.company_id or new.kind is distinct from old.kind
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'only the office changes the time, job or place of a visit' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists t05_visit_tech_guard on public.visits;
create trigger t05_visit_tech_guard before update on public.visits
  for each row execute function app.tg_visit_tech_guard();
revoke execute on function app.tg_visit_tech_guard() from public;

-- the gate code rule again, now also refusing a cancelled or closed job
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
                  select 1 from public.jobs j
                    join public.visits v on v.job_id = j.id and v.deleted_at is null and v.status not in ('cancelled', 'no_show', 'completed')
                    join public.visit_assignees a on a.visit_id = v.id and a.deleted_at is null and a.user_id = auth.uid()
                   where j.property_id = p.id and j.deleted_at is null and j.status not in ('cancelled', 'closed', 'completed')
                     and v.starts_at is not null
                     and (v.starts_at at time zone coalesce(nullif(co.timezone, ''), 'America/Los_Angeles'))::date
                         between (now() at time zone coalesce(nullif(co.timezone, ''), 'America/Los_Angeles'))::date
                             and (now() at time zone coalesce(nullif(co.timezone, ''), 'America/Los_Angeles'))::date + 1)))
  );
$$;
revoke execute on function app.can_see_gate_code(uuid) from public, anon;
grant execute on function app.can_see_gate_code(uuid) to authenticated;
