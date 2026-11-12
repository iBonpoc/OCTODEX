-- #1232 (from PR #1231, РС-4b-2): an estimate template keeps the hidden $0 lines and the sections. The template check
-- (app.valid_estimate_template_doc) refused every key outside its list, so the phone left out clientVisible, sectionId
-- and the option's sections: a template made from an estimate lost «Скрыта» and its layout by sections.
-- * A line: clientVisible (a boolean; false only at $0 — the engine counts a priced line as visible), sectionId (a
--   non-empty id of at most 64 characters, the engine's sectionIdOk).
-- * An option: sections, already in the form the client reads (app.client_sections of them = them): one rule, shared
--   with the client page and the PDF (test/fixtures/clientSections.json); the phone sends them so (estimateTemplate.ts).
-- * The check runs as the member who saves the template (the table's check, the trigger): app.client_sections and
--   app.client_title — pure functions of their argument, they read nothing — are granted to authenticated (rule 18:
--   explicit grant for what the app's own writes call).
-- Rule 16: the same signature; a template without these keys is valid as before; older phones never send them.
-- Tests: supabase/tests/core_rls.sql T203, apps/mobile/test/estimateTemplate.test.ts.

grant execute on function app.client_sections(jsonb), app.client_title(text) to authenticated, service_role;

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
    if exists (select 1 from jsonb_object_keys(o) k where k not in ('id', 'name', 'recommended', 'lines', 'sections')) then return false; end if;
    -- #1232: the option's sections, already as the client reads them (app.client_sections: ≤ 40, an id once, a cleaned
    -- title, a known kind, a subsection only under a top section) — the phone sends them so (estimateTemplate.ts)
    if o ? 'sections' and jsonb_typeof(o -> 'sections') <> 'null'
       and (jsonb_typeof(o -> 'sections') <> 'array' or app.client_sections(o -> 'sections') is distinct from o -> 'sections') then return false; end if;
    if jsonb_typeof(o -> 'id') is distinct from 'string' or (o ->> 'id') !~ '^[A-Za-z0-9_-]{1,64}$' or (o ->> 'id') = any (opt_ids) then return false; end if;
    opt_ids := opt_ids || (o ->> 'id');
    if not app.tpl_text(o -> 'name', 120, false) then return false; end if;
    if o ? 'recommended' and coalesce(jsonb_typeof(o -> 'recommended') not in ('boolean', 'null'), true) then return false; end if;
    if jsonb_typeof(o -> 'lines') is distinct from 'array' or jsonb_array_length(o -> 'lines') > 200 then return false; end if;
    for l in select x from jsonb_array_elements(o -> 'lines') x loop
      if jsonb_typeof(l) <> 'object' then return false; end if;
      if exists (select 1 from jsonb_object_keys(l) k
                 where k not in ('id', 'name', 'description', 'group', 'quantity', 'unit', 'unitPriceCents',
                                 'unitCostCents', 'catalogItemId', 'optional', 'selected', 'clientVisible', 'sectionId')) then return false; end if;
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
      -- #1232: hidden from the client — only a $0 line (the engine counts a priced one as visible); its section — an id of
      -- at most 64 characters (the engine's sectionIdOk), or none
      if l ? 'clientVisible' and jsonb_typeof(l -> 'clientVisible') not in ('boolean', 'null') then return false; end if;
      if l -> 'clientVisible' = 'false'::jsonb and (l ->> 'unitPriceCents')::numeric <> 0 then return false; end if;
      if l ? 'sectionId' and jsonb_typeof(l -> 'sectionId') <> 'null'
         and not (jsonb_typeof(l -> 'sectionId') = 'string' and (l ->> 'sectionId') <> '' and length(l ->> 'sectionId') <= 64) then return false; end if;
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
     or not app.tpl_cents(t -> 'rateBps', 10000) or jsonb_typeof(t -> 'groups') is distinct from 'object'
     -- #1219: the rate in ppm, when the template has it: a whole number 0..1000000
     or (t ? 'ratePpm' and not app.tpl_cents(t -> 'ratePpm', 1000000)) then return false; end if;
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
