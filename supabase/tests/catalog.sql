-- The live catalog of schema public after the migrations (docs/specs/21 §5): what the app may call and read, as the
-- database itself has it — not as the migrations' text says. run.sh writes it to $CATALOG_OUT; the nightly cloud job
-- runs the same query against `supabase start` and compares the two (the auth stub must not lie about the rights).
-- One JSON document, sorted, so two dumps compare as text.
select json_build_object(
  'functions', coalesce((
    select json_agg(f order by f->>'name', f->>'args') from (
      select json_build_object(
        'name', p.proname,
        -- the input parameters in order (modes i / b / v; null proargmodes = all in)
        'params', coalesce((
          select json_agg(coalesce(nullif(a.n, ''), '$' || a.ord) order by a.ord)
          from unnest(coalesce(p.proargnames, array_fill(''::text, array[cardinality(coalesce(p.proallargtypes, p.proargtypes::oid[]))])),
                      coalesce(p.proargmodes, array_fill('i'::"char", array[cardinality(coalesce(p.proallargtypes, p.proargtypes::oid[]))])))
               with ordinality as a(n, m, ord)
          where a.m in ('i', 'b', 'v')), '[]'::json),
        'args', pg_get_function_identity_arguments(p.oid),
        'defaults', p.pronargdefaults,
        'definer', p.prosecdef,
        'public', exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where x.grantee = 0 and x.privilege_type = 'EXECUTE'),
        'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
        'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE')
      ) as f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') -- extension functions are not ours
    ) s), '[]'::json),
  -- select / insert / update: has_any_column_privilege — it also sees column grants (grant select (id, …) on invitations),
  -- which has_table_privilege does not; delete has no column form
  'tables', coalesce((
    select json_agg(t order by t->>'name') from (
      select json_build_object(
        'name', c.relname,
        'kind', case c.relkind when 'r' then 'table' when 'p' then 'table' when 'v' then 'view' else 'matview' end,
        'anon', json_build_array(
          has_any_column_privilege('anon', c.oid, 'SELECT'), has_any_column_privilege('anon', c.oid, 'INSERT'),
          has_any_column_privilege('anon', c.oid, 'UPDATE'), has_table_privilege('anon', c.oid, 'DELETE')),
        'authenticated', json_build_array(
          has_any_column_privilege('authenticated', c.oid, 'SELECT'), has_any_column_privilege('authenticated', c.oid, 'INSERT'),
          has_any_column_privilege('authenticated', c.oid, 'UPDATE'), has_table_privilege('authenticated', c.oid, 'DELETE')),
        'rls', c.relrowsecurity
      ) as t
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
    ) s), '[]'::json)
);
