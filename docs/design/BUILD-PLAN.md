# План сборки живого прототипа GoRix по каркасам v2

> **Решение руководителя №21 (21.11):** кнопка — **40** (зона 44, главная внизу — 44): слово основателя 21.11 (#2350), уже в токенах. Где ниже в плане сказано «36» — читать «40». Правило 3 CLAUDE.md обновить при влитии (вопрос аудиту в #2337).

Версия 1 · 20.11.2026 · ведущий верстальщик RN/Expo. Ветка `design-2344`, приложение `apps/mobile`.
Основа: `wireframes-v2.html`, `object-cards.html`, `client-card.html`, `LAYOUT-RULES.md` (П1–П10, §2–§5), `review-2026-11-21/03-constructor.md` (API шаблонов, ≈69 ч), `10-hig-check.md`.
Сверено с кодом: `src/ui/surfaces.tsx` (`Screen`, 998 строк), `src/nav/sections.ts`, `tabBarRule.ts`, `TabBar.tsx`, `Fab.tsx`, `HomeHeader.tsx`, `features/PlanParts.tsx`, `features/boards.tsx`, `features/showcase/registry.ts`.

## 0. Решения, принятые для прототипа (и что из них следует в коде)
| Решение | Что сейчас в коде | Что меняем |
|---|---|---|
| Вкладки: Главная · План · Клиенты · Деньги · Лиды | `SECTIONS`: home, plan, clients, finance, **search** (`tab: true`, #2348) | `search.tab = false`, `leads.tab = true`; порядок вкладок — отдельным полем `tabOrder`, а не порядком меню |
| Поиск — значок в шапке | вкладка `search` → `app/search.tsx` | значок `search` в шапке каждой вкладки → `/search` (экран остаётся) |
| «＋» в шапке, меню | `Fab` `placement="float"` (жёлтый на Главной), `FabSheet` — шторка; списки — «＋» в шапке (`LIST_FABS`) | везде `placement="header"`; вместо шторки — `Menu` у кнопки (как `estimates.tsx`); плавающего «＋» нет |
| Gutters: «Замеры» вместо «Плана» только при модуле | `MODULE_TAB_REPLACES = "plan"`, `moduleTabs()` в `TabBar` | оставить; проверить подпись и тест без модуля |
| «Назад» вверху слева | `Screen.back` + `BackSwipe` | не менять; сторож — у объектов нет `back` внизу |
| Главная кнопка объекта закреплена внизу, вкладок на объекте нет | `client/[id]`, `job/[id]`, `visit/[id]`, `lead/[id]`, `property/[id]` в `WITH_TAB_BAR`; `Screen` гасит `footer` там, где есть панель (`footerOn = … && !showsTabBar`) | перенести эти 5 маршрутов в `NO_TAB_BAR` и `NOT_A_FORM` (как `invoice/[id]`, #1474) — путь (а) из 03 §2.2, новой геометрии не нужно |
| Палитра A | уже в `packages/design-tokens` | не трогать цвета; добавить только размеры (§1, поток А) |

Отличие от 03: `ObjectScreen.mainPlacement` убираем — у объекта кнопка всегда `pinned` (решение выше). Пункт 03 §2.1 закрыт: «＋» в шапке, плавающего нет нигде.

## 1. Волна 1 — общие компоненты (4 потока, файлы не пересекаются)
**Общие типы** (`src/ui/templates/types.ts`, поток А, первым коммитом — до него остальные пишут по этому тексту):
```ts
type MainAction   = { label: string; onPress: () => void; reason?: string; disabled?: boolean; testID: string };
type IconAction   = { icon: IconKey; a11y: string; onPress: () => void; testID: string };   // a11y обязателен (П6)
type CreateAction = { a11y: string; items: MenuItem<string>[] };                         // «＋» в шапке → Menu
type MoreAction   = MenuItem<string>[];                                                  // «⋯»; danger — Menu спрашивает сам
```

### Поток А «Каркас» — единственный владелец конфликтных файлов (≈12 ч)
Файлы: `packages/design-tokens/src/index.ts`, `design/naryad-ds/tokens/*.css`, `src/ui/surfaces.tsx`, `src/ui/templates/types.ts`, `src/features/showcase/registry.ts`, `design/naryad-ds/DESIGN-SYSTEM.md`, `test/designSystem.test.ts` (только списки исключений/ожидания).
- Токены: `component.dayPill {w, h, dot}`, `component.iconRow {gap}`, `component.mainStep {reasonGap}`, `component.headerIcon` (круг значка шапки = `dockBtn`); зеркало в CSS до зелёного `mirror.test.ts`. Размер кнопки (03 §2.10: «40» в LAYOUT-RULES против правила 3 «36») — **в прототипе 36**, расхождение — вопросом в #2337.
- `Screen`: (1) `fab` на телефоне рисуется в шапке (`placement="header"`), ветка `floatFab` остаётся мёртвой до удаления в волне 2; (2) новый проп `headerIcons?: IconAction[]` (поиск, колокольчик) слева от «＋»; (3) `footer` и `tabs/tabsMini` не трогаем — шаблоны их прокидывают.
- Регистрация в витрине: потоки Б–Г присылают список экспортов и файл своего раздела; А вписывает их в `registry.ts` одним коммитом в конце волны («сборка волны 1», 1 ч).

### Поток Б «Шапка объекта и действия» (≈10 ч) — новые файлы
| Файл | API |
|---|---|
| `src/ui/objectHeader.tsx` | `ObjectHeader({ title, meta: MetaPart[] /* «статус · сумма» через MetaLine */, status?: {name; label}, address?: {text; onPress} /* → маршрут */, link?: {label; onPress} /* «Клиент ›» */, avatar?: string, testID })` — имя один раз (П7) |
| `src/ui/iconRow.tsx` | `IconRow({ actions: IconAction[] /* ≤ 5, dev-проверка */, testID })` — ряд `IconButton` 44, замена `features/ActionTile` |
| `src/ui/mainStep.tsx` | `MainStep({ main: MainAction, placement: "top" | "bar" })` — кнопка + причина под ней; `bar` отдаёт содержимое для `ActionBar` |
| `src/ui/summaryLine.tsx` | `SummaryLine({ items: {label; value; status?; onPress}[] })` — одна строка, хвост «…», без переноса |
| `src/ui/collapsible.tsx` | `Collapsible({ title, count?, open?, defaultOpen = false, onToggle?, children, testID })` — «Подробнее ˅», «Готово · 2 ˅», «Итого ˅» |
Плюс `src/features/showcase/ProtoObject.tsx` (раздел витрины), тесты `test/iconRow.test.ts`, `test/summaryLine.test.ts` (логика обрезки, лимит 5).

### Поток В «Список и календарь» (≈8 ч)
Файлы: `src/ui/dayStrip.tsx` (новый: перенос `DayCell`, `DayStrip`, `WeekStrip`, `stripDays` из `features/PlanParts.tsx`; в PlanParts — реэкспорт, чтобы `plan.tsx` не трогать до волны 3), `src/ui/controls.tsx` (`ChoiceChips`/`MultiChips` + `layout?: "wrap" | "strip"`, `strip` = `ScrollView horizontal`), `src/ui/listCard.tsx` (только если нужен ведущий «аватар-инициалы» — проверить `CardLead`, вероятно уже есть), `src/features/PlanParts.tsx` (только вырезать перенесённое), `src/features/showcase/ProtoLists.tsx`, `test/dayStrip.test.ts`.
API: `DayStrip({ days: DayKey[], date, loads: Map<DayKey, DayLoad>, onPick, testID })` — выбранный залит `acc`, точка `dayPill.dot` = «в дне что-то есть».
`swipeRow.tsx`, `viewTabs.tsx`, `pairs.tsx`, `actionBar.tsx`, `overlays.tsx` — **не меняются** (хватает текущих API).

### Поток Г «Шаблоны» (≈12 ч; стартует на заглушках Б/В, доводится после них)
Файлы: `src/ui/templates/{OverviewScreen,ListScreen,ObjectScreen,EditorScreen,CalendarScreen}.tsx`, `src/features/showcase/ProtoTemplates.tsx`, `test/screenTemplates.test.ts` (уровень А из 03 §4: карта маршрут → шаблон; пока заполнена только витриной).
| Шаблон | Пропсы |
|---|---|
| `OverviewScreen` | `title, headerIcons, create: CreateAction, next: {card: ReactNode; main: MainAction}, attention: {rows: ReactNode[]; allHref}` (≤ 3), `summary: SummaryItem[]`, `details?: ReactNode` (в `Collapsible`) |
| `ListScreen<T>` | `title, count?, headerIcons, create, search: {placeholder; value; onChange}, chips?: ChipItem[]` (`layout="strip"`), `filters?: ReactNode` (шторка `FilterBar`), `groups: {key; title; rows: T[]}[]`, `renderCard: (t) => ListCardProps`, `swipe?: (t) => {left?: SwipeAction; right?: SwipeAction}`, `more?`, `empty: ReactNode` |
| `ObjectScreen<S>` | `header: ObjectHeaderProps, actions: IconAction[], main?: MainAction` (всегда в `ActionBar` внизу), `second?: ButtonProps, sections: {key: S; label; count?}[], section: S, onSection, children, more: MoreAction, create?: CreateAction, back` |
| `EditorScreen` | `title, save: MainAction, second?, summary?: ReactNode, children` (`FieldGroup`/`FieldRow`), `more?, dirty: boolean, back` |
| `CalendarScreen` | `title, headerIcons, create, views: ReactNode` (`Segmented`), `days, day, onDay, loads, unassigned?: {count; onAssign}, items: ReactNode[], undated?: {count; href}` |
Правило внутри шаблонов: `ViewTabs`, `ActionBar`, `SwipeRow`, `Screen.tabs/tabsMini/footer` только прокидываются; `items` полосы мемоизированы (03 §2.5).

## 2. Волна 2 — навигация (один поток Д, ≈10 ч; после сборки волны 1)
Файлы: `src/nav/sections.ts`, `src/nav/tabBarRule.ts`, `src/nav/TabBar.tsx`, `src/nav/Fab.tsx`, `src/nav/HomeHeader.tsx`, `src/nav/SearchEntry.tsx`, новый `src/nav/HeaderIcons.tsx`, `src/app/(tabs)/_layout.tsx`, `src/ui/surfaces.tsx` (**только** удаление ветки `floatFab` — файл передаёт поток А после волны 1), `src/i18n/*` (блок `nav.*`), тесты `test/sections.test.ts`, `tabBarRule.test.ts`, `fab.test.ts`, `roles.test.ts`, `routeRoles.test.ts`, `backSwipe.test.ts`, `breadcrumbs.test.ts`.
1. Вкладки: `search.tab=false`, `leads.tab=true`, `tabOrder` → Главная · План · Клиенты · Деньги · Лиды. Субподрядчику лиды не видны (`noSub`) — у него 4 вкладки; тест на это.
2. Gutters: `MODULE_TAB_REPLACES = "plan"` оставить; тесты «модуль включён → Замеры на месте Плана, План в меню аватара», «выключен → План».
3. «＋»: `Fab` → `placement="header"` всегда; `FabSheet` заменить на `Menu` у кнопки (`measureInWindow`, как `estimates.tsx`). Нативное системное меню iOS (`UIMenu`) требует новой зависимости (`@expo/ui` или аналог, правило 17) и сборки в магазин — **в прототипе не делаем**, задача «после-прототипа».
4. Поиск: `HeaderIcons` = поиск + колокольчик (из `HomeHeader`) + аватар; на всех вкладках, `testID="hdr-search"`.
5. Объекты без панели: `client/[id]`, `job/[id]`, `visit/[id]`, `lead/[id]`, `property/[id]` → `NO_TAB_BAR` и `NOT_A_FORM`.

## 3. Волна 3 — экраны (по исполнителю на группу; не больше трёх одновременно — CLAUDE.md «Зоны»)
| Исп. | Экраны (шаблон) | Файлы — только эти | Ч |
|---|---|---|---|
| Э1 | Главная (Обзор), «Мой день» мастера | `app/(tabs)/index.tsx`, `today.tsx`, `visits.tsx`, `features/AttentionCards.tsx`, `features/SetupCards.tsx` | 5 |
| Э2 | План (Календарь) | `app/(tabs)/plan.tsx`, `features/PlanParts.tsx`, `features/EventForm.tsx` | 5 |
| Э3 | Клиенты (Список), Клиент (Объект), Новый клиент (Редактор) | `app/(tabs)/clients.tsx`, `app/client/[id].tsx`, `app/client/edit.tsx`, `features/client/{ClientCard,ClientSections,ClientSheets,nextStep}.tsx/ts` | 7 |
| Э4 | Работа, Выезд (Объект) | `app/job/[id].tsx`, `app/visit/[id].tsx`, `features/VisitForm.tsx`, `features/VisitChecklist.tsx` | 7 |
| Э5 | Деньги: Сметы/Счета/Оплаты (Список), Счёт (Объект) | `app/estimates.tsx`, `app/invoice/index.tsx`, `app/invoice/[id].tsx`, `app/payments/index.tsx`, `features/moneyTabs.tsx`, `features/boards.tsx`, `features/invoice/*` | 6 |
| Э6 | Смета (Редактор + просмотр) | `app/estimate/new.tsx`, `app/estimate/[id].tsx`, `features/EstimateView.tsx`, `features/EstimateCard.tsx` | 6 |
| Э7 | Лиды (Список), Лид (Объект), Задачи (Список), Поиск (Список) | `app/(tabs)/leads.tsx`, `app/lead/[id].tsx`, `app/lead/new.tsx`, `app/tasks.tsx`, `app/search.tsx` | 6 |
Запреты волны 3: `src/ui/**`, `src/nav/**`, `design-tokens`, `features/attention.ts`, `src/data/**`, `features/RelatedBlock.tsx` и `PhotoStrip.tsx` (общие для Э3/Э4/Э5) — не трогать; не хватает компонента — заявка потоку А, он делает отдельным коммитом. `EstimatesBoard` из `boards.tsx` зовут `job/[id]` и `property/[id]` — Э5 не меняет его пропсы. Ключи i18n — свой блок с префиксом экрана (`proto.home.*`, `proto.plan.*` …).
Порядок раундов (по 3): **Р1** Э3, Э4, Э5 (объекты — главная новизна) → **Р2** Э1, Э2, Э7 → **Р3** Э6 (самый большой файл, 1342 строки).
Каждый экран: запись в карту `screenTemplates.test.ts` (через поток А — файл его) и строка «было → стало → почему» в `LAYOUT-RULES.md` §7 (собирает руководитель, исполнитель шлёт текст).

## 4. Риски и как не утонуть
1. **Натив (правило 27).** Жесты `SwipeRow` на вебе не работают: каждое действие смахивания — ещё в карточке или «⋯» (П8), иначе на вебе/820 его нет. Новых жестов в прототипе нет — только существующий `swipeRowLogic`. Перенос в Плане — шторкой, не жестом (03 §2.3).
2. **Скрытие панели на объектах.** Переход вкладка → объект → вкладка: `formsAbove()` не должен спрашивать «Выйти без сохранения?» (поэтому `NOT_A_FORM`). Проверить на iPhone: `ActionBar` над домашней полосой, клавиатура на Выезде (заметка) прячет низ, тост встаёт над `ActionBar` (`footerInset`), «назад» смахиванием от края работает.
3. **Меню «＋» в шапке** дальше от пальца (HIG-check п.1 это принимает). `Menu` у кнопки на 390 не должен уходить за правый край — `menuLayout.ts` уже считает; проверить в обеих ориентациях.
4. **`NativeTabs` / Liquid Glass** (HIG-check п.2–3) — не в прототипе: другой механизм панели ломает `useNavInsets`, `tabBarHide`, `tabGlass`; отдельная задача после показа.
5. **Веб-предпросмотр** — единственный канал показа PR; веб ≠ натив: высоты шапки и безопасных зон брать из `useNavInsets`, не числом.
6. **Тесты.** В прототипе чинить только: `test/designSystem.test.ts` (сторож, через поток А), `npx tsc --noEmit`, модульные тесты **своих** файлов (волна 2 — все тесты `src/nav`). e2e не чинить по ходу — список «на потом» (сломаются по селекторам вкладок, «＋» и панели на объектах): `59-fab-and-home-header`, `61-more-tab`, `122-tabbar-everywhere`, `134-role-switch-tabs`, `137-safe-areas`, `424-tabbar-opaque`, `434-tabs-measurements`, `216-gutters-measurements-tab`, `355-gutters-module-chrome`, `510-module-trial-over-tab`, `407-card-add-buttons`, `406-list-empty-new`, `85-property-plus`, `10-clients`, `92-client-call`, `73-property-rows`, `74-do-not-service`, `99-job-no-service-contact`, `186-visit-photo-reload`, `43-plan-waiting`, `68-plan-events`, `90-tasks`, `115-task-who`, `158-panel-debts`, `384/386/387-*-actions-menu`, `419-toast-lane`, `420-header-help-right`, `123-calls-back-more`, `91/93/94/95-*`; плюс спека `08-layouts` (`SCREENS`). Полный список — `grep` по `tab-`, `fab`, `tabbar` в `e2e/specs` при переходе из прототипа в работу.
7. **Правило 22/зоны.** Прототип — ветка показа, в `main` не вливается, пока основатель не выберет; потолок трёх исполнителей кода соблюдаем раундами.

## 5. Часы и показы основателю
| Волна | Ч | Что показать после |
|---|---|---|
| 1 — компоненты (А 12, Б 10, В 8, Г 12; параллельно ≈ 14 ч по календарю) | 42 | Витрина → раздел «Шаблоны»: пять шаблонов на демо-данных, обе темы, 390/820/1280; шапка объекта, ряд значков, полоса дней, чипы одной полосой |
| 2 — навигация | 10 | Живое приложение: вкладки Главная · План · Клиенты · Деньги · Лиды, поиск значком, «＋» меню в шапке, объекты без панели с кнопкой внизу (на старых экранах), «Замеры» у компании с Gutters |
| 3 — экраны (Р1 20, Р2 16, Р3 6) | 42 | После Р1: Клиент, Работа, Выезд, Счёт, Деньги; после Р2: Главная, План, Лиды, Задачи, Поиск; после Р3: Смета — весь путь «лид → смета → работа → выезд → счёт» |
| Сводка: тесты своих файлов, tsc, сторож, снимки было/стало | 6 | Сравнение с каркасами v2 по экранам |
| **Итого** | **≈ 100** | против 69 в 03: +10 навигация, +8 объекты с закреплённой кнопкой и Лид/Поиск/Мой день, +13 потоки и сборка витрины; минус сторож уровня Б/В (после прототипа) |
