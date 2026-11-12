-- The payment check: a payment is never above its invoice's balance (app.tg_payment_not_above_balance, 20261104090000).
-- The trigger runs before the row's RLS check and its foreign keys, as the function's owner: it now looks only at an
-- invoice of the payment's own company, and only for someone of that company (or a server path with no signed-in user —
-- the Stripe webhook, migrations). Anyone else learns nothing and takes no lock: the RLS check refuses the row as before.
-- The refusal says no amounts (hint payment_above_balance); T176 still finds «exceeds invoice balance».
-- Rule 16: the same function, the same trigger; nothing renamed or dropped. Rule 18: revoked from everyone (a trigger).
-- Test: supabase/tests/core_rls.sql T198.

create or replace function app.tg_payment_not_above_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_total bigint; v_paid bigint;
begin
  if new.invoice_id is null or new.status not in ('pending', 'succeeded') then
    return new;
  end if;
  -- a person of another company (or with no role in this one): nothing is read — RLS refuses the row after this trigger.
  -- Sales and the tech stay: server functions pay for them (record_estimate_deposit, record_visit_payment)
  if auth.uid() is not null and not app.has_role(new.company_id, array['owner', 'admin', 'office', 'sales', 'tech']) then
    return new;
  end if;
  -- only an invoice of the payment's own company (a mismatched pair is refused by the foreign key after this trigger)
  select total_cents, paid_cents into v_total, v_paid from public.invoices
   where id = new.invoice_id and company_id = new.company_id for update;
  if not found then return new; end if;
  if new.amount_cents > v_total - v_paid then
    raise exception 'payment exceeds invoice balance (overpayment)' using errcode = 'check_violation', hint = 'payment_above_balance';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_payment_not_above_balance() from public, anon, authenticated;
