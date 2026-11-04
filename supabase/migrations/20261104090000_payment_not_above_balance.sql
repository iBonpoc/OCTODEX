-- =============================================================================
-- Защита денег на сервере: оплата по счёту не может быть больше его остатка (приложение уже ограничивает,
-- теперь и база — на случай старого клиента, ошибки или ручного запроса). Платёж без счёта (аванс) не затрагивается.
-- =============================================================================
create or replace function app.tg_payment_not_above_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_total bigint; v_paid bigint;
begin
  if new.invoice_id is null or new.status not in ('pending', 'succeeded') then
    return new;
  end if;
  select total_cents, paid_cents into v_total, v_paid from public.invoices where id = new.invoice_id for update;
  if new.amount_cents > v_total - v_paid then
    raise exception 'payment % exceeds invoice balance % (overpayment)', new.amount_cents, v_total - v_paid using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger t05_not_above_balance before insert on public.payments
  for each row execute function app.tg_payment_not_above_balance();
