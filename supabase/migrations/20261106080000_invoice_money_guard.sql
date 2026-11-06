-- Security audit 06.11, item 1: sales / office / admin could change the money of a sent invoice by a direct UPDATE
-- (total = -100, total below what is already paid). The guard froze only paid_cents / payment_status.
-- * An invoice that is not a draft keeps its amounts, tax, currency, client, job, kind, revision and sent time: only status
--   (void), dates, reminders, title and the payment recalc change it. The app never updates these fields
--   (it inserts invoices already "sent", cloud/ops.ts), so old app versions are not affected.
-- * A draft may change its total, but not below what is already paid (other fields of an old row stay editable).
-- * subtotal and total are never negative (CHECK, added NOT VALID, then validated). Both run in the migration's one
--   transaction, so the table stays locked until the validate ends: fine at today's size (production checked 06.11:
--   no negative totals); on a large table the validate goes into a migration of its own.
-- * "This is the payment recalc" is a transaction-local mark set by app.recalc_invoice_payment (security definer),
--   not pg_trigger_depth(): any other trigger writing invoices would pass a depth check.

create or replace function app.recalc_invoice_payment(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_paid      bigint;
  v_refunded  boolean;
begin
  if p_invoice_id is null then return; end if;
  select coalesce(sum(p.amount_cents - p.refunded_cents) filter (where p.status in ('succeeded', 'partially_refunded', 'refunded')), 0),
         coalesce(bool_or(p.refunded_cents > 0), false)
    into v_paid, v_refunded
    from public.payments p where p.invoice_id = p_invoice_id;

  perform set_config('app.invoice_recalc', 'on', true);
  begin
    update public.invoices i
       set paid_cents = v_paid,
           payment_status = case
             when v_paid > 0 and v_paid >= i.total_cents then 'paid'
             when v_paid > 0 then 'partially_paid'
             when v_refunded then 'refunded'
             else 'unpaid' end
     where i.id = p_invoice_id;
  exception when others then
    perform set_config('app.invoice_recalc', '', true);   -- a caught error must not leave the mark on
    raise;
  end;
  perform set_config('app.invoice_recalc', '', true);
end;
$$;
revoke all on function app.recalc_invoice_payment(uuid) from public, anon, authenticated;

create or replace function app.tg_invoice_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_recalc boolean := coalesce(current_setting('app.invoice_recalc', true), '') = 'on'
                      and current_user not in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    new.paid_cents := 0;
    new.payment_status := 'unpaid';
    if new.status = 'void' then
      raise exception 'invoice cannot be created void' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if not v_recalc then                    -- a direct change, not the recalc from payments
    new.paid_cents := old.paid_cents;
    new.payment_status := old.payment_status;
  end if;

  if old.status = 'void' then
    raise exception 'void invoice % is immutable', old.number using errcode = '42501';
  end if;

  if not v_recalc then
    if old.status <> 'draft' and (
         new.subtotal_cents is distinct from old.subtotal_cents
      or new.discount_cents is distinct from old.discount_cents
      or new.tax_cents      is distinct from old.tax_cents
      or new.total_cents    is distinct from old.total_cents
      or new.tax_enabled    is distinct from old.tax_enabled
      or new.tax_rate_id    is distinct from old.tax_rate_id
      or new.tax_rate_bps   is distinct from old.tax_rate_bps
      or new.tax_profile_id is distinct from old.tax_profile_id
      or new.tax_mode       is distinct from old.tax_mode
      or new.include_purchase_tax_in_cost is distinct from old.include_purchase_tax_in_cost
      or new.currency       is distinct from old.currency
      or new.customer_id    is distinct from old.customer_id
      or new.job_id         is distinct from old.job_id
      or new.kind           is distinct from old.kind
      or new.source_estimate_version_id is distinct from old.source_estimate_version_id
      or new.revision       is distinct from old.revision
      or (old.sent_at is not null and new.sent_at is distinct from old.sent_at)) then
      raise exception 'invoice % is sent: its amounts do not change (void it and issue a new one)', old.number
        using errcode = '42501';
    end if;
    if new.total_cents is distinct from old.total_cents and new.total_cents < old.paid_cents then
      raise exception 'invoice % total % is below what is paid %', old.number, new.total_cents, old.paid_cents
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status = 'void' and old.status <> 'void' then
    if auth.uid() is not null and not app.has_role(new.company_id, array['owner', 'admin']) then
      raise exception 'only owner/admin can void an invoice' using errcode = '42501';
    end if;
    if old.paid_cents <> 0 or exists (
         select 1 from public.payments p
         where p.invoice_id = old.id and p.status in ('pending', 'succeeded', 'partially_refunded')
           and p.amount_cents - p.refunded_cents > 0) then
      raise exception 'invoice % has payments; refund or move to credit before void', old.number
        using errcode = 'check_violation';
    end if;
    new.voided_at := coalesce(new.voided_at, now());
    new.voided_by := coalesce(auth.uid(), new.voided_by);
  end if;
  return new;
end;
$$;
revoke all on function app.tg_invoice_guard() from public, anon, authenticated;

alter table public.invoices add constraint invoices_subtotal_not_negative check (subtotal_cents >= 0) not valid;
alter table public.invoices add constraint invoices_total_not_negative check (total_cents >= 0) not valid;
alter table public.invoices validate constraint invoices_subtotal_not_negative;
alter table public.invoices validate constraint invoices_total_not_negative;
