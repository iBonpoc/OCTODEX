-- Р-3: who reads a property's gate code. Owner, admin, office — always (and the removed ones, as before). Sales and tech —
-- only on the day of a live visit of their own at the property or the day before, by the company's time zone (for sales:
-- their inspections, visits.property_id; a cancelled, no-show or completed visit does not count, as for the tech).
-- Writing stays as it was (property_secrets_insert / _update: is_staff — sales sets the code of a property they create).
-- app.can_see_gate_code keeps its signature (rule 16); rule 18 — revoke, then the same grant as before. The app's
-- canSeeGateCode (features/properties.ts) follows the same rule. Test T434.

create or replace function app.can_see_gate_code(p_property_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.properties p
      join public.companies co on co.id = p.company_id
     where p.id = p_property_id and p.deleted_at is null
       and (app.has_role(p.company_id, array['owner', 'admin', 'office'])
            or (app.has_role(p.company_id, array['tech', 'sales'])
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
revoke all on function app.can_see_gate_code(uuid) from public, anon, authenticated;
grant execute on function app.can_see_gate_code(uuid) to authenticated;

alter policy property_secrets_select on public.property_secrets
  using (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (deleted_at is null and app.can_see_gate_code(property_id)));
