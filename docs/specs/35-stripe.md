# 35. Онлайн-оплата Stripe, возвраты, чтение чека (шаг 20)

> Этап 0 принят руководителем №5 08.11.2026 («Деньги и отчёты» №3). Да на 20а и 20б, только test mode. Вопросы В1–В5 — у основателя через руководителя.
> Клетки карты: S12 «Оплата → квитанция» (картой/ACH онлайн), новые стыки S12a «вебхук → платёж», S12b «возврат» (`docs/15-story-map.md` §4 — вносит руководитель).
> Источники: ADR-007, PRD 09 (INV-US-01, 05, 08, 09), `docs/legal/legal-research.md` §6, PRD 10 EXP-US-01.

## 1. Проверка сделанного
| Вопрос | Ответ |
|---|---|
| Сделано ли? | Нет. Оплата на `/p/` — имитация (`SimulatedCheckout.tsx`, `portal_pay_simulated`, T12). Edge Functions Stripe нет. |
| Что есть в базе | `payments` уже готова к Stripe: методы `card/ach/tap_to_pay`, статусы `pending/succeeded/failed/partially_refunded/refunded/returned/voided`, `stripe_payment_intent_id`, `stripe_charge_id`, `fee_cents`, `platform_fee_cents`, `dispute_status`, `idempotency_key unique`, переходы в `app.status_transitions`, сторож `tg_payment_guard` (возврат — только owner/admin), запрет оплаты больше остатка (`t05_not_above_balance`). `companies.stripe_account_id` есть, не используется. |
| Чего нет | состояния аккаунта Stripe, попыток оплаты, журнала событий Stripe, таблицы возвратов, применения событий. |
| Что сломается | Ничего: всё добавлением (правило 16). Старые телефоны не знают `ach` и `pending` — это общий малый PR приложения (types.ts, repo.ts, statusMap.ts) до 20в. |

## 2. Решения (брейншторм-оспаривание)
| # | Вопрос | Решение | Почему / статус |
|---|---|---|---|
| 1 | Модель Connect | direct charges на аккаунт подрядчика + `application_fee_amount`; аккаунт через controller properties (Accounts v2), не legacy-тип | подтверждено (ADR-007 А) |
| 2 | Express или Standard | **Standard-эквивалент**: `losses.payments = stripe`, `fees.payer = account`, полный дашборд Stripe, онбординг Stripe hosted | **оспорено, ждёт В2.** При Express-эквиваленте отрицательный баланс и мошенничество подрядчика — на платформе. ADR-007 и PRD 09 INV-US-01 («Express») не меняются до ответа |
| 3 | Кто платит комиссию | Stripe — подрядчик; надбавки за карту нет ни в одном штате; «ACH первым» при балансе ≥ $1,000 | CA Civ. §1748.1 запрещает надбавку; другие штаты — мозаика + правила Visa/MC. Ждёт В3 (наша +0.5%), В4 |
| 4 | Источник правды | вебхук Stripe; телефон карту/ACH не пишет, видит после синка | S12 картой — только при сети |
| 5 | Двойное списание | `payment_attempts` (один ключ на счёт + сумму + номер попытки) → Stripe idempotency → `app.stripe_events(event_id pk)` | три уровня, ADR-007 п.3 |
| 6 | Неверный порядок событий | статус только вперёд; `refunded_cents` только растёт (берём `amount_refunded` заряда, максимум); устаревшее событие — «ignored» | §4 |
| 7 | Деньги больше остатка (пока клиент платил, подрядчик записал наличные) | платёж **всё равно записывается**, без счёта (аванс клиента), `needs_review = true`; подрядчик решает: вернуть или зачесть | деньги не теряются, сторож остатка не обходится |
| 8 | Чужой аккаунт в событии | событие, у которого `account` ≠ аккаунт компании попытки, — «ignored», платёж не создаётся | §4 |
| 9 | Возвраты | owner/admin; card/ACH — Stripe refund, наличные/чек — запись; шторка подтверждения (тоста «Отменить» нет, необратимо) | 20д |
| 10 | ACH | в шаге 20, тот же Payment Element; `pending` до 4 дней | 20в |
| 11 | Чтение чека | ИИ через Edge Function, после Stripe, после «да» на В5 | 20е |
| 12 | Tap to Pay | не в шаге 20 | entitlement Apple, dev build |
| 13 | Проигранный спор | `dispute_status = lost`, `paid_cents` не меняется; `warning_closed` = won | решение основателя позже (деньги) |
| 14 | ACH в пути + наличные на тот же остаток | оба платежа сохраняются, ACH — `needs_review`, счёт переплачен до решения владельца | сторож `t05` не трогаем: старые телефоны с наличными в очереди получили бы отказ и застряли (правило 16, урок «отказ стопорит очередь»). Онлайн-попытка уже вычитает pending |
| 15 | Тестовое событие на живой аккаунт, валюта не USD | `ignored` (`livemode`, `currency`) | test-платёж никогда не закрывает настоящий счёт |
| 16 | Событие о нашем платеже раньше самого платежа (возврат, спор) | ошибка → событие не пишется, Stripe пришлёт снова | порядок не гарантирован; чужие продажи подрядчика — `ignored` |

## 3. Безопасность
- Секретный ключ и webhook secret — только в секретах Edge Functions; вводит основатель в панели Supabase. В чат и в репозиторий не пишутся. Только test mode до слова основателя.
- Таблицы Stripe: `revoke all` от anon/authenticated; чтение — staff своей компании, только нужные колонки; записи — только функции `app.*` для `service_role` (правило 18, T52).
- security-check на каждый PR с вебхуком или ключами.

## 4. База (20а, миграция 20261109010000)
- `public.stripe_accounts` (company_id pk, account_id unique, charges_enabled, payouts_enabled, details_submitted, requirements_due, disabled_reason, livemode, updated_at). Чтение — owner/admin/office/sales своей компании.
- `public.payment_attempts` (invoice, сумма, attempt_no, idempotency_key unique, stripe_payment_intent_id unique, status `open/processing/succeeded/failed/canceled`). Чтение — staff.
- `public.refunds` (payment, сумма, reason_kind `rescission/cancellation/goodwill/other`, status `pending/succeeded/failed/canceled`, stripe_refund_id unique, idempotency_key unique). Чтение — staff. Заполняет вебхук (`charge.refunded`); ручные возвраты — 20д.
- `app.stripe_events` (event_id pk, type, account_id, livemode, payload, status `received/processed/ignored/failed`, reason, received_at, processed_at). Без доступа для authenticated.
- Функции (только `service_role`):
  - `app.stripe_account_sync(company, account jsonb)` — 20б и `account.updated`;
  - `app.payment_attempt_open(invoice, amount)` — сумма 1…остаток, у компании `charges_enabled`; та же сумма и открытая попытка → та же строка; после failed/canceled — новый номер;
  - `app.payment_attempt_set_intent(attempt, intent_id)`;
  - `app.stripe_event_apply(event jsonb)` — записывает событие (повтор → `duplicate`, ничего не меняет) и применяет: `account.updated`, `payment_intent.processing` (платёж `pending`), `payment_intent.succeeded` (платёж `succeeded`, квитанция RCT ставит сервер), `payment_intent.payment_failed` / `canceled` (pending → failed; попытка failed), `charge.refunded` (refunded_cents = max, строки refunds), `charge.dispute.created/closed` (dispute_status). Остальное — `ignored`.
- Платёж Stripe: `idempotency_key = 'stripe:' || pi_id`, `reference = pi_id`, `platform_fee_cents = application_fee_amount`. `fee_cents` — 20г (balance transaction).

Ревью безопасности 20а (08.11): чужой аккаунт с нашим `attempt_id` в metadata не берёт попытку; гонка двух событий по metadata; `processing` после `failed` — `stale`; журнал без `billing_details` и данных карты; уведомление «счёт оплачен» только когда деньги легли на счёт. Тесты — T128, T129.

**Долги к 20в–20г (из ревью):** `stripe-pay` сверяет токен `/p/` со счётом до `payment_attempt_open` (иначе IDOR); старая попытка с записанным PaymentIntent — переиспользовать его (ключ Stripe живёт 24 ч); вебхук проверяет подпись до `stripe_event_apply` (функция доверяет полю `account`); срок хранения `app.stripe_events` и удаление с компанией — в ночной задаче (спека 21).

## 4а. Подключение (20б, миграция 20261109020000)
- «Ещё → Компания → Онлайн-оплата» (`/company/payments`): строка состояния словами (Проверяем / Нет ответа / Ещё не настроено / Не подключено / Ждёт данных в Stripe / Stripe ограничил приём / Принимает оплату), «Тестовый режим — деньги не списываются», «Приём оплат», «Выплаты на счёт компании», «Stripe просит заполнить: N». В демо — «работает в облачном аккаунте».
- **Подключает только владелец** (ревью безопасности 20б №1: аккаунт Standard с полным дашбордом и выплатами принадлежит тому, кто прошёл форму; admin мог бы увести выплаты). Admin и офис видят состояние. Решение «owner, не admin» — мелкое, основателю «было/стало».
- Edge `stripe-connect` (verify_jwt): `status` — читает аккаунт у Stripe и сохраняет; `start` — один аккаунт на компанию (Idempotency-Key `octodex-connect-<company>`, одни и те же поля без имени), сохранение до 3 раз, затем свежая ссылка `account_links` (только `https://connect.stripe.com/`, возврат на `https://octodex.expo.app/company/payments`). Ключ `sk_test_`/`rk_test_`; живой ключ или `livemode: true` в ответе — «live_refused». Без ключа — «Ещё не настроено».
- Двери базы: `public.stripe_connect_target`, `public.stripe_account_save` — только service_role (T130).
- Тесты: T130, unit `stripeConnectFn` (поддельный Stripe), `onlinePay`, e2e 182 (демо).
- Долги из ревью 20б: CORS `*` (вход по Bearer, у телефона нет Origin) — сузить до сайта при 20в; лимит частоты `start` на компанию — позже; `stripe_account_sync` сверять `metadata.company_id` — в 20г (вебхук); старая колонка `companies.stripe_account_id` не читается, удалить по правилу 16 отдельным PR.

## 4а. 20в — оплата с /p/ (миграция 20261109030000, «Деньги и отчёты» №4)
- `public.stripe_pay_open(token, invoice)` (service_role): токен `/p/` → смета → работа → **этот** счёт, ссылка открыта, компания не закрыта — только потом `app.payment_attempt_open` на весь онлайн-остаток (ACH в пути не просим снова). IDOR закрыт в базе. `public.stripe_pay_set_intent`. `portal_estimate` += `online_pay`, `pending` (ACH в пути по счетам). T131.
- Edge `stripe-pay` (verify_jwt = false): CORS — одна константа `ALLOWED_ORIGINS` (сейчас `https://octodex.expo.app`; позже gorix.app), чужой Origin → 403. Попытка с PaymentIntent → читаем его: можно платить — тот же client_secret; processing — «в обработке»; canceled — «позже» (вебхук закроет попытку). Новый PI — direct charge, `Stripe-Account`, Idempotency-Key = ключ попытки, metadata attempt/company/invoice, `payment_method_types` ACH первым от $1,000. `application_fee_amount` нет до В3. Секреты: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` (pk_test_).
- `/p/`: Payment Element (только `@stripe/stripe-js` 10.1.0, без react-stripe-js), только web; имитация — только если `online_pay` нет и компания демо. После подтверждения — «Платёж в обработке»; ACH в пути — «ACH в обработке: $…». Экран счёта (InvoiceCard) — то же по `db.pendingPayments` (#435). e2e 183.
- Старые PaymentIntent того же счёта (другая сумма, старая вкладка, неудачная попытка) `stripe-pay` отменяет до выдачи нового (`stale_intents`) и сразу закрывает их попытки (`public.stripe_pay_close_attempt`). Если отмена не прошла, старый PI перечитывается: processing / succeeded → «в обработке», новый не выдаётся (вкладка A оплатила, вебхука нет — вкладка B второй раз не платит); всё ещё можно оплатить → 502, двух оплачиваемых PI на счёт не бывает.
- CORS — только вежливость браузера, не защита: ключ — токен `/p/`.
- **Обязательно до live:** лимит частоты `stripe-pay` по токену и IP (как в lead-intake) и Radar.

## 4б. 20г — вебхук (миграция 20261109040000)
- Edge `stripe-webhook` (verify_jwt = false), Connect-эндпоинт («события подключённых аккаунтов»). Сначала подпись `Stripe-Signature`: HMAC-SHA256 «t.сырое тело», допуск 300 с, сравнение за постоянное время, любой из нескольких v1. До подписи тело как JSON не читается. Неверная подпись → 400.
- Для `payment_intent.*` PI читается обратно (`expand[]=payment_method`, `latest_charge.balance_transaction`) на аккаунте события: метод (card / `us_bank_account` → ach) и комиссия Stripe — только `stripe_fee` из `fee_details` (application fee — отдельно, `platform_fee_cents`). PI читается только наш (в metadata есть `attempt_id`) и только для четырёх применяемых типов. Временный сбой чтения у `succeeded` (5xx, 429, нет ответа) → 500, Stripe повторит; постоянный отказ (401/403/404, чужой id) → событие применяется без метода и комиссии, платёж не теряется. Live-событие → 200 `ignored`, в базу не идёт (пока только test mode). Тело больше 1 МБ → 413.
- `public.stripe_webhook_apply(event, method, fee)` (service_role): `metadata.company_id` ≠ компания аккаунта → журнал `ignored / company_mismatch`; неизвестный аккаунт — `unknown_account`; повтор — `duplicate`. Иначе `app.stripe_event_apply` и `fee_cents` платежа: только из 0 в известную, в том числе на повторе (ACH: у `processing` комиссии нет, у `succeeded` есть); не уменьшается и не меняется. 55000 → 500 (ничего не записано, Stripe повторит); 22023 у подписанного события → 200 `rejected` с записью в лог, без трёх дней повторов.
- Секреты: `STRIPE_WEBHOOK_SECRET` (whsec_ Connect-эндпоинта), `STRIPE_SECRET_KEY` (test). Хранение `app.stripe_events` — как в 20а; срок — спека 21. T132, `test/stripeWebhookFn.test.ts` на подписанных фикстурах.

## 4в. 20д — возвраты (этап 0, «Деньги и отчёты» №5)
Что нужно подрядчику: с телефона вернуть клиенту часть или всю оплату — по ошибке, по отказу, по доброй воле — и видеть, что деньги ушли, счёт снова с остатком, налог в отчёте уменьшился.

Варианты: (А) возврат с экрана квитанции (платёж = квитанция), шторка суммы и причины, затем шторка «необратимо»; (Б) отдельный раздел «Возвраты» в «Оплатах»; (В) возврат со счёта целиком. **Решение — А**: один платёж = одна квитанция, сумма ограничена именно этим платежом; Б и В — лишние экраны, счёт может иметь платежи разными методами.

| Утверждение | Источник | Итог | Доказательство |
|---|---|---|---|
| Возврат только owner/admin, сервер проверяет роль, office — 403 | PRD 09 INV-US-08, §139 | подтверждено | `tg_payment_guard` проверяет роль только при `auth.uid()`; у service_role его нет → роль проверяет каждая дверь 20д сама |
| Сумма ≤ оплачено − уже возвращено | PRD 09 §139 | подтверждено, уточнено | ещё минус возвраты «в пути» (pending): два нажатия в двух вкладках не вернут дважды; строка платежа блокируется `for update` |
| Карта/ACH → Stripe refund с Idempotency-Key | INV-US-08 | подтверждено | ключ = `refunds.idempotency_key` строки, созданной до вызова Stripe; повтор после обрыва — та же строка, тот же ключ |
| Наличные/чек/Zelle → запись с причиной | PRD 09 §139 | подтверждено | `financing` — тоже запись (деньги шли не через нас) |
| Комиссия Stripe не возвращается, показать до подтверждения | PRD 09 §139 | подтверждено | Stripe не возвращает processing fee; в шторке «Комиссия Stripe $x не вернётся» при известной `fee_cents` |
| Комиссия платформы — пропорционально (`refund_application_fee`) | PRD 09 §139 | подтверждено | параметр работает для direct charges; передаём, только когда наша комиссия у платежа есть (`platform_fee_cents > 0`; до В3 её нет) |
| Налог/выручка по режиму документа, по умолчанию пропорционально | 19 §7.9, TX13–TX16 | подтверждено | `refundAllocation` в движке уже есть с TX13–TX16; сервер считает то же в SQL и хранит `tax_cents/net_cents` |
| Варианты «по строке» и «вручную» | 19 §7.9, INV-US-17 | **оспорено** | у возврата нет строк, ручная правка — риск ошибки в налоге; в 20д только `proportional`, колонка `allocation_method` готова к остальным |
| Отказ клиента: `due_by`, задача «вернуть до +10 дней» | INV-US-20 | **оспорено** (не в 20д) | это юр. шаг отказа (LEG-09); в 20д причина `rescission` выбирается, срок и задача — позже |
| Возврат офлайн недоступен | PRD 16 §86, §105 | подтверждено | кнопка без сети неактивна; запись идёт только на сервер, не в очередь |
| e2e 184 для 20д | §5 | **опровергнуто** | 184 занят (`184-portal-errors`), 20д — e2e 185, 20е — 186 |
| Строки `refunds` пишет вебхук | §4 | **оспорено** | наш возврат создаёт строку до Stripe; `refund.created` может прийти раньше ответа → вторая строка. Вебхук ищет строку по `metadata.octo_refund_id` |
| `refunded_cents` — максимум из Stripe | §2 п.6 | подтверждено | наш ответ Stripe ставит Σ succeeded-возвратов тем же `stripe_apply_refunded` (только растёт) |
| Спор по платежу | — | новое | при `dispute_status` open/lost возврат запрещён (Stripe отказывает `charge_disputed`) |

База (миграция `20261109050000_refunds.sql`, добавлением): `refunds` + `method`, `tax_cents`, `net_cents`, `allocation_method`, `failure_reason`; аудит.
- `public.refund_record(payment, amount, kind, reason, key)` — authenticated, только owner/admin активные; методы не Stripe; сразу `succeeded`, `refunded_cents += amount`.
- `public.stripe_refund_open(user, payment, amount, kind, reason, key)` — service_role: роль, остаток, спор, строка `pending`; отдаёт аккаунт, PI, ключ. `public.stripe_refund_settle(refund, stripe_refund)` — ответ Stripe: id, статус; succeeded → `refunded_cents`; failed → без денег.
- `needs_review` показывается: чип «Проверить» на квитанции и в «Оплатах», с причиной.
- Edge `stripe-refund` (verify_jwt = true): JWT → user → `stripe_refund_open` → `POST /v1/refunds` (`Stripe-Account`, `Idempotency-Key`, `payment_intent`, `amount`, `refund_application_fee=true`, `metadata.octo_refund_id`) → `stripe_refund_settle`. Таймаут — строка остаётся pending, повтор безопасен.
- Тесты: движок (TX13–TX16 + края), T133 (роль, остаток, pending, гонка, спор, повтор ключа, налог как в движке, вебхук по metadata), unit `stripeRefundFn` (поддельный Stripe), e2e 185.
- PR: 20д-1 база + Edge + T133; 20д-2 экран + e2e 185.

Ревью безопасности 20д-1 (08.11), исправлено: ручной платёж «картой» без PaymentIntent (свой терминал) — возврат записью, в Stripe — только платёж из Stripe (`idempotency_key = 'stripe:' || pi`); человек не пишет поля Stripe (PI, charge, спор, комиссии) — `tg_payment_guard`; возврат прямым UPDATE запрещён — только `refund_record` (флаг `app.refund_door`), T45 переведён на дверь; строка «в пути» старше 2 минут — сначала спрашиваем Stripe по `metadata.octo_refund_id` (`stripe_refund_inflight`): сделан — сохраняем, не сделан и сумма другая — `not_sent`, повтор после 24 ч не делает второго возврата; чужая компания получает «нельзя», а не «в пути»; ветка повтора проверяет роль, закрытую компанию, спор и статус. По code-review: строку «в пути» продолжает только её ключ (другой ключ — `refund_in_progress`, иначе он мог бы сделать второй возврат); «старость» — от последней попытки (`updated_at`), `not_sent` база ставит только строке без попытки 100+ с; у прошедшего возврата причина отказа стирается.
**Долг (решение 20а «только растёт»):** ACH-возврат, принятый Stripe (pending с id) и потом `failed`/`canceled`, остаётся в `refunded_cents`, ставится `needs_review`; двери исправления нет. Нужна отдельная задача: пересчёт `refunded_cents` вниз из строк возвратов или дверь корректировки для owner.

## 5. План PR
| PR | Что | Тесты |
|---|---|---|
| 20а | база §4 (без приложения, BUILD не меняется) | T126 права, T127 повтор события, T128 порядок и возвраты, T129 попытки, остаток и чужой аккаунт |
| общ. | приложение понимает `ach`, `pending`, `failed`, `returned`, `refunded` (types.ts, repo.ts, statusMap.ts) — отдельный малый PR | unit |
| 20б | Edge `stripe-connect` + «Настройки → Деньги → Онлайн-оплата» | e2e 182 |
| 20в | Edge `stripe-pay` + Payment Element на `/p/` (p/[token].tsx — руководитель отдаёт) | e2e 183 |
| 20г | Edge `stripe-webhook`: подпись по сырому телу, `fee_cents` | Deno-тесты на подписанных фикстурах, T130–T132 |
| 20д | возвраты: экран платежа, Edge `stripe-refund`, ручной возврат, движок `refundAllocation` | T133, e2e 185 |
| 20е | чтение чека (после В5) | e2e 186 |
