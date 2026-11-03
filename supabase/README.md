# Supabase: схема базы (волна 5)

Первая миграция ядра по `docs/04-domain-model.md` v0.3.1 и правилам RLS из `docs/06-architecture.md` §4–5, `docs/08-security.md` §5.

## Что в миграции `migrations/20261104000000_core.sql`

- **`public.uuid_generate_v7()`** — UUID v7 (время + случайность), id по умолчанию у всех таблиц; телефон может генерировать такие же id офлайн.
- **Таблицы**: `users`, `companies`, `memberships`, `lead_sources`, `customers`, `contacts`, `properties`, `leads`, `jobs`, `visits`, `visit_assignees`, `estimates`, `estimate_versions`, `estimate_options`, `estimate_line_items`, `estimate_line_costs`, `invoices`, `payments`, `status_events`, `audit_log`; вид `customer_balances`.
- **Правила §0**: `company_id` на каждой бизнес-строке; составные FK `(company_id, parent_id)`, поэтому строка не может ссылаться на объект чужой компании; служебные поля `created_at/by`, `updated_at/by`, `deleted_at`, `row_version` (их ставит триггер, `created_by`/`updated_by` берутся из JWT); поля синхронизации `created_at_device`, `synced_at`, `origin_device_id`; деньги — `bigint` центы + `currency`, ставки — `*_bps`; `line_total_cents` = round half up.
- **Номера документов** `EST-0001`, `JOB-0001`, `INV-0001`, `RCT-0001` (квитанция при `succeeded`) присваивает только сервер. Счётчик ведётся отдельно для каждой компании (`app.company_numbering`), номер от клиента игнорируется и потом не меняется. Префикс можно переопределить в `companies.numbering -> '<тип>' ->> 'prefix'`.
- **State machines (§9)**: таблица `app.status_transitions` и триггер `app.tg_guard_status` для `lead`, `estimate`, `job`, `visit`, `invoice`, `payment`. Каждый переход записывается в `status_events`; причину можно передать через `set local app.status_reason = '…'`.
- **Визит**: `scheduled → en_route → on_site → completed`, отмена `cancelled` (из любого открытого статуса), `no_show` (из scheduled/en_route), пропуск `en_route` разрешён. Подшаги мастера (`work_started_at`, `signed_at`) идут только вперёд.
- **Деньги**: инвойсы и платежи нельзя удалить ни через `delete`, ни через `deleted_at`, это не может даже суперпользователь. `paid_cents`/`payment_status` инвойса пересчитывает триггер по платежам. У платежа меняется только статус (void/refund/return); void и refund делают только owner/admin, с причиной. Void инвойса — только owner/admin, только при `paid_net = 0`, после void инвойс больше не меняется. На работу не больше одного не-void `deposit` и одного `final`. `idempotency_key` платежа уникален.
- **Смета**: если у версии стоит `locked_at`, ни версию, ни её варианты, строки и себестоимость менять нельзя (меняют через новую версию). Себестоимость лежит в спутнике `estimate_line_costs`.
- **Журналы**: `status_events` и `audit_log` (append-only; аудит денег и членств).
- **RLS** включена с `FORCE` на всех таблицах. Helper-функции живут в схеме `app` (`SECURITY DEFINER`, `search_path = ''`): `is_member`, `has_role`, `is_staff`, `can_view_costs`, `is_visit_assignee`, `is_job_assignee`, `is_customer_assignee`, `is_property_assignee`, `can_read_estimate`, `can_edit_estimate`, `tech_can_record_payment`. Права `anon` сняты полностью, `authenticated` получает их явно, `delete` — только на `visit_assignees` и строки/варианты/себестоимость черновика сметы.

### Права по ролям (матрица §1)

| | owner | admin | office | sales | tech | subcontractor |
|---|---|---|---|---|---|---|
| Клиенты, объекты, контакты | все | все | все | все | только по своим визитам | — (позже через проекции) |
| Лиды | ✅ | ✅ | ✅ | ✅ | ❌ (в лиде есть `cost_cents`) | ❌ |
| Работы / визиты | все | все | все | все | только назначенные; меняет статус своих визитов | ❌ |
| Сметы | ✅ | ✅ | ✅ | ✅ | видит сметы по своим объектам; создаёт и правит только свои черновики, отправлять не может | ❌ |
| Себестоимость (`estimate_line_costs`) | ✅ | ✅ | ✅ | `view_costs` | ❌ | ❌ |
| Инвойсы | создаёт, меняет, void | создаёт, меняет, void | создаёт, меняет | создаёт, меняет | видит инвойсы своих работ | ❌ |
| Платежи | принимает, void, refund | принимает, void, refund | принимает | принимает | на своём визите (on_site/completed), за клиента этой работы | ❌ |
| Членства | выдаёт любую роль | все роли, кроме owner | ❌ | ❌ | ❌ | ❌ |
| AuditLog | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

## Как запустить тесты локально

```bash
supabase/tests/run.sh             # Postgres 16 из /usr/lib/postgresql/16/bin, порт 54329
VERBOSE=1 supabase/tests/run.sh   # плюс текст каждой ожидаемой ошибки
```

Скрипт поднимает одноразовый сервер (`initdb` во временный каталог; под root запускает через пользователя `postgres`), затем применяет `tests/auth_stub.sql` (роли `anon`/`authenticated`/`service_role`, `auth.users` и `auth.uid()` из `request.jwt.claim.sub`), все `migrations/*.sql` и `tests/core_rls.sql` с `ON_ERROR_STOP`. После этого останавливает сервер и удаляет каталог. Если всё прошло, последняя строка вывода — `ALL TESTS PASSED`.

Заглушка `auth` вынесена в отдельный файл, потому что миграция ссылается на `auth.uid()` и `auth.users`, а значит, заглушка нужна до миграции. В самой миграции заглушки нет. `core_rls.sql` подключает её повторно (идемпотентно) только для того, чтобы файл можно было читать как самостоятельный.

Что проверяют тесты: изоляция компаний (чтение даёт 0 строк, запись падает или не затрагивает ни одной строки, составные FK); мастер видит только свои визиты, работы, клиентов и не видит себестоимость; запрещённые переходы визита, работы, сметы и лида; StatusEvent; номера по компаниям; оплата на объекте и пересчёт инвойса; запрет удаления денег; void и refund; блокировка отправленной версии; защита роли owner; отключённый участник ничего не видит.

## Соответствие типов приложения (`apps/mobile/src/data/types.ts`) таблицам

| Тип в приложении | Таблица / поле в БД | Примечание |
|---|---|---|
| `Role` `director` / `dispatcher` / `tech` | `memberships.role` `owner`/`admin` · `office` · `tech` | В приложении `Member.roles[]`, в модели одна роль на членство |
| `Member` | `users` + `memberships` | `kind: "sub"` → роль `subcontractor` (позже `Subcontractor`) |
| `Customer.phone/email` | `contacts` (`is_primary`) | |
| `Customer.source` | `customers.lead_source_id → lead_sources.name` | |
| `Customer.balanceCents` | вид `customer_balances.balance_cents` | Вычисляется |
| `Property.address/city/stories` | `properties.address_line1/address_city/stories` | Адрес хранится плоскими колонками `address_*` |
| `Job.status` `lead`/`estimate`/`scheduled`/`in_progress`/`done` | `jobs.status` `draft`/`draft`/`scheduled`/`in_progress`/`completed` | `lead` и `estimate` — это ещё не работа, а лид или смета |
| `Job.title` | `jobs.title` | Поля нет в модели, добавлено |
| `Job.amountCents` | сумма варианта сметы / инвойса | Не хранится в `jobs` |
| `Visit.techId` | `visit_assignees.user_id` | В модели `assigned_users[]` |
| `Visit.start/durationMin` | `visits.starts_at/ends_at` | |
| `VisitStep` `scheduled`/`en_route`/`on_site` | `visits.status` | Совпадает |
| `VisitStep` `working` | `status = on_site` + `work_started_at` | |
| `VisitStep` `signed` | `+ signed_at`, `signature_file_id` | |
| `VisitStep` `paid` | `payments.visit_id = visit.id`, затем `visits.status = completed` | «Выезд закрыт» = `completed` |
| `Visit.payment` | `payments` (`method`, `amount_cents`, `received_at`) | `PaymentMethod` совпадает (`card`/`cash`/`check`/`zelle`) |
| `Visit.amountDueCents` | `invoices.balance_cents` инвойса работы | |
| `Visit.checklist/photos/scope` | `ChecklistResponse`, `File` | Следующие миграции |
| `Lead.status` `new`/`replied`/`booked`/`lost` | `new`/`contacted`/`inspection_scheduled`/`lost` | |
| `Lead.name/phone/city/message/receivedAt` | `contact_name/phone/address_text/message/received_at` | `message` добавлено |
| `Estimate.status` `draft`/`sent`/`approved`/`declined` | `estimates.status` | Совпадает, в БД есть и другие статусы §9 |
| `Estimate.totalCents/lines` | `estimate_versions.totals`, `estimate_line_items` выбранного варианта | |
| `Estimate.marginPct` | считается из `estimate_line_costs` | Tech не видит |
| `Estimate.signature/depositPaidAt` | `EstimateApproval`, deposit-инвойс | Позже |
| `Invoice.totalCents/paidCents/dueDate/kind` | `invoices.total_cents/paid_cents/due_date/kind` | `paid_cents` ведёт триггер |
| `Invoice.paidAt/method` | из `payments` | |

## Отступления от модели (осознанные)

- `visit_assignees` — отдельная таблица вместо `Visit.assigned_users[]`: так нужно для индексов под RLS tech (`06-architecture` §4.2).
- `estimate_line_costs` — спутник себестоимости (`unit_cost_cents`, `unit_material_cost_cents`, `purchase_tax_bps`, `line_cost_cents`) вместо колонок в `EstimateLineItem` (`06` §4.3, `08` §5.4). По той же причине в `jobs` пока нет полей `*_cost_cents`/`cost_breakdown` (будет спутник `job_costs`), а в `estimate_versions.totals` хранится только то, что видит клиент.
- `EstimateLineItem.group` → `line_group` (`group` — зарезервированное слово).
- Добавлены поля, которых нет в модели: `jobs.title`, `estimates.title`, `leads.message`, `leads.received_at`, `visits.work_started_at/signed_at/signature_file_id`, `payments.visit_id` (для права «tech принимает оплату на объекте»), `payments.refunded_cents` (сумма возвратов до появления таблицы `Refund`), `payments.void_reason/voided_by/voided_at`.
- `gate_code` в `properties` не включён: нужно шифрование и RPC `get_gate_code()` (`08` §5.4).
- Ссылки на сущности вне этой миграции (File, Device, Crew, TaxRate, ServiceCategory, CatalogItem и др.) пока хранятся как `uuid` без FK.

## Открытые вопросы

1. **Запись через API или напрямую.** По `06` §4.2 деньги и статусы должны идти только через API/RPC (`/sync/ops`). Сейчас прямые `update` разрешены под RLS и защищены триггерами. Закрыть ли прямой `update` у `status`, `invoices` и `payments`, когда появятся RPC?
2. **Инвойс при оплате на объекте.** Приложение создаёт оплаченный счёт при оплате выезда, а tech по матрице инвойсы не создаёт. Нужна RPC «оплата на объекте», которая создаёт инвойс и платёж атомарно. Сейчас tech может записать платёж с `invoice_id = null`.
3. **Право tech на оплату.** Сейчас tech может записать платёж с любым методом, включая `card`. Ограничить ручными (`cash`/`check`/`zelle`) и считать такой платёж заявкой (`needs_review`), пока его не подтвердит сервер или Stripe?
4. **`permissions_override` у tech.** Override «tech может отправлять сметы» (⚙ в матрице) пока не реализован, поддержан только `view_costs`.
5. **Несколько ролей у человека.** В приложении `roles[]`, в модели одна роль на членство. Оставить одну роль (рекомендация) или ввести набор ролей?
6. **Видимость компании после удаления из неё.** Политика `companies_select` пускает создателя по `created_by`: это нужно для `insert … returning` при онбординге. Если owner потом теряет членство, строку `companies` он всё ещё видит, а данные компании — нет. Заменить онбординг на RPC `create_company()`?
7. **Supabase и `FORCE RLS`.** Definer-функции рассчитывают на то, что у роли `postgres` в Supabase есть `BYPASSRLS`. Проверить на staging-проекте (локальные тесты идут под суперпользователем).
8. **Лиды для tech.** Сейчас tech лиды не видит и не создаёт (в лиде есть `cost_cents`). Для лида «сосед» от мастера нужен спутник `lead_costs` или RPC.
9. **Субподрядчик.** Ему пока закрыто всё; доступ появится через проекцию `work_order_for_sub` вместе с `SubcontractorAssignment`.
