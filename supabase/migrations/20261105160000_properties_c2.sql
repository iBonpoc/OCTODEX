-- Clients C2 (docs/specs/04-clients-and-properties.md §3, §7.3; founder 04.11): properties inside a client.
--   1. People of a property (tenant, property manager): links to the client's people (contact_ids).
--   2. Gate code kept apart from the property row (property_secrets): the office sees and sets it; a tech gets it only
--      on the day of their visit and the day before (company time zone), through app.can_see_gate_code.
--      Access notes (dog, side gate, parking) stay on the property: whoever sees the property sees them.

-- ---- 1. People of a property ------------------------------------------------------------------
alter table public.properties add column if not exists contact_ids uuid[] not null default '{}';

-- ---- 2. Gate code -----------------------------------------------------------------------------
create table if not exists public.property_secrets (
  property_id uuid primary key,
  company_id  uuid not null references public.companies (id),
  gate_code   text check (gate_code is null or length(gate_code) <= 64),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  foreign key (company_id, property_id) references public.properties (company_id, id)
);
select app.attach_standard_triggers('public.property_secrets');

-- A tech may read the code on the day of a visit of theirs at this property, or the day before (company time zone).
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
                   where j.property_id = p.id and j.deleted_at is null and v.starts_at is not null
                     and (v.starts_at at time zone coalesce(nullif(co.timezone, ''), 'America/Los_Angeles'))::date
                         between (now() at time zone coalesce(nullif(co.timezone, ''), 'America/Los_Angeles'))::date
                             and (now() at time zone coalesce(nullif(co.timezone, ''), 'America/Los_Angeles'))::date + 1)))
  );
$$;

alter table public.property_secrets enable row level security;
alter table public.property_secrets force row level security;
-- the office also sees removed codes (a soft delete must stay visible to whoever made it); a tech only live ones
create policy property_secrets_select on public.property_secrets for select to authenticated
  using (app.is_staff(company_id) or (deleted_at is null and app.can_see_gate_code(property_id)));
create policy property_secrets_insert on public.property_secrets for insert to authenticated
  with check (app.is_staff(company_id));
create policy property_secrets_update on public.property_secrets for update to authenticated
  using (app.is_staff(company_id)) with check (app.is_staff(company_id));

-- ---- Grants ------------------------------------------------------------------------------------
revoke all on public.property_secrets from anon, authenticated;
grant select, insert, update on public.property_secrets to authenticated;
revoke execute on function app.can_see_gate_code(uuid) from public, anon;
grant execute on function app.can_see_gate_code(uuid) to authenticated;
