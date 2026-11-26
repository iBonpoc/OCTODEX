# 06. Как устроено сегодня

Статус: действует · сверено с кодом 26.11.2026 (#2709) · обложка — `README.md`.
Почему так решили — `adr/README.md` (статусы ADR сверены с кодом). Старый черновик архитектуры v0.1 (03.11.2026, разделы §0–§16) — `archive/06-architecture.md`; ссылки «`06-architecture.md` §N» в старых документах ведут туда.

Здесь только то, что есть в коде. Задуманное, но не сделанное — в ADR и спеках, со статусом «предложено».

## 1. Части

| Часть | Где | Что это |
|---|---|---|
| Приложение | `apps/mobile` | одно приложение Expo Router (Expo SDK 58, React Native 0.88): iOS, Android, планшет и веб — один код. Экраны — `src/app/`, всё остальное — вне `src/app/` (`data`, `cloud`, `features`, `ui`, `modules`, `i18n`, `nav`, `theme`, `config`) |
| База и сервер | `supabase/` | Supabase: Postgres с RLS, вход, хранилище файлов. Схема — миграции `supabase/migrations/` (первая `20261104000000_core.sql`), тесты базы и прав — `supabase/tests/` (`core_rls.sql`, `run.sh`). Порядок миграций — правила 16 и 18 |
| Серверные функции | `supabase/functions/` | `delete-account`, `erase-storage`, `lead-intake`, `send-push`, `stripe-connect`, `stripe-pay`, `stripe-refund`, `stripe-webhook`. В каждой логика — `handler.ts`, вход Deno — `index.ts`; выкладывает `release.yml` после миграций |
| Дизайн-токены | `packages/design-tokens` | токены «Наряда» в TS — зеркало `design/naryad-ds/tokens/*.css` (сторож `mirror.test.ts`, правило 1) |
| Движок смет и денег | `packages/estimating-engine` | расчёт смет и денег: целые центы, decimal (правило 8, ADR-005) |

Next.js, отдельный портал, свой серверный монолит и PowerSync не заведены (ADR-001, ADR-002 — «с поправкой»; ADR-003 — в архиве).

## 2. Данные на телефоне и офлайн

- Всё состояние — стор `src/data/store.tsx`; хранится на устройстве в AsyncStorage (`src/data/persist.ts`).
- Правка сразу применяется локально и ложится в очередь отправки (`useStore().queue`, правило 6); операции очереди — `src/cloud/ops.ts`, повтор, порядок и зависимости — `src/data/outbox*.ts`. Деньги отправляются с ключом идемпотентности.
- Связь с базой — один клиент `@supabase/supabase-js` (`src/cloud/client.ts`); сессия — в защищённом хранилище телефона (`src/cloud/sessionStore.ts`), на вебе — localStorage. Чтение строк — `src/cloud/repo.ts`, статусы — `src/cloud/statusMap.ts`.

## 3. Модули ниш

Ядро про ниши не знает. Модуль описывает себя в `src/modules/<ключ>/module.ts`, ядро находит его через `src/modules/registry.ts` и показывает в местах `ModulePlace` (лид, объект, клиент, визит, смета, работа, настройки, вкладка). Доступ повторяет серверную `app.module_active`. Первый модуль — `src/modules/gutters/` (спека `specs/33-gutters-module.md`).

## 4. Что видит клиент

Страницы без входа: `src/app/p/[token].tsx` — документ клиента по ссылке (смета, счёт, оплата); `src/app/f/[token].tsx` — страница заявки компании (функция `lead-intake`, спека `specs/34-lead-intake.md`). Оплата — Stripe Connect через функции `stripe-*` (ADR-007, спека `specs/35-stripe.md`). Тексты для клиента — на языке клиента (правило 7).

## 5. Сборка, выпуск, проверки

| Что | Где |
|---|---|
| Проверки PR и `main` | `.github/workflows/checks.yml`: типы и тесты (`npm run check` локально) и e2e Playwright из `apps/mobile/e2e` (3 ширины × 2 темы); пауза конвейера при остановке — `scripts/pipelinePause.cjs` (правило 26) |
| Выпуск после слияния в `main` | `release.yml`: миграции базы → серверные функции → обновление по воздуху (канал `preview`) и веб; номер сборки — `scripts/setBuild.cjs` (правило 11) |
| Сборка в магазин | `eas-build.yml`, настройки `apps/mobile/eas.json` |
| Сайт | веб-сборка приложения (`expo export --platform web`) на Expo Hosting (`eas deploy --prod` в `release.yml`); в корне есть и настройка Cloudflare Workers `wrangler.jsonc` |
| Предпросмотр PR | `preview.yml` и `preview-deploy.yml` — только сайт, своя ссылка `*.expo.app` |

Подробно о проверках — `ai/CHECKS.md`.
