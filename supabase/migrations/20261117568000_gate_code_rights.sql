-- Р-3: who reads a property's gate code. Owner, admin, office — always (and the removed ones, as before). Sales and tech —
-- only on the day of a live visit of their own at the property or the day before, by the company's time zone (for sales:
-- their inspections, visits.property_id; a cancelled, no-show or completed visit does not count, as for the tech).
-- Writing: the table itself — owner, admin, office; the code is set through public.set_gate_code (owner, admin, office,
-- sales): sales still put down the code the client tells them at the inspection, without reading it back. An upsert on the
-- table needs the read rule (ON CONFLICT DO UPDATE checks the row against the select policy), so the app writes only
-- through the function (cloud/ops.ts property.gate); an old build of sales that sends the upsert gets a refusal (42501:
-- the queue drops the op, the code is not saved until the app is updated). app.can_see_gate_code keeps its signature (rule 16); rule 18 — revoke, then the same grant as before.
-- The app's canSeeGateCode (features/properties.ts) follows the same rule. Test T434.

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

alter policy property_secrets_insert on public.property_secrets
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));
alter policy property_secrets_update on public.property_secrets
  using (app.has_role(company_id, array['owner', 'admin', 'office']))
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));

-- set (the office also clears: an empty code) the gate code of a property; returns nothing — not the code before either.
-- Sales put down a code the client tells them: a non-empty one only, and not over a code the office removed
-- (deleted_at is the office's: only the office brings a removed code back).
create or replace function public.set_gate_code(p_property_id uuid, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
  v_code text := nullif(btrim(coalesce(p_code, '')), '');
  v_office boolean;
begin
  select p.company_id into v_company from public.properties p where p.id = p_property_id and p.deleted_at is null;
  if v_company is null or not app.has_role(v_company, array['owner', 'admin', 'office', 'sales']) then
    raise exception 'set_gate_code: not allowed' using errcode = '42501';
  end if;
  if v_code is not null and length(v_code) > 64 then
    raise exception 'set_gate_code: at most 64 characters' using errcode = '22023';
  end if;
  v_office := app.has_role(v_company, array['owner', 'admin', 'office']);
  if not v_office and v_code is null then
    raise exception 'set_gate_code: only the office clears a code' using errcode = '22023';
  end if;
  if not v_office and exists (select 1 from public.property_secrets s
                               where s.property_id = p_property_id and s.deleted_at is not null) then
    raise exception 'set_gate_code: the code was removed by the office' using errcode = '42501';
  end if;
  insert into public.property_secrets (property_id, company_id, gate_code, deleted_at)
  values (p_property_id, v_company, v_code, null)
  on conflict (property_id) do update set gate_code = excluded.gate_code, deleted_at = null;
end;
$$;
revoke all on function public.set_gate_code(uuid, text) from public, anon, authenticated;
grant execute on function public.set_gate_code(uuid, text) to authenticated;
