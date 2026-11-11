-- Деньги: что человек может сделать с платежом сам (аудит 11.11 B-01, B-03, B-14; #757).
--
-- Было:
--   B-01  человек (owner/admin, политика payments_update) вставлял платёж pending на весь остаток (t05_not_above_balance
--         не считает pending), потом succeeded на весь остаток, потом переводил pending → succeeded — счёт оплачен вдвое:
--         сверка с остатком есть только при вставке;
--   B-14  тот же ручной pending съедал app.invoice_online_balance — клиент не мог заплатить онлайн;
--   B-03  платёж картой / ACH / Tap to Pay человек переводил в returned — счёт снова «не оплачен», а деньги у Stripe
--         остались: клиента можно списать второй раз.
-- Стало (только для человека — auth.uid() есть; Stripe пишет без пользователя, его путь не меняется):
--   * человек вставляет только succeeded: pending — это «деньги в пути» у Stripe (ACH), их пишет только вебхук;
--   * исход pending (succeeded / failed) пишет только Stripe — вебхук сверяет остаток сам и помечает переплату
--     needs_review (20261109010000_stripe_base.sql);
--   * returned человек ставит только ручным способам (наличные, чек, Zelle, рассрочка, другое — «чек вернулся»);
--     карте, ACH и Tap to Pay — только Stripe, а человеку для них — возврат через refund_record.
-- Приложение pending и returned не пишет никогда (cloud/ops.ts: visit.pay, payment.record, invoice.pay — succeeded):
-- старые телефоны не ломаются. Правило 16: ничего не переименовано и не удалено — добавлен один триггер.
set local lock_timeout = '5s';

create or replace function app.tg_payment_person_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;          -- Stripe (вебхук, service_role) и функции сервера без пользователя
  if tg_op = 'INSERT' then
    if new.status <> 'succeeded' then
      raise exception 'payment: a person records a received payment only (status succeeded); money on its way is Stripe''s'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if old.status = 'pending' and new.status is distinct from old.status then
    raise exception 'payment: the outcome of a payment on its way is Stripe''s' using errcode = '42501';
  end if;
  if new.status = 'returned' and old.status is distinct from 'returned' and old.method in ('card', 'ach', 'tap_to_pay') then
    raise exception 'payment: a card or bank payment is returned only by Stripe; refund it instead' using errcode = '42501';
  end if;
  return new;
end;
$$;
-- правило 18 (T52): функция триггера, её никто не зовёт
revoke all on function app.tg_payment_person_guard() from public, anon, authenticated;

-- после t40_payment_guard (тот проверяет неизменность и роли), до t60+ (пересчёт счёта)
create trigger t41_payment_person_guard before insert or update on public.payments
  for each row execute function app.tg_payment_person_guard();
