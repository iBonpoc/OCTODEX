# ADR-007. Платежи: Stripe Connect, идемпотентность, вебхуки, Tap to Pay, подписка

- **Статус:** Proposed — needs founder/tech review
- **Дата:** 03.11.2026
- **Закрывает:** Д3 (Tap to Pay) частично
- **Связано:** PRD `09-invoices-payments.md`, `18-money-test-cases.md`, `04-domain-model.md` §6, `02a` §5, `06-architecture.md` §10.1

## Контекст
- Подрядчик принимает карту/ACH от своих клиентов; мы берём прозрачную надбавку (+0.5%, ACH cap $5) — главный потенциальный доход (`02a` §5).
- Multi-company: у каждой компании свой Stripe-аккаунт, платёж всегда на аккаунт компании документа (`09` §11).
- Нельзя двойных списаний: повторы, двойной тап, офлайн-очередь (`09` §7, `18`).
- Tap to Pay на iPhone — в MVP при одобрении Apple (Д3).
- Подписка Octo: продаём компании, основная оплата на сайте (`02` §9).
- [Факт] Stripe рекомендует новым платформам **controller properties / Accounts v2** вместо типов Standard/Express/Custom; direct charges на legacy Express/Custom тарифицируются connected-аккаунту по стандартным ставкам (F14).

## Варианты (модель Connect)
| Вариант | Плюсы | Минусы |
|---|---|---|
| **A. Direct charges на аккаунт подрядчика + `application_fee_amount`; аккаунты через controller properties (Stripe собирает требования, hosted-онбординг, лёгкий дашборд)** | Подрядчик — продавец (его имя в выписке клиента, его споры); мы не держим чужие деньги; прозрачная комиссия; так задумано в PRD 09 | Комиссии Stripe платит аккаунт подрядчика (это и нужно); часть возможностей Accounts v2 может быть preview |
| B. Destination charges (платёж на платформу, перевод подрядчику) | Больше контроля платформы | Платформа — продавец и отвечает за споры/возвраты; хуже для «честного» позиционирования и рисков |
| C. Legacy тип «Express» | Много примеров в сети | Типы — legacy по документации Stripe; переход потом сложнее |

## Решение
**Вариант A** [Совет]:
1. **Аккаунты:** на каждую `Company` — connected account, созданный с controller properties, эквивалентными «Stripe собирает требования, Stripe-hosted онбординг, Express-подобный дашборд, комиссии платит аккаунт». Точную комбинацию (`fees.payer`, `losses.payments`, `requirement_collection`, `stripe_dashboard.type`) утверждаем со Stripe при регистрации платформы [Проверить: какие поля v2 ещё preview].
2. **Платежи:** PaymentIntent на connected account (`Stripe-Account` header), `application_fee_amount = platform_fee_cents`, методы: card, us_bank_account (Financial Connections), Tap to Pay. Комиссии показываем до подтверждения (`09` INV-US-09).
3. **Идемпотентность:** `PaymentAttempt` создаётся при открытии экрана оплаты, `idempotency_key = hash(invoice_id, amount, attempt_no)` передаётся в Stripe и хранится unique; повтор возвращает тот же PaymentIntent. Refund — свой ключ из `refund.id`. Ручные платежи — ключ с устройства (офлайн-безопасно).
4. **Вебхуки — источник правды:** один endpoint для платформы и Connect-событий; проверка подписи; запись `webhook_event(event_id unique)` и быстрый ответ 200; обработка в очереди (`06` §8) строго один раз; порядок не гарантирован → обработчики идемпотентны и сверяются с текущим состоянием объекта в Stripe при сомнении. `fee_cents` — из balance transaction. ACH return → `Payment.returned` (`04` §9).
5. **Сверка:** ночная задача сравнивает платежи и payouts за 3 дня с данными Stripe; расхождения → алерт.
6. **Безопасность:** только Stripe Elements / Payment Element / Terminal — данные карт не касаются наших серверов и AI (PCI SAQ A); секретный ключ только в Edge Functions; restricted keys где возможно.
7. **Tap to Pay:** `stripe-terminal-react-native` + Expo config plugin, connection token с нашего API на аккаунт компании. [Факт] нужен Apple entitlement разработки и **отдельный** для распространения (TestFlight/App Store); описаны проблемы provisioning в EAS (F14). Заявку подаём сразу; если нет одобрения к бете — QR на портал инвойса (`09` INV-US-06). Офлайн-режим Terminal в MVP не используем (`09` §9).
8. **Подписка Octo:** Stripe Billing на сайте (`apps/web`), Customer Portal для управления. [Факт] в США с 04.2025 Apple не берёт комиссию за внешние ссылки на оплату, но дело в Верховном суде (принято 30.06.2026), и Apple предлагает 15%/5% (F15). Поэтому: в MVP **без IAP**; в приложении — ссылка на оплату на сайте только для US-витрины, если правила это допускают на дату релиза; `Entitlement.billing_source` уже поддерживает `app_store` — RevenueCat подключаем, только если ревью Apple потребует IAP или комиссия за ссылки станет сопоставимой [Проверить цены RevenueCat].

## Последствия
- ✅ Двойные списания исключены на трёх уровнях: PaymentAttempt, Stripe idempotency, `webhook_event`.
- ✅ Деньги подрядчика никогда не проходят через наш баланс.
- ⚠️ Онбординг Stripe и проверка платформы (application fee, раскрытие комиссии — Б5) — параллельная дорожка до среза 4.
- ⚠️ Проверочные примеры `18-money-test-cases.md` — обязательные интеграционные тесты в Stripe test mode (включая refund с возвратом application fee, ACH return, спор).
- 🔁 Пересмотреть модель подписки после решения Верховного суда по Epic v. Apple.
