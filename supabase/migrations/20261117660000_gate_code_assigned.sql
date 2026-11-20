-- #2263 (founder's answer to question 51, 20.11.2026: «показывает всегда, пока он назначен на работу»): a tech, sales or a
-- subcontractor reads a property's gate code for as long as they are assigned to the work there — not only on the visit day
-- and the day before (20261105170000, 20261105280000, 20261117568000). Owner, admin, office — always, as before.
-- «Assigned»: in visit_assignees (not removed) of a visit at this property (visits.property_id) that is not removed, not
-- cancelled and not a no-show, and
--   • a visit of a job — the job is not removed and not cancelled, closed or completed (a completed visit of a job still
--     going on counts: the work is not over);
--   • an inspection (no job) — the visit itself is still open (not completed).
-- No date: a visit without a time counts as well. Taken off the visit, the job closed or cancelled — no code.
-- The policies of property_secrets call this function and stay as they are. app.can_see_gate_code keeps its signature
-- (rule 16); rule 18 — revoke, then the same grant as before. The app's canSeeGateCode (features/properties.ts) follows
-- the same rule. Tests T470–T473 (and T20, T434 under the new rule).

create or replace function app.can_see_gate_code(p_property_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.properties p
     where p.id = p_property_id and p.deleted_at is null
       and (app.has_role(p.company_id, array['owner', 'admin', 'office'])
            or (app.has_role(p.company_id, array['tech', 'sales', 'subcontractor'])
                and exists (
                  select 1 from public.visits v
                    join public.visit_assignees a on a.visit_id = v.id and a.deleted_at is null and a.user_id = auth.uid()
                    left join public.jobs j on j.id = v.job_id
                   where v.property_id = p.id and v.company_id = p.company_id and v.deleted_at is null
                     and v.status not in ('cancelled', 'no_show')
                     and ((v.job_id is not null and j.deleted_at is null and j.status not in ('cancelled', 'closed', 'completed'))
                          or (v.job_id is null and v.status <> 'completed')))))
  );
$$;
revoke all on function app.can_see_gate_code(uuid) from public, anon, authenticated;
grant execute on function app.can_see_gate_code(uuid) to authenticated;
