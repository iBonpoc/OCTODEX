-- E3a (docs/specs/07-estimates.md §3.5, §8, §11): estimate templates of a company.
--   estimate_templates             a saved estimate without client, property or lead: options, lines, add-ons,
--                                  discount, tax (rate as in the estimate, director 08.11), deposit, note
--   estimate_template_line_costs   our cost per unit of a template line; read and written only by can_view_costs
--                                  (§11 №1: a doc jsonb cannot be hidden from the tech, who uses templates)
-- Who (§8): every member of the company (tech too) reads templates to make an estimate from one; owner/admin/office
-- make, change and archive them. Uses (estimate_template_uses) are the server's: a trigger on version 1 of an estimate
-- made from a template (source = 'template').
-- New tables, nothing renamed or dropped (rule 16): old app versions never read them. No DELETE: archived_at
-- (undo 5 s, offline queue), deleted_at.

-- ---- the template document -------------------------------------------------------------------------------------------
-- The shape the app sends (EstimateDoc, engine CustomOption / CustomLine / CustomSettings, features/estimateDoc.ts
-- newDoc). Money is whole cents (rule 8): a price or cost that is not an integer in range is refused, never rounded
-- here. A missing required key is a refusal, never NULL (a NULL check passes — review E3a). Step by step in plpgsql:
-- the order is promised, so no function ever sees a value of the wrong type (no raw «cannot extract elements»).
-- Unknown keys of a line are refused (a module's own data, `source`, does not ride along — §11 №6).
create or replace function app.tpl_cents(p jsonb, p_max numeric)
returns boolean language sql immutable set search_path = '' as $$
  -- integer digits only: 100.0 or 1e2 would break the bigint cast of the cost
  select coalesce(jsonb_typeof(p) = 'number' and (p #>> '{}') ~ '^[0-9]{1,12}$' and (p #>> '{}')::numeric <= p_max, false)
$$;
revoke all on function app.tpl_cents(jsonb, numeric) from public, anon, authenticated;
grant execute on function app.tpl_cents(jsonb, numeric) to authenticated, service_role;

create or replace function app.tpl_text(p jsonb, p_max int, p_optional boolean)
returns boolean language sql immutable set search_path = '' as $$
  select case when p is null or jsonb_typeof(p) = 'null' then p_optional
              when jsonb_typeof(p) <> 'string' then false
              else length(p #>> '{}') <= p_max and (p #>> '{}') !~ '[[:cntrl:]]' end
$$;
revoke all on function app.tpl_text(jsonb, int, boolean) from public, anon, authenticated;
grant execute on function app.tpl_text(jsonb, int, boolean) to authenticated, service_role;

create or replace function app.valid_estimate_template_doc(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  o jsonb; l jsonb; s jsonb; d jsonb; t jsonb; dep jsonb;
  opt_ids text[] := '{}'; line_ids text[] := '{}';
begin
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 262144 then return false; end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in ('options', 'settings', 'note')) then return false; end if;
  if p ? 'note' and jsonb_typeof(p -> 'note') <> 'null'
     and not (jsonb_typeof(p -> 'note') = 'string' and length(p ->> 'note') <= 5000) then return false; end if;
  -- options: 1..10, unique ids, each with 0..200 lines
  if jsonb_typeof(p -> 'options') is distinct from 'array' or jsonb_array_length(p -> 'options') not between 1 and 10 then return false; end if;
  for o in select x from jsonb_array_elements(p -> 'options') x loop
    if jsonb_typeof(o) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(o) k where k not in ('id', 'name', 'recommended', 'lines')) then return false; end if;
    if jsonb_typeof(o -> 'id') is distinct from 'string' or (o ->> 'id') !~ '^[A-Za-z0-9_-]{1,64}$' or (o ->> 'id') = any (opt_ids) then return false; end if;
    opt_ids := opt_ids || (o ->> 'id');
    if not app.tpl_text(o -> 'name', 120, false) then return false; end if;
    if o ? 'recommended' and coalesce(jsonb_typeof(o -> 'recommended') not in ('boolean', 'null'), true) then return false; end if;
    if jsonb_typeof(o -> 'lines') is distinct from 'array' or jsonb_array_length(o -> 'lines') > 200 then return false; end if;
    for l in select x from jsonb_array_elements(o -> 'lines') x loop
      if jsonb_typeof(l) <> 'object' then return false; end if;
      if exists (select 1 from jsonb_object_keys(l) k
                 where k not in ('id', 'name', 'description', 'group', 'quantity', 'unit', 'unitPriceCents',
                                 'unitCostCents', 'catalogItemId', 'optional', 'selected')) then return false; end if;
      -- line ids are unique in the whole document (an estimate made from it keeps one id per line)
      if jsonb_typeof(l -> 'id') is distinct from 'string' or (l ->> 'id') !~ '^[A-Za-z0-9_-]{1,64}$' or (l ->> 'id') = any (line_ids) then return false; end if;
      line_ids := line_ids || (l ->> 'id');
      if not app.tpl_text(l -> 'name', 300, false) or not app.tpl_text(l -> 'unit', 20, false) then return false; end if;
      if l ? 'description' and jsonb_typeof(l -> 'description') <> 'null'
         and not (jsonb_typeof(l -> 'description') = 'string' and length(l ->> 'description') <= 2000) then return false; end if;
      if coalesce((l ->> 'group') not in ('service', 'labor', 'material'), true) then return false; end if;
      -- quantity: the engine's decimal (parseQty), a string or a number, never empty
      if coalesce(jsonb_typeof(l -> 'quantity') not in ('string', 'number'), true)
         or (l ->> 'quantity') !~ '^([0-9]{1,12}([.][0-9]{1,12})?|[.][0-9]{1,12})$' then return false; end if;
      if not app.tpl_cents(l -> 'unitPriceCents', 100000000000) then return false; end if;
      if l ? 'unitCostCents' and jsonb_typeof(l -> 'unitCostCents') <> 'null' and not app.tpl_cents(l -> 'unitCostCents', 100000000000) then return false; end if;
      if l ? 'catalogItemId' and jsonb_typeof(l -> 'catalogItemId') <> 'null'
         and not (jsonb_typeof(l -> 'catalogItemId') = 'string' and (l ->> 'catalogItemId') ~ '^[A-Za-z0-9_-]{1,64}$') then return false; end if;
      if l ? 'optional' and jsonb_typeof(l -> 'optional') not in ('boolean', 'null') then return false; end if;
      if l ? 'selected' and jsonb_typeof(l -> 'selected') not in ('boolean', 'null') then return false; end if;
    end loop;
  end loop;
  -- settings: discount, tax, deposit as the engine reads them
  s := p -> 'settings';
  if jsonb_typeof(s) is distinct from 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(s) k where k not in ('discount', 'tax', 'deposit', 'caHic')) then return false; end if;
  d := s -> 'discount';
  if d is not null and jsonb_typeof(d) <> 'null' then
    if jsonb_typeof(d) <> 'object' then return false; end if;
    if d ->> 'kind' = 'fixed' then
      if not app.tpl_cents(d -> 'cents', 100000000000) then return false; end if;
    elsif d ->> 'kind' = 'pct' then
      -- a share of the subtotal (the engine multiplies by it): 0..1, «5%» is "0.05"
      if coalesce(jsonb_typeof(d -> 'value') not in ('string', 'number'), true)
         or (d ->> 'value') !~ '^(0([.][0-9]{1,6})?|1([.]0{1,6})?|[.][0-9]{1,6})$' then return false; end if;
    else return false; end if;
  end if;
  t := s -> 'tax';
  if jsonb_typeof(t) is distinct from 'object' or jsonb_typeof(t -> 'enabled') is distinct from 'boolean'
     or not app.tpl_cents(t -> 'rateBps', 10000) or jsonb_typeof(t -> 'groups') is distinct from 'object' then return false; end if;
  if exists (select 1 from jsonb_each(t -> 'groups') g
             where g.key not in ('service', 'labor', 'material') or jsonb_typeof(g.value) <> 'boolean') then return false; end if;
  dep := s -> 'deposit';
  if jsonb_typeof(dep) is distinct from 'object' then return false; end if;
  if dep ->> 'kind' = 'pct' then
    if not app.tpl_cents(dep -> 'bps', 10000) then return false; end if;
  elsif dep ->> 'kind' = 'fixed' then
    if not app.tpl_cents(dep -> 'cents', 100000000000) then return false; end if;
  elsif dep ->> 'kind' is distinct from 'none' then return false; end if;
  if s ? 'caHic' and jsonb_typeof(s -> 'caHic') not in ('boolean', 'null') then return false; end if;
  return true;
end;
$$;
revoke all on function app.valid_estimate_template_doc(jsonb) from public, anon, authenticated;
-- the check runs as the office member who saves the template and for server code: a pure validator
grant execute on function app.valid_estimate_template_doc(jsonb) to authenticated, service_role;

create table public.estimate_templates (
  id                uuid primary key default public.uuid_generate_v7(),
  company_id        uuid not null references public.companies (id) on delete cascade,
  name              text not null check (length(name) between 1 and 120 and name !~ '[[:cntrl:]]'),
  -- never holds our cost once written: the triggers below move it to estimate_template_line_costs
  doc               jsonb not null check (app.valid_estimate_template_doc(doc)),
  -- a starter template of a module (the module's key); null = the company's own (§11 №9)
  module_key        text check (module_key ~ '^[a-z][a-z0-9_]{1,30}$'),
  archived_at       timestamptz,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id)
);
create index estimate_templates_company_idx on public.estimate_templates (company_id, updated_at desc);  -- a new table
select app.attach_standard_triggers('public.estimate_templates');

create table public.estimate_template_line_costs (
  template_id       uuid not null,
  line_id           text not null check (line_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  company_id        uuid not null references public.companies (id),
  unit_cost_cents   bigint not null check (unit_cost_cents between 0 and 100000000000),
  updated_at        timestamptz not null default now(),
  primary key (template_id, line_id),
  foreign key (company_id, template_id) references public.estimate_templates (company_id, id) on delete cascade
);
create index estimate_template_line_costs_company_idx on public.estimate_template_line_costs (company_id, template_id);  -- the FK; a new table
create trigger t11_company_id_immutable before update on public.estimate_template_line_costs
  for each row execute function app.tg_company_id_immutable();

-- ---- the cost a phone writes goes to the side table -------------------------------------------------------------------
-- As catalog_items (20261108130000): BEFORE UPDATE the row is there — a line that carries unitCostCents sets its cost,
-- an explicit null clears it, a line without the key keeps what it had (the server hands the doc out without costs: an
-- office phone that has not merged them back must not wipe them — review E3a), a removed line loses its cost. The row
-- keeps the document without them. AFTER INSERT (only a row really inserted, not ON CONFLICT DO NOTHING — that must not touch
-- another row's costs) touches the row once, so the BEFORE UPDATE moves them. A rename or an archive (the same doc,
-- no costs in it) keeps the costs. Writers are owner/admin/office — all see costs (app.can_view_costs); anyone else
-- only gets them blanked. A migration (no JWT) moves what is stored. The validator runs first: no cast of a bad value.
create or replace function app.tg_template_costs_move()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  bare jsonb;
begin
  if not app.valid_estimate_template_doc(new.doc) then
    raise exception 'estimate template document is not valid' using errcode = '23514';
  end if;
  bare := app.doc_without_costs(new.doc);
  if new.doc is not distinct from old.doc and bare is not distinct from new.doc then return new; end if;
  if auth.uid() is null or app.can_view_costs(new.company_id) then
    delete from public.estimate_template_line_costs k
     where k.template_id = old.id
       and not exists (select 1 from jsonb_array_elements(new.doc -> 'options') o, jsonb_array_elements(o -> 'lines') l
                        where l ->> 'id' = k.line_id
                          and (not l ? 'unitCostCents' or jsonb_typeof(l -> 'unitCostCents') = 'number'));
    -- the validator let only integer digits through (tpl_cents): the cast cannot fail
    insert into public.estimate_template_line_costs as k (template_id, line_id, company_id, unit_cost_cents)
    select old.id, l ->> 'id', new.company_id, (l ->> 'unitCostCents')::bigint
      from jsonb_array_elements(new.doc -> 'options') o, jsonb_array_elements(o -> 'lines') l
     where jsonb_typeof(l -> 'unitCostCents') = 'number'
    on conflict (template_id, line_id) do update set unit_cost_cents = excluded.unit_cost_cents, updated_at = now();
  end if;
  new.doc := bare;
  return new;
end;
$$;
create or replace function app.tg_template_costs_inserted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app.doc_without_costs(new.doc) is distinct from new.doc then
    update public.estimate_templates set doc = doc where id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function app.tg_template_costs_move(), app.tg_template_costs_inserted() from public, anon, authenticated;
create trigger t30_costs_move before update on public.estimate_templates
  for each row execute function app.tg_template_costs_move();
create trigger t95_costs_inserted after insert on public.estimate_templates
  for each row execute function app.tg_template_costs_inserted();

-- ---- uses: one row per estimate made from a template ----------------------------------------------------------------
-- Not a counter on the template (review E3a): a use never touches the template row (no updated_by = the tech, no
-- row_version bump against an office edit made offline), two versions saved at once count one estimate once (the key),
-- a replay counts nothing. The app reads the count and the latest use. The phone saves a version with an insert and
-- then an update of source / template_id (ops.ts saveEstimate), so both are watched; only version 1 is the estimate's
-- start (a later version — an edit after sending — is not a new use). A template of another company, one that is not
-- there or is deleted counts nothing; an archived one does (it was used).
create table public.estimate_template_uses (
  template_id   uuid not null,
  estimate_id   uuid not null,
  company_id    uuid not null references public.companies (id),
  used_at       timestamptz not null default now(),
  primary key (template_id, estimate_id),
  foreign key (company_id, template_id) references public.estimate_templates (company_id, id) on delete cascade,
  foreign key (company_id, estimate_id) references public.estimates (company_id, id) on delete cascade
);
create index estimate_template_uses_company_idx on public.estimate_template_uses (company_id, template_id);  -- the FK; a new table
create index estimate_template_uses_estimate_idx on public.estimate_template_uses (company_id, estimate_id);  -- the FK; a new table
create trigger t11_company_id_immutable before update on public.estimate_template_uses
  for each row execute function app.tg_company_id_immutable();

create or replace function app.tg_template_used()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source = 'template' and new.template_id is not null and new.version_no = 1
     and (tg_op = 'INSERT' or old.source is distinct from new.source or old.template_id is distinct from new.template_id)
     and exists (select 1 from public.estimate_templates t
                 where t.company_id = new.company_id and t.id = new.template_id and t.deleted_at is null) then
    insert into public.estimate_template_uses (template_id, estimate_id, company_id)
    values (new.template_id, new.estimate_id, new.company_id)
    on conflict (template_id, estimate_id) do nothing;
  end if;
  return null;
end;
$$;
revoke all on function app.tg_template_used() from public, anon, authenticated;
create trigger t96_template_used after insert or update of source, template_id on public.estimate_versions
  for each row execute function app.tg_template_used();

-- module_key is not the phone's to change after insert (no grant below). Any office member may set it on insert: it is
-- only a label «from a module» (CH3b does the same for checklists, §11 №9)
-- ---- access ---------------------------------------------------------------------------------------------------------
alter table public.estimate_templates enable row level security;
alter table public.estimate_templates force row level security;
alter table public.estimate_template_line_costs enable row level security;
alter table public.estimate_template_line_costs force row level security;
alter table public.estimate_template_uses enable row level security;
alter table public.estimate_template_uses force row level security;

revoke all on public.estimate_templates, public.estimate_template_line_costs, public.estimate_template_uses from anon, authenticated;
grant select on public.estimate_templates to authenticated;
grant insert (id, company_id, name, doc, module_key, archived_at, deleted_at, created_at_device, origin_device_id)
  on public.estimate_templates to authenticated;
grant update (name, doc, archived_at, deleted_at) on public.estimate_templates to authenticated;
grant select on public.estimate_template_line_costs, public.estimate_template_uses to authenticated;

-- every member uses templates (a tech makes an estimate from one, §8)
create policy estimate_templates_select on public.estimate_templates for select to authenticated
  using (app.is_member(company_id));
create policy estimate_templates_insert on public.estimate_templates for insert to authenticated
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));
create policy estimate_templates_update on public.estimate_templates for update to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office']))
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));
-- only the trigger writes the costs
create policy estimate_template_line_costs_select on public.estimate_template_line_costs for select to authenticated
  using (app.can_view_costs(company_id));
-- every member sorts the templates by use (last used first); only the trigger writes
create policy estimate_template_uses_select on public.estimate_template_uses for select to authenticated
  using (app.is_member(company_id));
