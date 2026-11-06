-- After wave 7-2: «suspended» is «disabled», its time kept; the old status cannot be written any more.
do $$
begin
  if (select status from public.memberships where user_id = 'cf480000-0000-0000-0000-0000000000aa') <> 'disabled' then
    raise exception 'FAILED upgrade 20261106060000: a suspended member did not become disabled';
  end if;
  if (select suspended_at from public.memberships where user_id = 'cf480000-0000-0000-0000-0000000000aa') is null then
    raise exception 'FAILED upgrade 20261106060000: the time it was switched off is lost';
  end if;
  begin
    update public.memberships set status = 'suspended' where user_id = 'cf480000-0000-0000-0000-0000000000aa';
    raise exception 'FAILED upgrade 20261106060000: «suspended» is still accepted';
  exception when check_violation then null;
  end;
end $$;
-- clean up: the main tests count users
delete from public.memberships where user_id = 'cf480000-0000-0000-0000-0000000000aa';
delete from auth.users where id = 'cf480000-0000-0000-0000-0000000000aa';
