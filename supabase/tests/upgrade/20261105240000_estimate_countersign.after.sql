-- E2a turned the right to sign on for every employee (never for a subcontractor) and gave old sent links a
-- "valid until" from today (company's days, 7 by default); a draft stays without one.
do $$
declare v_today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  if not (select can_sign_contracts from public.memberships where user_id = 'cf510000-0000-0000-0000-000000000001') then
    raise exception 'upgrade: an employee must get the right to sign';
  end if;
  if (select can_sign_contracts from public.memberships where user_id = 'cf510000-0000-0000-0000-000000000002') then
    raise exception 'upgrade: a subcontractor must not have the right to sign';
  end if;
  if (select expires_at from public.estimates where id = 'cf540000-0000-0000-0000-000000000001') is distinct from v_today + 7 then
    raise exception 'upgrade: an old sent estimate gets valid until = today + 7, got %', (select expires_at from public.estimates where id = 'cf540000-0000-0000-0000-000000000001');
  end if;
  if (select expires_at from public.estimates where id = 'cf540000-0000-0000-0000-000000000002') is not null then
    raise exception 'upgrade: a draft gets no valid until';
  end if;
  if exists (select 1 from public.revoked_link_tokens) then
    raise exception 'upgrade: no revoked tokens yet';
  end if;
end $$;
-- clean up the two test people (later tests count users)
delete from public.memberships where company_id = 'cf500000-0000-0000-0000-000000000000' and user_id in ('cf510000-0000-0000-0000-000000000001', 'cf510000-0000-0000-0000-000000000002');
delete from auth.users where id in ('cf510000-0000-0000-0000-000000000001', 'cf510000-0000-0000-0000-000000000002');
\echo 'upgrade 20261105240000_estimate_countersign ok'
