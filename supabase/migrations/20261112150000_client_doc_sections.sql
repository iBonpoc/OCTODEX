-- РС-6 of the estimate editor (spec docs/audit/2026-11-12-estimate-editor-spec.md Р3, Р4, §4.2 п.1): what the client
-- reads of an estimate (app.client_doc — the page /p/, the signed document) now carries the sections.
-- * An option's sections (app.client_sections): the first 40 places, then a broken entry (no string id) and a repeated id go
--   — the same order as the engine (countedSections) and the phone (normalizeDoc); only id, title (control characters →
--   spaces, at most 60 characters, trimmed, a blank one left out), kind (service / labor / material / module) and parentId
--   (only under a top section that counts) — a module's key stays the company's.
-- * A line passes its sectionId (a line whose section is not there is shown «без раздела» by the page).
-- * A line hidden from the client goes whole only at $0, as the engine counts it: a priced line marked hidden (an older
--   phone, a broken copy) is shown — the client's total holds it, the page and the total agree.
-- Rule 16: the same signature (create or replace), only what the client reads grows. Rule 18: revoked from everyone —
-- only the security-definer page functions call them, as their owner. Tests: supabase/tests/core_rls.sql T199.

create or replace function app.client_sections(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  with raw as (
    select e.value as v, e.ordinality as n
      from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality e
     where e.ordinality <= 40
  ), ok as (
    select v, n from raw where jsonb_typeof(v) = 'object' and jsonb_typeof(v -> 'id') = 'string'
  ), firsts as (
    select distinct on (v ->> 'id') v, n from ok order by v ->> 'id', n
  ), tops as (
    select v ->> 'id' as id from firsts where jsonb_typeof(v -> 'parentId') is distinct from 'string'
  )
  select coalesce(jsonb_agg(
           jsonb_build_object('id', f.v ->> 'id')
           || case when t.title is not null then jsonb_build_object('title', t.title) else '{}'::jsonb end
           || case when f.v ->> 'kind' in ('service', 'labor', 'material', 'module') and jsonb_typeof(f.v -> 'kind') = 'string'
                   then jsonb_build_object('kind', f.v ->> 'kind') else '{}'::jsonb end
           || case when jsonb_typeof(f.v -> 'parentId') = 'string' then jsonb_build_object('parentId', f.v ->> 'parentId') else '{}'::jsonb end
           order by f.n), '[]'::jsonb)
    from firsts f,
         lateral (select nullif(btrim(left(regexp_replace(case when jsonb_typeof(f.v -> 'title') = 'string' then f.v ->> 'title' else '' end,
                                                          '[\x01-\x1f\x7f]', ' ', 'g'), 60)), '') as title) t
   where jsonb_typeof(f.v -> 'parentId') is distinct from 'string' or (f.v ->> 'parentId') in (select id from tops);
$$;
revoke all on function app.client_sections(jsonb) from public, anon, authenticated;

create or replace function app.client_doc(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'object' then
    app.jsonb_scalars(p, array['note'])
    || jsonb_build_object('options', coalesce((
         select jsonb_agg(
                  app.jsonb_scalars(o.value, array['id', 'name', 'recommended'])
                  -- РС-6: the option's sections as the client reads them (app.client_sections)
                  || case when jsonb_typeof(o.value -> 'sections') = 'array' then jsonb_build_object('sections', app.client_sections(o.value -> 'sections')) else '{}'::jsonb end
                  || jsonb_build_object('lines', coalesce((
                       select jsonb_agg(app.jsonb_scalars(l.value,
                                array['id', 'name', 'description', 'group', 'quantity', 'unit', 'unitPriceCents', 'optional', 'selected', 'sectionId'])
                              order by l.ordinality)
                         from jsonb_array_elements(case when jsonb_typeof(o.value -> 'lines') = 'array' then o.value -> 'lines' else '[]'::jsonb end)
                              with ordinality l
                        where jsonb_typeof(l.value) = 'object'
                          -- a line hidden from the client goes whole (also «false» as a string or 0) — only at $0, as the
                          -- engine counts it (РС-6): a priced line marked hidden is a visible one (the client's total holds it)
                          and not (coalesce(lower(l.value ->> 'clientVisible'), 'true') in ('false', '0')
                                   and case when jsonb_typeof(l.value -> 'unitPriceCents') = 'number' then (l.value ->> 'unitPriceCents')::numeric = 0 else true end)
                          -- a line the page cannot draw goes whole too (the page would fail on it)
                          and jsonb_typeof(l.value -> 'name') = 'string'
                          and jsonb_typeof(l.value -> 'group') = 'string'
                          and jsonb_typeof(l.value -> 'quantity') in ('string', 'number')
                          and jsonb_typeof(l.value -> 'unitPriceCents') = 'number'
                          -- quantity 0: the part is left out (spec 33 П23.9)
                          and (l.value ->> 'quantity') !~ '^[[:space:]]*[+-]?(0+([.]0*)?|[.]0+)[[:space:]]*$'), '[]'::jsonb))
                  order by o.ordinality)
           from jsonb_array_elements(case when jsonb_typeof(p -> 'options') = 'array' then p -> 'options' else '[]'::jsonb end)
                with ordinality o
          where jsonb_typeof(o.value) = 'object'), '[]'::jsonb))
    || case when jsonb_typeof(p -> 'settings') = 'object' then jsonb_build_object('settings',
         app.jsonb_scalars(p -> 'settings', array['caHic'])
         || case when (p -> 'settings') ? 'discount' then jsonb_build_object('discount',
              app.jsonb_scalars(p -> 'settings' -> 'discount', array['kind', 'value', 'cents'])) else '{}'::jsonb end
         || case when jsonb_typeof(p -> 'settings' -> 'tax') = 'object' then jsonb_build_object('tax',
              app.jsonb_scalars(p -> 'settings' -> 'tax', array['enabled', 'rateBps'])
              || case when jsonb_typeof(p -> 'settings' -> 'tax' -> 'groups') = 'object' then jsonb_build_object('groups',
                   app.jsonb_scalars(p -> 'settings' -> 'tax' -> 'groups', array['service', 'labor', 'material'])) else '{}'::jsonb end)
            else '{}'::jsonb end
         || case when jsonb_typeof(p -> 'settings' -> 'deposit') = 'object' then jsonb_build_object('deposit',
              app.jsonb_scalars(p -> 'settings' -> 'deposit', array['kind', 'bps', 'cents'])) else '{}'::jsonb end)
       else '{}'::jsonb end
    -- spec 33 П24.7: the attached pages, only what the page may draw (app.doc_pages)
    || case when jsonb_typeof(p -> 'pages') = 'array' then jsonb_build_object('pages', app.doc_pages(p -> 'pages')) else '{}'::jsonb end
  end;
$$;
revoke all on function app.client_doc(jsonb) from public, anon, authenticated;
