-- After 7б-1: a new table only — existing people have no row (the app reads «no row» as the defaults).
do $$ begin
  if exists (select 1 from public.member_prefs) then
    raise exception 'upgrade: member_prefs must start empty';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'member_prefs' and policyname = 'member_prefs_select') then
    raise exception 'upgrade: member_prefs has no select policy';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.member_prefs'::regclass) then
    raise exception 'upgrade: member_prefs must force row level security';
  end if;
  if has_table_privilege('authenticated', 'public.member_prefs', 'insert') or has_table_privilege('authenticated', 'public.member_prefs', 'update')
     or has_table_privilege('anon', 'public.member_prefs', 'select') then
    raise exception 'upgrade: member_prefs writes only through set_my_prefs, anon reads nothing';
  end if;
end $$;
\echo 'upgrade 20261106090000_member_prefs ok'
