-- M2 (docs/specs/33-gutters-module.md §3–§4, §8, П11; docs/specs/33-gutters-measurement-db.md П19): the gutter
-- measurement of the module Gutters — a drawing on a lead or a property (or a draft without either, К7 fallback).
--   gutter_measurements          one measurement: where, label, draft / ready, current revision
--   gutter_measurement_elements  what is drawn: a run, a downspout, a chain, a Y, a corner choice, a point — whole
--                                inches on a local plan, north up; attributes; how sure (found / drawn / taped)
--   gutter_measurement_revisions an unchangeable snapshot (elements + engine parts + engine version) per «Make estimate»
-- Who: the office (owner, admin, office, sales) reads and writes all; a tech — his own, on his leads and on the
-- properties of his visits (like leads and properties); a subcontractor and another company — nothing.
-- Founder О2: writes only while the module is active (trial or paid) — app.module_active() in every write rule, on the server; reads stay, so old drafts open after the trial (read only).
-- No DELETE for the app: a measurement or an element is removed by deleted_at (undo 5 s, offline sync sees it).
-- A revision is never changed. row_version / created_by / updated_by: app.tg_service_fields (t10), as everywhere.
-- Conflict check by row_version (К9) is stage 4: one phone's queue does not know the newest version of its own rows.
-- New tables only (rule 16: nothing renamed or dropped). New tables are empty: plain indexes do not block anybody.

create table public.gutter_measurements (
  id          uuid primary key default public.uuid_generate_v7(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  -- where it was measured: a property, a lead, both or neither (a draft «measure here», К7 fallback)
  property_id uuid references public.properties (id) on delete set null,
  lead_id     uuid references public.leads (id) on delete set null,
  label       text check (label is null or (length(label) between 1 and 120 and label !~ '[[:cntrl:]]')),
  status      text not null default 'draft' check (status in ('draft', 'ready')),
  -- the newest revision number (0 = no estimate made yet)
  revision    integer not null default 0 check (revision >= 0),
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  deleted_at  timestamptz,
  row_version bigint not null default 1,
  -- elements and revisions point at (id, company_id): a child can never sit in another company than its measurement
  unique (id, company_id)
);

create table public.gutter_measurement_elements (
  id             uuid primary key default public.uuid_generate_v7(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  measurement_id uuid not null,
  kind           text not null check (kind in ('run', 'downspout', 'chain', 'wye', 'corner', 'point')),
  -- geometry, whole inches on the local plan: run {a:[x,y], b:[x,y]}, downspout {runId, atIn}, point {p:[x,y]}…
  geom           jsonb not null default '{}'::jsonb check (jsonb_typeof(geom) = 'object' and octet_length(geom::text) <= 2000),
  -- the engine's input for this element (profile, size, material, gauge, story, hanger, …): words of the module
  attrs          jsonb not null default '{}'::jsonb check (jsonb_typeof(attrs) = 'object' and octet_length(attrs::text) <= 8000),
  -- found automatically / drawn by hand / checked with a tape (spec П3: a label at every length)
  confidence     text not null default 'drawn' check (confidence in ('auto', 'drawn', 'taped')),
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  deleted_at     timestamptz,
  row_version    bigint not null default 1,
  foreign key (measurement_id, company_id) references public.gutter_measurements (id, company_id) on delete cascade
);

create table public.gutter_measurement_revisions (
  id             uuid primary key default public.uuid_generate_v7(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  measurement_id uuid not null,
  revision       integer not null check (revision >= 1),
  -- the elements as they were and what the engine counted from them (quantities, no prices)
  elements       jsonb not null check (jsonb_typeof(elements) = 'array'),
  parts          jsonb not null default '[]'::jsonb check (jsonb_typeof(parts) = 'array'),
  engine_version text not null check (length(engine_version) between 1 and 40 and engine_version !~ '[[:cntrl:]]'),
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  row_version    bigint not null default 1,
  check (octet_length(elements::text) + octet_length(parts::text) <= 1048576),
  unique (measurement_id, revision),
  foreign key (measurement_id, company_id) references public.gutter_measurements (id, company_id) on delete cascade
);

create index gutter_measurements_company_idx on public.gutter_measurements (company_id, updated_at desc);
create index gutter_measurements_lead_idx on public.gutter_measurements (lead_id) where lead_id is not null;
create index gutter_measurements_property_idx on public.gutter_measurements (property_id) where property_id is not null;
create index gutter_measurement_elements_measurement_idx on public.gutter_measurement_elements (measurement_id, company_id);
create index gutter_measurement_revisions_measurement_idx on public.gutter_measurement_revisions (measurement_id, company_id);
create index gutter_measurement_revisions_company_idx on public.gutter_measurement_revisions (company_id);
create index gutter_measurement_elements_company_idx on public.gutter_measurement_elements (company_id, updated_at desc);

-- service fields (t10) and «a row never moves to another company» (t11, T59)
select app.attach_standard_triggers('public.gutter_measurements');
select app.attach_standard_triggers('public.gutter_measurement_elements');
select app.attach_standard_triggers('public.gutter_measurement_revisions');

-- The property and the lead belong to the measurement's company, and a tech links only to his own. A trigger, not RLS:
-- a tech may not read every property of the company, yet may measure on a lead or a property he was given.
create or replace function app.tg_gutter_measurement_refs()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.property_id is not null and not exists (
       select 1 from public.properties p where p.id = new.property_id and p.company_id = new.company_id) then
    raise exception 'the property is not of this company' using errcode = '42501';
  end if;
  if new.lead_id is not null and not exists (
       select 1 from public.leads l where l.id = new.lead_id and l.company_id = new.company_id) then
    raise exception 'the lead is not of this company' using errcode = '42501';
  end if;
  -- a tech links only to a lead or a property he sees; checked when the link is set or changed, so a tech who sees
  -- the measurement through his lead still edits it although the property is not of his visits
  if auth.uid() is not null and not app.is_staff(new.company_id) then
    if new.lead_id is not null and new.lead_id is distinct from (case when tg_op = 'UPDATE' then old.lead_id end)
       and not app.can_see_lead(new.lead_id) then
      raise exception 'a tech links a measurement only to his own lead' using errcode = '42501';
    end if;
    if new.property_id is not null and new.property_id is distinct from (case when tg_op = 'UPDATE' then old.property_id end)
       and not app.is_property_assignee(new.property_id) then
      raise exception 'a tech links a measurement only to a property of his visits' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_gutter_measurement_refs() from public, anon, authenticated;
create trigger t05_refs_same_company before insert or update of property_id, lead_id, company_id on public.gutter_measurements
  for each row execute function app.tg_gutter_measurement_refs();

-- A revision is a snapshot: never changed (the app has no UPDATE; this also stops the server's own roles).
create or replace function app.tg_gutter_revision_frozen()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'a measurement revision never changes; make a new one' using errcode = '42501';
end;
$$;
revoke all on function app.tg_gutter_revision_frozen() from public, anon, authenticated;
create trigger t01_frozen before update on public.gutter_measurement_revisions
  for each row execute function app.tg_gutter_revision_frozen();

-- Who sees a measurement (П11, like leads and properties today): the office (owner, admin, office, sales) — all of the
-- company; a tech — what he made, on a lead he sees (assigned to him or made by him) or on a property of his visits.
-- A subcontractor — nothing.
create or replace function app.gutter_sees(p_company_id uuid, p_created_by uuid, p_lead_id uuid, p_property_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_staff(p_company_id)
      or (app.has_role(p_company_id, array['tech'])
          and (p_created_by = auth.uid()
               or (p_lead_id is not null and app.can_see_lead(p_lead_id))
               or (p_property_id is not null and app.is_property_assignee(p_property_id))));
$$;
-- Elements and revisions follow their measurement.
create or replace function app.gutter_sees_measurement(p_measurement_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.gutter_measurements m
     where m.id = p_measurement_id
       and app.gutter_sees(m.company_id, m.created_by, m.lead_id, m.property_id)
  );
$$;
-- rule 18: used by the RLS rules below (they run as the signed-in user); never by anon
revoke all on function app.gutter_sees(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function app.gutter_sees_measurement(uuid) from public, anon, authenticated;
grant execute on function app.gutter_sees(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function app.gutter_sees_measurement(uuid) to authenticated;

alter table public.gutter_measurements enable row level security;
alter table public.gutter_measurements force row level security;
alter table public.gutter_measurement_elements enable row level security;
alter table public.gutter_measurement_elements force row level security;
alter table public.gutter_measurement_revisions enable row level security;
alter table public.gutter_measurement_revisions force row level security;

revoke all on public.gutter_measurements, public.gutter_measurement_elements, public.gutter_measurement_revisions from anon, authenticated;
grant select, insert, update on public.gutter_measurements, public.gutter_measurement_elements to authenticated;
grant select, insert on public.gutter_measurement_revisions to authenticated;

-- WITH CHECK sees the row after the BEFORE triggers: created_by is already the caller on insert (t10)
create policy gutter_measurements_select on public.gutter_measurements for select to authenticated
  using (app.gutter_sees(company_id, created_by, lead_id, property_id));
create policy gutter_measurements_insert on public.gutter_measurements for insert to authenticated
  with check (app.gutter_sees(company_id, created_by, lead_id, property_id)
              and app.module_active(company_id, 'gutters'));
create policy gutter_measurements_update on public.gutter_measurements for update to authenticated
  using (app.gutter_sees(company_id, created_by, lead_id, property_id))
  with check (app.gutter_sees(company_id, created_by, lead_id, property_id)
              and app.module_active(company_id, 'gutters'));

create policy gutter_measurement_elements_select on public.gutter_measurement_elements for select to authenticated
  using (app.gutter_sees_measurement(measurement_id));
create policy gutter_measurement_elements_insert on public.gutter_measurement_elements for insert to authenticated
  with check (app.gutter_sees_measurement(measurement_id) and app.module_active(company_id, 'gutters'));
create policy gutter_measurement_elements_update on public.gutter_measurement_elements for update to authenticated
  using (app.gutter_sees_measurement(measurement_id))
  with check (app.gutter_sees_measurement(measurement_id) and app.module_active(company_id, 'gutters'));

create policy gutter_measurement_revisions_select on public.gutter_measurement_revisions for select to authenticated
  using (app.gutter_sees_measurement(measurement_id));
create policy gutter_measurement_revisions_insert on public.gutter_measurement_revisions for insert to authenticated
  with check (app.gutter_sees_measurement(measurement_id) and app.module_active(company_id, 'gutters'));
