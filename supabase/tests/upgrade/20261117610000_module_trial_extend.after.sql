-- T441 (rule 15: the migration on a database with data).
-- After the trial extension: the switched-on unpaid module whose trial ran out has 30 days from today and is active again;
-- the switched-off, the paid and the long trial are as they were; no row_version moved.
do $$
declare r record;
begin
  select * into r from public.company_modules where company_id = 'c5400000-0000-4000-8000-0000000000e1';
  if not (r.trial_ends_at between now() + interval '29 days 23 hours' and now() + interval '30 days 1 minute') then
    raise exception 'FAILED T441 upgrade 20261117610000: the run-out trial is not 30 days on (%)', r.trial_ends_at;
  end if;
  if r.row_version <> 3 or r.paid_until is not null or not r.enabled then
    raise exception 'FAILED T441 upgrade 20261117610000: the extended row changed more than its trial end';
  end if;
  if not exists (select 1 from public.company_modules where company_id = 'c5400000-0000-4000-8000-0000000000e2' and not enabled
                  and trial_ends_at < now() - interval '6 days' and row_version = 2) then
    raise exception 'FAILED T441 upgrade 20261117610000: a switched-off module was touched';
  end if;
  if not exists (select 1 from public.company_modules where company_id = 'c5400000-0000-4000-8000-0000000000e3'
                  and trial_ends_at < now() - interval '6 days' and paid_until > now()) then
    raise exception 'FAILED T441 upgrade 20261117610000: a paid module was touched';
  end if;
  if not exists (select 1 from public.company_modules where company_id = 'c5400000-0000-4000-8000-0000000000e4'
                  and trial_ends_at > now() + interval '59 days') then
    raise exception 'FAILED T441 upgrade 20261117610000: a longer trial was shortened';
  end if;
  if (select count(*) from public.company_modules where company_id in ('c5400000-0000-4000-8000-0000000000e5', 'c5400000-0000-4000-8000-0000000000e6',
        'c5400000-0000-4000-8000-0000000000e7') and trial_ends_at between now() + interval '29 days 23 hours' and now() + interval '30 days 1 minute') <> 3 then
    raise exception 'FAILED T441 upgrade 20261117610000: a short, an empty or a run-out-payment trial is not 30 days on';
  end if;
  if not exists (select 1 from public.company_modules where company_id = 'c5400000-0000-4000-8000-0000000000e7' and paid_until < now()) then
    raise exception 'FAILED T441 upgrade 20261117610000: the run-out payment was touched';
  end if;
  if exists (select 1 from public.company_modules where company_id::text like 'c5400000-%' and updated_by is not null) then
    raise exception 'FAILED T441 upgrade 20261117610000: the extension is not the system''s (updated_by)';
  end if;
end $$;
-- the extended module is active again for a member (app.module_active itself is unchanged)
insert into auth.users (id, email, raw_user_meta_data) values ('c5400000-0000-4000-8000-0000000000aa', 'upgrade540@x.test', '{"full_name":"Upgrade Owner 540"}');
insert into public.memberships (company_id, user_id, role, status) values ('c5400000-0000-4000-8000-0000000000e1', 'c5400000-0000-4000-8000-0000000000aa', 'owner', 'active');
set request.jwt.claim.sub = 'c5400000-0000-4000-8000-0000000000aa';
set role authenticated;
do $$ begin
  if not app.module_active('c5400000-0000-4000-8000-0000000000e1', 'gutters') then
    raise exception 'FAILED T441 upgrade 20261117610000: the extended module is not active';
  end if;
end $$;
reset role;
reset request.jwt.claim.sub;
-- clean up: the main tests count users (the companies stay, as in the other upgrade checks)
delete from public.company_modules where company_id::text like 'c5400000-%';
delete from public.memberships where company_id::text like 'c5400000-%';
delete from auth.users where id = 'c5400000-0000-4000-8000-0000000000aa';
