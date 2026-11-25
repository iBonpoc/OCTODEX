-- #2647 (К1, rights; found by the review of #2646): a tech moves his draft only to a property he is assigned.
-- estimates_insert lets a tech create a draft only on a property he is assigned (app.is_property_assignee); the update
-- policy checked only «draft», so a tech could move his own draft to any property of the company. Since #2646 the app
-- really writes property_id of a draft.
-- * A trigger, not a stricter WITH CHECK: the policy cannot see the old row, and «is assignee» in WITH CHECK would refuse
--   every save of a tech's draft whose property was taken off him meanwhile (an old build's title / lines). Here only a
--   change of property_id is checked; the same property is no change.
-- * Only the app's own role (authenticated) that is not staff: owner / admin / office, the server's functions and the
--   client merge move estimates as before.
-- * Code 22023 + hint estimate_property_not_assigned — not 42501: the app reads 42501 as «no rights» for the whole company
--   (outboxRetry.isAccessDenied); one refused estimate is a plain refusal of its op (classify → refusal, dropped after MAX_TRIES).
-- Rule 16: only added (a function, a trigger). Rule 18: the trigger function is executed by no one.

create or replace function app.tg_estimate_property_assignee()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.property_id is distinct from old.property_id
     and current_user = 'authenticated'
     and not app.is_staff(new.company_id)
     and not app.is_property_assignee(new.property_id) then
    raise exception 'estimate_property_not_assigned: a tech moves an estimate only to a property he is assigned'
      using errcode = '22023', hint = 'estimate_property_not_assigned';
  end if;
  return new;
end;
$$;
-- rule 18 (T52): a trigger function; nobody calls it
revoke all on function app.tg_estimate_property_assignee() from public, anon, authenticated;

drop trigger if exists t27_estimate_property_assignee on public.estimates;
create trigger t27_estimate_property_assignee before update of property_id on public.estimates
  for each row execute function app.tg_estimate_property_assignee();
