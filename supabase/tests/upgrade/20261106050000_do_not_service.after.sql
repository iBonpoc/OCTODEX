-- After wave 4b-1: the closed client's old link is revoked, the open client's link is untouched.
do $$
begin
  if (select public_token is not null or link_revoked_at is null from public.estimates where id = 'cf443000-0000-0000-0000-000000000001') then
    raise exception 'FAILED upgrade 20261106050000: the old link of a «do not service» client stayed open';
  end if;
  if (select public_token is distinct from 'tok_upg44_open_0123456789ab' from public.estimates where id = 'cf443000-0000-0000-0000-000000000002') then
    raise exception 'FAILED upgrade 20261106050000: the link of an ordinary client was touched';
  end if;
end $$;
