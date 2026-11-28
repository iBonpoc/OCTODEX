-- #3162 (spec 04 §4 «active → archived — нельзя при открытом балансе»; #3044): a client who owes is never made inactive by hand.
-- Until now only the app asked it (canArchive, store.setCustomerStatus); an older build or a direct call to the API went around it.
-- The server: a manual move of a customer to «archived» while the client owes is refused for good — 22023 + hint client_owes (the
-- app's words: outboxRejected client_owes, its own PR). «Owes» is the engine's clientMoney: the sum of max(0, total − paid) over the client's invoices
-- that are not void and not deleted (packages/estimating-engine contract.ts; a draft invoice counts, as there). Only a person's
-- move (current_user authenticated): merge_customers (S3d: the dropped card is archived after its invoices moved to the kept one)
-- and the server's own functions are not touched. Test T475.
-- Rule 16: only added (two functions and a trigger); nothing renamed or dropped.
-- The trigger is the caller's (current_user tells a person from the server's functions); the debt is read by a definer helper —
-- a role that does not see the invoices (sales) must not slip through (the pattern of app.po_move_ok).
-- Rule 18: the helper — revoked from public, anon, granted to authenticated (the trigger calls it as the caller; it answers only
-- the staff — who may change a client's status at all, customers_update — about a client of their own company); the trigger
-- function — revoked from public, anon, authenticated.

create or replace function app.customer_owes(p_company_id uuid, p_customer_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_staff(p_company_id)
     and exists (select 1 from public.invoices i
                  where i.company_id = p_company_id and i.customer_id = p_customer_id
                    and i.deleted_at is null and i.status <> 'void' and i.total_cents > i.paid_cents);
$$;
revoke all on function app.customer_owes(uuid, uuid) from public, anon;
grant execute on function app.customer_owes(uuid, uuid) to authenticated;

create or replace function app.tg_customer_archive_owes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.status = 'archived' and old.status is distinct from 'archived'
     and app.customer_owes(new.company_id, new.id) then
    raise exception 'client_owes: a client with an open balance is not made inactive' using errcode = '22023', hint = 'client_owes';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_customer_archive_owes() from public, anon, authenticated;

drop trigger if exists t12_customer_archive_owes on public.customers;
create trigger t12_customer_archive_owes before update of status on public.customers
  for each row execute function app.tg_customer_archive_owes();
