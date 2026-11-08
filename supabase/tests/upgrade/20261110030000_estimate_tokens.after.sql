-- After the move: no row carries a link; the office's link moved as it was; every link the (now former) tech could read —
-- open, signed, deleted — is revoked (the page says «no longer valid») and the estimate has a new one.
do $$
begin
  if exists (select 1 from public.estimates where public_token is not null) then
    raise exception 'UPGRADE 147: a row still carries a link';
  end if;
  if app.estimate_of_token('tok_upg147_office_0123456789') is distinct from 'cf147300-0000-0000-0000-000000000001'::uuid then
    raise exception 'UPGRADE 147: the office''s link did not move as it was';
  end if;
  if app.estimate_of_token('tok_upg147_techsigned_0123456') is not null or app.estimate_of_token('tok_upg147_techdeleted_012345') is not null
     or app.estimate_current_token('cf147300-0000-0000-0000-000000000003') is null or app.estimate_current_token('cf147300-0000-0000-0000-000000000004') is null then
    raise exception 'UPGRADE 147: the signed / deleted links the former tech read are not issued anew';
  end if;
  if app.estimate_of_token('tok_upg147_techopen_012345678') is not null
     or not exists (select 1 from public.revoked_link_tokens where token_hash = encode(sha256(convert_to('tok_upg147_techopen_012345678', 'UTF8')), 'hex'))
     or app.estimate_current_token('cf147300-0000-0000-0000-000000000002') is null then
    raise exception 'UPGRADE 147: the open link the tech could read is not issued anew';
  end if;
  if public.portal_estimate('tok_upg147_techopen_012345678') is not null
     or public.portal_estimate(app.estimate_current_token('cf147300-0000-0000-0000-000000000002')) is null then
    raise exception 'UPGRADE 147: the old link still opens the page, or the new one does not';
  end if;
end $$;
delete from app.estimate_tokens where company_id = 'cf147000-0000-0000-0000-000000000001';
delete from public.revoked_link_tokens where company_id = 'cf147000-0000-0000-0000-000000000001';
-- clean up: the main tests count users
delete from public.memberships where user_id = 'cf147000-0000-0000-0000-0000000000aa';
delete from auth.users where id = 'cf147000-0000-0000-0000-0000000000aa';
