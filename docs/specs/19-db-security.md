# 19. Безопасность базы: находки аудита 06.11

Чат «Безопасность базы». Источник — аудит базы 06.11 (чат «Аудит базы»), пункты 1–5, 12, 13. Этап 0 (`docs/ai/WORKER.md`).
Шаги карты: S11/S12 (счёт, оплата), S13 (ссылка клиенту `/p/`), фото выезда (`files`), команда (членства). Новых статусов нет, §5 карты не меняется.

## 0. Что проверено руками (этап 0, 06.11)
Локальная база (`run.sh`) с тремя строками default privileges, как в Supabase:
- у `anon` и `authenticated` ВСЕ права (вкл. TRUNCATE, REFERENCES, TRIGGER) на `catalog_items`, `notifications`, `company_secrets`, `company_licenses`, `company_contacts`, `notes`; на остальные таблицы `public` — только явные grant;
- `core_rls.sql` падает на T2 «anon reads catalog» (стр. ~576) — тесты прав сейчас ложно-зелёные;
- `company_licenses` и `company_contacts` получают s/i/u в цикле `format(...)` (`20261104050000_company_profile.sql:87`), лишнее — только от default privileges; приложение их читает (`repo.ts` live) и пишет upsert/update (`ops.ts` 557–565), DELETE не нужен;
- EXECUTE у PUBLIC: 14 функций `app.*` (`can_see_lead`, `can_see_contact`, `is_lead_contact`, `contact_*_keys`, `phone_key`, триггерные `tg_*`); у anon нет usage на схему `app`, поэтому сейчас недостижимы — чистка «на будущее»;
- приложение создаёт счета сразу `status = 'sent'` с суммами с телефона (`ops.ts` visit.pay, invoice.issue, estimate.deposit) и **никогда** не меняет суммы после; строк счёта в базе нет;
- e2e открывают `/p/` на локальном сторе (`source = "local"`), `portal_pay_simulated` в облаке им не нужна;
- фото: `ops.ts uploadPhoto` грузит `<company_id>/<file_id>.jpg` с `upsert: true` **до** записи `files.storage_key`.

## 1. PR-1 «Честные тесты прав» (пункты 5 + 4)
**Варианты.** а) только тест — красный main; б) тест + миграция в одном PR (рек.); в) убрать default privileges только в заглушке — ложь.
**Решение (б).**
- `auth_stub.sql`: 3 строки `alter default privileges in schema public grant all on tables / functions / sequences to anon, authenticated, service_role` — до миграций, как в Supabase.
- Миграция `…_api_grants.sql`: `revoke all` на 6 таблиц от anon, authenticated; минимальные grant: `catalog_items` s/i/u, `notifications` select + update(read_at), `company_secrets` s/i/u, `company_licenses` s/i/u, `company_contacts` s/i/u, `notes` s/i/u (DELETE нигде не нужен — удаление мягкое). `alter default privileges for role postgres in schema public revoke all on tables, functions, sequences from anon, authenticated` — новые объекты без явного grant закрыты. EXECUTE для PUBLIC на новые функции — общая настройка Postgres, по схеме её не снять (а глобальный revoke сломал бы функции-помощники тестов и RLS-функции, которым забыли grant); поэтому новый `public`-функционал, доступный anon, ловит T52 по белому списку.
- Тест T52 «права API»: (1) anon не имеет ни одного права на таблицы `public`; (2) у authenticated нигде нет TRUNCATE/REFERENCES/TRIGGER и DELETE только там, где он задуман (список); (3) anon исполняет в `public` только `portal_estimate`, `portal_accept`, `portal_pay_simulated` (+ `uuid_generate_v7`); (4) новая таблица после миграции не получает прав anon/authenticated (default privileges сняты).
- Падало до исправления: T2 «anon reads catalog» и T52 на базе со строками Supabase.

## 2. PR-2 «Суммы счёта» (пункт 1)
**Варианты.** а) пересчёт сервером из строк — строк счёта нет, это E3/«Деньги» (позже); б) заморозка сумм не в draft + CHECK (рек.); в) суммы только через RPC — ломает офлайн-insert старых версий.
**Решение (б).**
- `tg_invoice_guard` (новой миграцией `create or replace`): на UPDATE при `old.status <> 'draft'`, кроме пересчёта оплат (локальный флаг `set_config('app.invoice_recalc', …)` внутри `recalc_invoice_payment`, а не `pg_trigger_depth()` — иначе любой будущий триггер обойдёт заморозку), `subtotal_cents`, `discount_cents`, `tax_cents`, `total_cents`, `tax_*`, `currency`, `customer_id`, `job_id`, `kind`, `source_estimate_version_id`, `revision`, `sent_at` (после отправки) не меняются — ошибка `42501` (а не молча: приложение их и не шлёт).
- CHECK `subtotal_cents >= 0`, `total_cents >= 0` — `not valid`, затем `validate`; upgrade-тест со старыми строками. `total_cents >= paid_cents` **не** CHECK: `t05_not_above_balance` срабатывает только на insert платежа, два pending → succeeded уронили бы пересчёт (будущий вебхук Stripe). Вместо этого — запрет уменьшать total ниже paid в черновике в `tg_invoice_guard` и тот же контроль баланса при переходе платежа в succeeded (тест). Серверные функции, создающие счета (`20261104070000:116`, `20261105240000:354`, `20261105350000:172`), — тест против новых CHECK.
- Совместимость: insert с телефона (старые версии) не меняется; переходы sent→void и пересчёт оплат (`recalc_invoice_payment`, глубина > 1) работают.
- Долг (позже, не в этом PR): счёт вставляется сразу sent с любой суммой и без проверки total = subtotal − discount + tax → выдача счёта только через RPC (с «Деньгами», вместе с серверными строками счёта).
- Тест: sales/office UPDATE total=-100 и total<paid на sent — падает; insert total=-100 — падает; draft — меняется; оплаты и void как раньше.

## 3. PR-3 «Демо-оплата по ссылке» (пункт 2)
**Варианты.** а) флаг в `companies` — owner может включить сам себе через companies_update; б) таблица `app.company_flags` (нет доступа из API, ставит только оператор SQL/service_role) (рек.); в) переменная окружения базы (`app.settings`) — одна на весь проект, не различает демо и реальные.
**Решение (б).** `app.company_flags(company_id pk → companies on delete cascade, simulated_payments boolean default false)`; `portal_pay_simulated` первой проверкой — флаг, иначе `42501 'simulated payments are off'`; плюс `app.estimate_link_open` — сейчас просроченная ссылка тоже «платит»; `portal_estimate` отдаёт `simulatedPay` (кнопку на `/p/` прячем, если false — правка `portal.ts`/`[token].tsx` у «Лиды и клиенты», 2–3 строки, согласовать). Существующие компании — выкл; демо-компанию основателя включает оператор одной строкой SQL (runbook в спеке). Удаление функции — позже двумя шагами перед Stripe (правило 16).
- Тест: выкл — anon получает ошибку, платежа нет; вкл — как в T11/T12.

## 4. PR-4 «Файлы, функции, членства» (пункты 3, 12, 13)
- **3.** `files_bucket_read`: `app.can_read_file_object(name)` (security definer): staff компании из пути — да; иначе строка `public.files` той же компании, у которой `id` = имя файла из пути (только `id`, **не** `storage_key`: автор сам меняет `storage_key` своей строки и подставил бы чужой путь), видимая по предикату `files_select`. Запись не меняем; `upsert: true` в Storage требует select и update при конфликте — первую загрузку (до записи `storage_key`) и повтор проверить тестом; повтор уже сейчас падает без update-политики — отдельной находкой «Работам»/«Каркасу».
- **12.** `revoke execute … from public` на функции `app.*`, созданные после core; `can_see_lead`, `can_see_contact`, `is_lead_contact` стоят в политиках RLS — им сразу `grant execute … to authenticated`, иначе лиды и контакты падают. Тест: ни одна функция `app` не исполнима PUBLIC/anon, политики лидов и контактов работают.
- **13.** `memberships_insert` → только через RPC принятия приглашения — согласовать с «Каркасом» №3 (7-2, T48); если закрывает он — пункт снимаю. Учесть: проверка роли в `core.sql:1224` пропускается при глубине > 1.

## 5. Тесты базы и миграции
Номера (руководитель, 06.11): тесты T52–T55; миграции `20261106070000` (PR-1), `…080000`, `…090000`, `…100000`. Каждая миграция — на чистой базе и с upgrade-данными. Перед каждым PR — агент `security-check`.

## 6. Остаток после PR-3
- На телефоне сотрудника (`/p/` из локального стора) кнопка «Pay by card» остаётся и пишет «card, stripe-simulated» через стор — это в правах сотрудника (он и так принимает оплату), но выглядит как карта. Решать вместе со Stripe (направление «Деньги»).
