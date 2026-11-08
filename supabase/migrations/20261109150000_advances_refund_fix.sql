-- Step 20д, debts (docs/specs/35-stripe.md §4г). Test mode only. Everything is added (rule 16).
-- 1) The client's advance: a payment without an invoice (an online payment above the balance, needs_review) is applied to
--    an invoice of the same client. The rules live in a trigger on payments, so a direct UPDATE of invoice_id is as safe as
--    the door: before this, tg_payment_guard let an owner move invoice_id from null to any invoice of the company — another
--    client's, above its balance (t05_not_above_balance checks only an insert).

-- ---- 1. Applying an advance: the rules (any way it is written) --------------------------------------------------------
create or replace function app.tg_advance_apply()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  inv   public.invoices;
  v_net bigint;
begin
  if old.invoice_id is not null or new.invoice_id is null then
    return new;                                         -- not an advance being applied (tg_payment_guard keeps the rest)
  end if;
  if auth.uid() is not null and not app.has_role(new.company_id, array['owner', 'admin']) then
    raise exception 'only owner/admin can apply an advance' using errcode = '42501';
  end if;
  if exists (select 1 from public.companies c where c.id = new.company_id and c.closed_at is not null) then
    raise exception 'the company is closed' using errcode = '42501';
  end if;
  select * into inv from public.invoices where id = new.invoice_id for update;
  if inv.id is null or inv.company_id <> new.company_id or inv.customer_id <> new.customer_id then
    raise exception 'advance_other_client' using errcode = 'check_violation';
  end if;
  if inv.status <> 'sent' then
    raise exception 'advance_invoice_not_open' using errcode = 'check_violation';
  end if;
  -- only money that is there (not ACH on its way, not a failed one), applied as it is, in an update of its own
  if old.status not in ('succeeded', 'partially_refunded') or new.status is distinct from old.status
     or new.refunded_cents is distinct from old.refunded_cents then
    raise exception 'advance_not_applicable' using errcode = 'check_violation';
  end if;
  if new.dispute_status in ('open', 'lost') then
    raise exception 'advance_disputed' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.refunds r where r.payment_id = new.id and r.status = 'pending') then
    raise exception 'advance_refund_in_progress' using errcode = 'check_violation';
  end if;
  -- the whole advance or nothing: a payment is never split (its amount is immutable); the rest is refunded first
  v_net := new.amount_cents - new.refunded_cents;
  if v_net <= 0 or v_net > app.invoice_online_balance(inv.id) then
    raise exception 'advance_above_balance' using errcode = 'check_violation';
  end if;
  new.needs_review := false;                            -- the owner looked at it and decided
  return new;
end;
$$;
revoke all on function app.tg_advance_apply() from public, anon, authenticated;

-- after t40_payment_guard (names run in order): the guard refuses any other change of invoice_id first
create trigger t41_advance_apply before update on public.payments
  for each row execute function app.tg_advance_apply();
