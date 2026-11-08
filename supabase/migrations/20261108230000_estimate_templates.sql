-- E3a (docs/specs/07-estimates.md §3.5, §8, §11): estimate templates of a company.
--   estimate_templates             a saved estimate without client, property or lead: options, lines, add-ons,
--                                  discount, tax (rate as in the estimate, director 08.11), deposit, note
--   estimate_template_line_costs   our cost per unit of a template line; read and written only by can_view_costs
--                                  (§11 №1: a doc jsonb cannot be hidden from the tech, who uses templates)
-- Who (§8): every member of the company (tech too) reads templates to make an estimate from one; owner/admin/office
-- make, change and archive them. used_count / last_used_at are the server's (the tech using one cannot write it):
-- a trigger on the first version of an estimate made from a template (source = 'template').
-- New tables, nothing renamed or dropped (rule 16): old app versions never read them. No DELETE: archived_at
-- (undo 5 s, offline queue), deleted_at.

-- ---- the template document -------------------------------------------------------------------------------------------
-- The shape the app sends (EstimateDoc, engine CustomOption / CustomLine / CustomSettings). Money is whole cents
-- (rule 8): a line price or cost that is not an integer in range is refused, never rounded here. Settings are checked
-- the way the engine reads them; unknown keys of a line are refused (a module's own data does not ride along — §11 №6).
create or replace function app.tpl_cents(p jsonb, p_max numeric)
returns boolean language sql immutable set search_path = '' as $$
  -- a number only here: the cast never sees a string (OR does not promise an order)
  select case when jsonb_typeof(p) <> 'number' then false
              else (p #>> '{}')::numeric = trunc((p #>> '{}')::numeric) and (p #>> '{}')::numeric between 0 and p_max end
$$;
revoke all on function app.tpl_cents(jsonb, numeric) from public, anon, authenticated;
grant execute on function app.tpl_cents(jsonb, numeric) to authenticated, service_role;

create or replace function app.valid_estimate_template_doc(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
     and octet_length(p::text) <= 262144
     and not exists (select 1 from jsonb_object_keys(p) k where k not in ('options', 'settings', 'note'))
     and (not p ? 'note' or jsonb_typeof(p -> 'note') = 'null'
          or (jsonb_typeof(p -> 'note') = 'string' and length(p ->> 'note') <= 5000))
     -- options: 1..10, unique ids, each with 0..200 lines
     and jsonb_typeof(p -> 'options') = 'array'
     and jsonb_array_length(p -> 'options') between 1 and 10
     and (select count(distinct o ->> 'id') from jsonb_array_elements(p -> 'options') o) = jsonb_array_length(p -> 'options')
     and not exists (
       select 1 from jsonb_array_elements(p -> 'options') o
       where jsonb_typeof(o) <> 'object'
          or exists (select 1 from jsonb_object_keys(o) k where k not in ('id', 'name', 'recommended', 'lines'))
          or jsonb_typeof(o -> 'id') is distinct from 'string' or (o ->> 'id') !~ '^[A-Za-z0-9_-]{1,64}$'
          or jsonb_typeof(o -> 'name') is distinct from 'string' or length(o ->> 'name') > 120 or (o ->> 'name') ~ '[[:cntrl:]]'
          or (o ? 'recommended' and jsonb_typeof(o -> 'recommended') not in ('boolean', 'null'))
          or jsonb_typeof(o -> 'lines') is distinct from 'array' or jsonb_array_length(o -> 'lines') > 200)
     -- lines: unique ids in the whole document (an estimate made from it keeps one id per line)
     and (select count(distinct l ->> 'id') = count(*) from jsonb_array_elements(p -> 'options') o, jsonb_array_elements(o -> 'lines') l)
     and not exists (
       select 1 from jsonb_array_elements(p -> 'options') o, jsonb_array_elements(o -> 'lines') l
       where jsonb_typeof(l) <> 'object'
          or exists (select 1 from jsonb_object_keys(l) k
                     where k not in ('id', 'name', 'description', 'group', 'quantity', 'unit', 'unitPriceCents',
                                     'unitCostCents', 'catalogItemId', 'optional', 'selected'))
          or jsonb_typeof(l -> 'id') is distinct from 'string' or (l ->> 'id') !~ '^[A-Za-z0-9_-]{1,64}$'
          or jsonb_typeof(l -> 'name') is distinct from 'string' or length(l ->> 'name') > 300 or (l ->> 'name') ~ '[[:cntrl:]]'
          or (l ? 'description' and not (jsonb_typeof(l -> 'description') = 'null'
                                          or (jsonb_typeof(l -> 'description') = 'string' and length(l ->> 'description') <= 2000)))
          or (l ->> 'group') is distinct from 'service' and (l ->> 'group') is distinct from 'labor' and (l ->> 'group') is distinct from 'material'
          -- quantity: the engine's decimal, as a string or a number
          or not (jsonb_typeof(l -> 'quantity') in ('string', 'number') and (l ->> 'quantity') ~ '^[0-9]{1,9}([.][0-9]{1,6})?$')
          or jsonb_typeof(l -> 'unit') is distinct from 'string' or length(l ->> 'unit') > 20 or (l ->> 'unit') ~ '[[:cntrl:]]'
          or not app.tpl_cents(l -> 'unitPriceCents', 100000000000)
          or (l ? 'unitCostCents' and jsonb_typeof(l -> 'unitCostCents') <> 'null' and not app.tpl_cents(l -> 'unitCostCents', 100000000000))
          or (l ? 'catalogItemId' and not (jsonb_typeof(l -> 'catalogItemId') = 'null'
                                            or (jsonb_typeof(l -> 'catalogItemId') = 'string' and (l ->> 'catalogItemId') ~ '^[A-Za-z0-9_-]{1,64}$')))
          or (l ? 'optional' and jsonb_typeof(l -> 'optional') not in ('boolean', 'null'))
          or (l ? 'selected' and jsonb_typeof(l -> 'selected') not in ('boolean', 'null')))
     -- settings: discount, tax, deposit as the engine reads them
     and jsonb_typeof(p -> 'settings') = 'object'
     and not exists (select 1 from jsonb_object_keys(p -> 'settings') k where k not in ('discount', 'tax', 'deposit', 'caHic'))
     and (jsonb_typeof(p #> '{settings,discount}') in ('null')
          or not (p -> 'settings') ? 'discount'
          or ((p #>> '{settings,discount,kind}') = 'fixed' and app.tpl_cents(p #> '{settings,discount,cents}', 100000000000))
          or ((p #>> '{settings,discount,kind}') = 'pct'
              and jsonb_typeof(p #> '{settings,discount,value}') in ('string', 'number')
              and (p #>> '{settings,discount,value}') ~ '^[0-9]{1,3}([.][0-9]{1,6})?$'))
     and jsonb_typeof(p #> '{settings,tax}') = 'object'
     and jsonb_typeof(p #> '{settings,tax,enabled}') = 'boolean'
     and app.tpl_cents(p #> '{settings,tax,rateBps}', 10000)
     and jsonb_typeof(p #> '{settings,tax,groups}') = 'object'
     and jsonb_typeof(p #> '{settings,deposit}') = 'object'
     and case p #>> '{settings,deposit,kind}'
           when 'none' then true
           when 'pct' then app.tpl_cents(p #> '{settings,deposit,bps}', 10000)
           when 'fixed' then app.tpl_cents(p #> '{settings,deposit,cents}', 100000000000)
           else false end
     and (not (p -> 'settings') ? 'caHic' or jsonb_typeof(p #> '{settings,caHic}') in ('boolean', 'null'))
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
  used_count        integer not null default 0 check (used_count >= 0),
  last_used_at      timestamptz,
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
-- As catalog_items (20261108130000): BEFORE UPDATE the row is there — the side table becomes exactly the costs the
-- document carries (a line without unitCostCents has none; a removed line loses its cost) and the row keeps the
-- document without them. AFTER INSERT (only a row really inserted, not ON CONFLICT DO NOTHING — that must not touch
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
    delete from public.estimate_template_line_costs where template_id = old.id;
    insert into public.estimate_template_line_costs (template_id, line_id, company_id, unit_cost_cents)
    select old.id, l ->> 'id', new.company_id, (l ->> 'unitCostCents')::bigint
      from jsonb_array_elements(new.doc -> 'options') o, jsonb_array_elements(o -> 'lines') l
     where jsonb_typeof(l -> 'unitCostCents') = 'number'
    on conflict (template_id, line_id) do nothing;
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

-- ---- used_count: the first version of an estimate made from a template ------------------------------------------------
-- A later version of the same estimate (an edit after sending) is not a new use. A template id of another company or
-- one that is not there counts nothing (it opens nothing either: the version only keeps the id, §11 №8).
create or replace function app.tg_template_used()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source = 'template' and new.template_id is not null
     and not exists (select 1 from public.estimate_versions v
                     where v.estimate_id = new.estimate_id and v.id <> new.id) then
    update public.estimate_templates set used_count = used_count + 1, last_used_at = now()
     where company_id = new.company_id and id = new.template_id;
  end if;
  return null;
end;
$$;
revoke all on function app.tg_template_used() from public, anon, authenticated;
create trigger t96_template_used after insert on public.estimate_versions
  for each row execute function app.tg_template_used();

-- used_count / last_used_at / module_key are not the phone's to change after insert (no grant below)
-- ---- access ---------------------------------------------------------------------------------------------------------
alter table public.estimate_templates enable row level security;
alter table public.estimate_templates force row level security;
alter table public.estimate_template_line_costs enable row level security;
alter table public.estimate_template_line_costs force row level security;

revoke all on public.estimate_templates, public.estimate_template_line_costs from anon, authenticated;
grant select on public.estimate_templates to authenticated;
grant insert (id, company_id, name, doc, module_key, archived_at, deleted_at, created_at_device, origin_device_id)
  on public.estimate_templates to authenticated;
grant update (name, doc, archived_at, deleted_at) on public.estimate_templates to authenticated;
grant select on public.estimate_template_line_costs to authenticated;

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
