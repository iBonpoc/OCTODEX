-- After 7б-2: sharing without the notice goes off; the company flag starts off; points are insert-only under force RLS.
do $$ begin
  if (select share_location from public.memberships where company_id = 'cf560000-0000-0000-0000-000000000001') then
    raise exception 'upgrade: sharing switched on without the notice must go off';
  end if;
  if exists (select 1 from app.company_flags where location_sharing) then
    raise exception 'upgrade: the company location flag must start off everywhere';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.user_locations'::regclass) then
    raise exception 'upgrade: user_locations must force row level security';
  end if;
  if has_table_privilege('authenticated', 'public.user_locations', 'update') or has_table_privilege('authenticated', 'public.user_locations', 'delete')
     or has_table_privilege('anon', 'public.user_locations', 'select') then
    raise exception 'upgrade: user_locations is insert-only for a client, anon reads nothing';
  end if;
end $$;
-- clean up: the main tests count users
delete from public.memberships where user_id = 'cf560000-0000-0000-0000-0000000000aa';
delete from auth.users where id = 'cf560000-0000-0000-0000-0000000000aa';
\echo 'upgrade 20261106170000_location_consent ok'
