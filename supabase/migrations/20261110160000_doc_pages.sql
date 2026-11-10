-- spec 33 П24.7 (#705, S6g): «страницы-вложения» of an estimate — a module's page (a drawing of shapes, a table of words)
-- the client sees after the lines on /p/ and in the PDF. Kept in estimate_versions.calc_inputs -> 'pages' (so it is in
-- the signature's fingerprint: the client signs what he saw). No markup is kept: a page is flat objects of scalars, the
-- colours are names of print tokens (an SVG string on the anon page /p/ = a script from the contractor to his client;
-- security-check of stage 0, 10.11).
-- Two rules, the same in the app (apps/mobile/src/features/docPages.ts) and checked on the same examples
-- (apps/mobile/test/fixtures/docPages.json: unit docPages, db T165):
--   reading — app.doc_pages: the first 4 pages, a broken page drops, the first of an id wins; per page the first 3000
--     shapes, a shape of a wrong kind / type / range drops whole, keys not listed go; texts cut at 200 (a guard only:
--     writing refuses longer ones); tables: 12 columns, 200 rows, a non-text cell is empty;
--   writing — app.doc_pages_problem in the trigger t07_doc_pages: too many, too long, a duplicate id, > 512 KB → refused
--     (never cut: the client signs the whole calc_inputs). An old phone sends no pages: nothing to check (rule 16).
-- client_doc: same signature (rule 16 not touched), one more clause. The helpers are the server's (rule 18).

create or replace function app.doc_num(v jsonb, lo numeric, hi numeric)
returns boolean language sql immutable set search_path = '' as $$
  -- case, not «and»: the cast runs only on a number (SQL does not promise the order of «and»)
  select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric between lo and hi else false end;
$$;

-- one shape as the page may draw it, else null
create or replace function app.doc_prim(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p -> 't') is distinct from 'string' then null
    when p ->> 't' = 'l' then case
      when app.doc_num(p -> 'x1', -1e5, 1e5) and app.doc_num(p -> 'y1', -1e5, 1e5) and app.doc_num(p -> 'x2', -1e5, 1e5) and app.doc_num(p -> 'y2', -1e5, 1e5)
       and app.doc_num(p -> 'sw', 0.01, 100) and jsonb_typeof(p -> 'ink') = 'string' and p ->> 'ink' in ('ink', 'mut')
      then jsonb_build_object('t', 'l', 'x1', p -> 'x1', 'y1', p -> 'y1', 'x2', p -> 'x2', 'y2', p -> 'y2', 'sw', p -> 'sw', 'ink', p -> 'ink')
           || case when app.doc_num(p -> 'dash', 0.01, 1000) then jsonb_build_object('dash', p -> 'dash') else '{}'::jsonb end end
    when p ->> 't' in ('c', 'd') then case
      when app.doc_num(p -> 'cx', -1e5, 1e5) and app.doc_num(p -> 'cy', -1e5, 1e5) and app.doc_num(p -> 'r', 0.01, 1000) and app.doc_num(p -> 'sw', 0, 100)
       and jsonb_typeof(p -> 'fill') = 'string' and p ->> 'fill' in ('paper', 'ink')
      then jsonb_build_object('t', p -> 't', 'cx', p -> 'cx', 'cy', p -> 'cy', 'r', p -> 'r', 'sw', p -> 'sw', 'fill', p -> 'fill') end
    when p ->> 't' = 'r' then case
      when app.doc_num(p -> 'x', -1e5, 1e5) and app.doc_num(p -> 'y', -1e5, 1e5) and app.doc_num(p -> 'w', 0, 1e5) and app.doc_num(p -> 'h', 0, 1e5)
      then jsonb_build_object('t', 'r', 'x', p -> 'x', 'y', p -> 'y', 'w', p -> 'w', 'h', p -> 'h') end
    when p ->> 't' = 'x' then case
      when app.doc_num(p -> 'x', -1e5, 1e5) and app.doc_num(p -> 'y', -1e5, 1e5) and jsonb_typeof(p -> 's') = 'string' and app.doc_num(p -> 'fs', 1, 200)
      then jsonb_build_object('t', 'x', 'x', p -> 'x', 'y', p -> 'y', 's', left(p ->> 's', 200), 'fs', p -> 'fs')
           || case when jsonb_typeof(p -> 'anchor') = 'string' and p ->> 'anchor' in ('start', 'middle', 'end')
                   then jsonb_build_object('anchor', p -> 'anchor') else '{}'::jsonb end end
  end;
$$;

-- a table row: the first 12 cells, a cell that is not a text is empty
create or replace function app.doc_cells(a jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(case when jsonb_typeof(c.value) = 'string' then to_jsonb(left(c.value #>> '{}', 200)) else '""'::jsonb end order by c.ord), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(a) = 'array' then a else '[]'::jsonb end) with ordinality c(value, ord)
   where c.ord <= 12;
$$;

-- the pages as the client may see them
create or replace function app.doc_pages(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(x.page order by x.ord), '[]'::jsonb) from (
    select g.ord, row_number() over (partition by g.value ->> 'id' order by g.ord) as k,
      jsonb_build_object('id', g.value -> 'id', 'title', left(g.value ->> 'title', 200), 'w', g.value -> 'w', 'h', g.value -> 'h',
        'items', coalesce((select jsonb_agg(app.doc_prim(i.value) order by i.ord)
                             from jsonb_array_elements(case when jsonb_typeof(g.value -> 'items') = 'array' then g.value -> 'items' else '[]'::jsonb end)
                                  with ordinality i(value, ord)
                            where i.ord <= 3000 and app.doc_prim(i.value) is not null), '[]'::jsonb))
      || case when jsonb_typeof(g.value -> 'note') = 'string' then jsonb_build_object('note', left(g.value ->> 'note', 200)) else '{}'::jsonb end
      || case when jsonb_typeof(g.value -> 'head') = 'array' then jsonb_build_object('head', app.doc_cells(g.value -> 'head')) else '{}'::jsonb end
      || case when jsonb_typeof(g.value -> 'rows') = 'array' then jsonb_build_object('rows', coalesce((
           select jsonb_agg(app.doc_cells(r.value) order by r.ord)
             from jsonb_array_elements(g.value -> 'rows') with ordinality r(value, ord)
            where r.ord <= 200 and jsonb_typeof(r.value) = 'array'), '[]'::jsonb)) else '{}'::jsonb end as page
      from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality g(value, ord)
     where g.ord <= 4 and jsonb_typeof(g.value) = 'object'
       and jsonb_typeof(g.value -> 'id') = 'string' and length(g.value ->> 'id') between 1 and 64
       and jsonb_typeof(g.value -> 'title') = 'string'
       and app.doc_num(g.value -> 'w', 1, 1e5) and app.doc_num(g.value -> 'h', 1, 1e5)
  ) x where x.k = 1;
$$;

-- why writing these pages is refused, or null (the app: pagesProblem — its size limit is its own, narrower)
create or replace function app.doc_pages_problem(p jsonb)
returns text language sql immutable set search_path = '' as $$
  select case
    when p is null or jsonb_typeof(p) = 'null' then null
    when jsonb_typeof(p) <> 'array' then 'pages'
    when jsonb_array_length(p) > 4 then 'count'
    when exists (select 1 from jsonb_array_elements(p) g where
           case when jsonb_typeof(g) <> 'object' or jsonb_typeof(g -> 'items') is distinct from 'array' then true
                else jsonb_array_length(g -> 'items') > 3000
                  or (g ? 'head' and case when jsonb_typeof(g -> 'head') = 'array' then jsonb_array_length(g -> 'head') > 12 else true end)
                  or (g ? 'rows' and case when jsonb_typeof(g -> 'rows') = 'array'
                        then jsonb_array_length(g -> 'rows') > 200
                          or exists (select 1 from jsonb_array_elements(g -> 'rows') r
                                      where case when jsonb_typeof(r) = 'array' then jsonb_array_length(r) > 12 else true end)
                        else true end) end) then 'shape'
    when exists (select 1 from jsonb_path_query(p, 'strict $.**') v where jsonb_typeof(v) = 'string' and length(v #>> '{}') > 200) then 'long'
    when exists (select 1 from jsonb_array_elements(p) g where jsonb_typeof(g -> 'id') = 'string' and length(g ->> 'id') > 64) then 'long'
    when (select count(*) <> count(distinct g ->> 'id') from jsonb_array_elements(p) g where jsonb_typeof(g -> 'id') = 'string') then 'id'
    when octet_length(p::text) > 524288 then 'size'
  end;
$$;

revoke all on function app.doc_num(jsonb, numeric, numeric) from public, anon, authenticated;
revoke all on function app.doc_prim(jsonb) from public, anon, authenticated;
revoke all on function app.doc_cells(jsonb) from public, anon, authenticated;
revoke all on function app.doc_pages(jsonb) from public, anon, authenticated;
revoke all on function app.doc_pages_problem(jsonb) from public, anon, authenticated;

-- writing: refused, not cut. security definer — the helpers are nobody's to call (rule 18), the trigger calls them as owner.
create or replace function app.tg_doc_pages()
returns trigger language plpgsql security definer set search_path = '' as $$
declare why text;
begin
  if jsonb_typeof(new.calc_inputs) = 'object' and new.calc_inputs ? 'pages' then
    why := app.doc_pages_problem(new.calc_inputs -> 'pages');
    if why is not null then
      raise exception 'doc_pages: %', why using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_doc_pages() from public, anon, authenticated;
create trigger t07_doc_pages before insert or update of calc_inputs on public.estimate_versions
  for each row execute function app.tg_doc_pages();

revoke all on function app.client_doc(jsonb) from public, anon, authenticated;

create or replace function app.client_doc(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'object' then
    app.jsonb_scalars(p, array['note'])
    || jsonb_build_object('options', coalesce((
         select jsonb_agg(
                  app.jsonb_scalars(o.value, array['id', 'name', 'recommended'])
                  || jsonb_build_object('lines', coalesce((
                       select jsonb_agg(app.jsonb_scalars(l.value,
                                array['id', 'name', 'description', 'group', 'quantity', 'unit', 'unitPriceCents', 'optional', 'selected'])
                              order by l.ordinality)
                         from jsonb_array_elements(case when jsonb_typeof(o.value -> 'lines') = 'array' then o.value -> 'lines' else '[]'::jsonb end)
                              with ordinality l
                        where jsonb_typeof(l.value) = 'object'
                          -- hidden BOM lines go whole (also «false» as a string or 0)
                          and coalesce(lower(l.value ->> 'clientVisible'), 'true') not in ('false', '0')
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
-- rule 18: only the security definer page functions call it (as their owner)
revoke all on function app.client_doc(jsonb) from public, anon, authenticated;
