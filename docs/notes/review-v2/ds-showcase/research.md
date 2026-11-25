# Как лучшие дизайн-системы организуют навигацию — для витрины в приложении

Дата: 23.11.2026. Метки: [В] — проверено выборкой страницы; [П] — по памяти/поиску, страница не отдала текст (Apple и M3 рисуются скриптом, часть данных взята из их JSON и поиска).

## 1. Таблица: система → верхние группы → группировка компонентов

| Система | Верхние группы по порядку | Группировка компонентов |
|---|---|---|
| Apple HIG [В, JSON сайта] | Getting started → Foundations → Patterns → Components → Inputs → Technologies | 8 групп по роли: Content, Layout and organization, Menus and actions, Navigation and search, Presentation, Selection and input, Status, System experiences. Пример: Menus and actions = Buttons, Context menus, Menus, Pop-up/Pull-down buttons, Toolbars… (12); Selection and input = Pickers, Segmented controls, Sliders, Steppers, Text fields, Toggles… (11); Layout = Boxes, Collections, Lists and tables, Tab views… (10) |
| Apple Foundations [В] | 18 тем плоским списком: Accessibility, App icons, Branding, Color, Dark Mode, Icons, Images, Inclusion, Layout, Materials, Motion, Privacy, RTL, SF Symbols, Typography, Writing… | — |
| Apple Patterns [В] | 25 тем по задаче пользователя: Entering data, Feedback, Loading, Modality, Onboarding, Searching, Settings, Undo and redo, Playing haptics… | — |
| Material 3 [П + поиск] | Foundations → Styles (color, typography, elevation, motion, shape, icons) → Components → Develop | 6 групп по назначению: Actions (buttons, FAB, icon/segmented buttons), Communication (badges, progress, snackbar), Containment (cards, dialogs, sheets, carousel, lists, divider, tooltip), Navigation (bars, drawer, rail, tabs, top/bottom app bar), Selection (checkbox, chips, date/time pickers, menus, radio, sliders, switch), Text inputs (text field) |
| Shopify Polaris [П; старый сайт переехал на shopify.dev] | Getting started → Foundations → Design (color, typography, space…) → Tokens → Patterns → Components → Icons | Категории по назначению: Actions, Layout and structure, Selection and input, Images and icons, Feedback indicators, Typography, Navigation, Overlays, Tables, Utilities, Deprecated |
| Atlassian [В] | Get started → Foundations → Components → Rovo UI → Tools → Release phases → Contact us | 14 групп: Forms and input, Images and icons, Labels, Layout and structure, Loading, Messaging, Navigation, Overlays and layering, Status indicators, Text and data display, Primitives, Libraries, Tooling, **Deprecated** (отдельная группа в конце) |
| IBM Carbon [В] | Шапка: Foundations, Implementation, Practices, Community. Сайдбар: Getting started → Building blocks (Foundations, Components, Patterns, Data visualization) → Building experiences → Support | Компоненты — один плоский алфавитный список (~41–50), без категорий и фильтров; поверх — вкладки Components / Accessibility status / Feature flags |
| GitHub Primer (Product UI) [В] | Getting started (Component status, Foundations) → Primitives → UI Patterns → Scenario Patterns → Components → Internal Components → React Hooks → CSS Utilities → Contribute | Компоненты алфавитом (ActionBar … UnderlinePanels); **Internal Components** — отдельная группа после публичных |
| Storybook (конвенция) [В] | Introduction → Foundations → Components → Patterns → Pages (порядок задаётся `storySort.order`) | Иерархия Category / Folder / Component / Docs / Story через «/» в `title`; корень — неразворачиваемый заголовок капсом |

Наблюдение: «Основа → Компоненты → Шаблоны/паттерны» есть почти везде. Различается только способ группировки компонентов: по назначению (Apple, M3, Polaris, Atlassian) или алфавитом (Carbon, Primer). У крупных систем с 40+ компонентов по назначению; плоский алфавит держится только на поиске.

## 2. Статусы: экспериментальные, бета, устаревшие

| Система | Что делают |
|---|---|
| Atlassian [В] | Метки рядом с именем в левом меню: **Beta**, **Early access**, **Caution**, **Deprecated**; есть страница «Release phases»; устаревшее — отдельная группа Deprecated в конце. Рабочая метка в строке навигации, а не отдельная зона |
| Primer [В] | Статусы Draft / Experimental / Alpha / Beta / Stable / Deprecated; страница «Component status»; на странице компонента — бейдж статуса по платформам (React: ready, Rails: ready) + ссылки Storybook/Source/Figma. Internal Components — отдельная группа |
| Carbon [В] | Метка «Stable» + дата «Last updated» на странице; вкладка «Feature flags» для экспериментальных; вкладка «Accessibility status» — сводка по всем компонентам |
| Storybook [В] | Теги (experimental, stable, deprecated — любые строки) на уровне проекта/компонента/истории; фильтр в сайдбаре; `defaultFilterSelection: exclude` прячет тег по умолчанию |
| Apple / M3 | Бета-раздела нет; новое появляется в тех же группах с отметкой «New» в журнале изменений |

Вывод: почти все ставят **метку статуса рядом с названием** в том же списке, а устаревшее убирают вниз/в отдельную группу. Отдельная «зона пилотов» есть только у Primer (Internal) и Atlassian (Deprecated, Libraries).

## 3. Структура страницы компонента

| Система | Блоки по порядку |
|---|---|
| Carbon Button [В] | Вкладки: Guidelines · Specifications · Code · Accessibility. Guidelines: **Live demo** → Overview (When to use / When not to use / Variants) → Formatting (anatomy, sizes, alignment, groups) → Content → Universal behaviors (states, interactions, loading) → по видам (primary, secondary, danger…) → Modifiers → Related → References → Feedback. Do/Don't — подписи к картинкам внутри разделов |
| Atlassian Button [В] | Вкладки: Examples · Code · Usage · Changelog. Examples: Default → Appearance (по видам) → States (Disabled/Selected/Loading) → Spacing → Full width → With icon → Truncation |
| Primer Button [В] | Хлебные крошки → заголовок + 1 строка описания → бейджи статуса и ссылки → вкладки Overview · Guidelines · Accessibility → React examples (Default, Style variants, Sizes, With visual, Loading, Inactive) → Props → «На этой странице» |
| Material 3 [П] | Вкладки Overview · Specs · Guidelines · Accessibility; Overview — карточки видов, Guidelines — Anatomy, Usage, States |
| Apple HIG [П] | Одна длинная страница: введение с картинкой → Best practices (Do/Don't списком) → Content → Platform considerations (iOS, iPadOS, macOS…) → Resources → Related |
| Storybook [В] | «Docs + Canvas»: Docs (автостраница: описание, примеры, таблица Controls) и Canvas (одна история с панелью Controls/args) |

Общее: первым идёт **живой пример**; затем виды (variants); затем состояния; затем «когда использовать / не использовать»; доступность и код — вынесены во вкладки/в конец. Do/Don't — парами «картинка + подпись».

## 4. Поиск, фильтры, глубина

- Поиск: у всех в шапке (Atlassian, Carbon, Primer) [В]; фильтров по категориям нет у Carbon и Primer, фильтр по тегам — в Storybook [В].
- Глубина: Apple 3 уровня (раздел → группа → страница); M3 3 (раздел → группа → компонент); Atlassian 2–3 (раздел → группа → компонент); Carbon/Primer 2 (раздел → компонент); Storybook до 5 по документации, на практике 2–3.
- Именование: Apple и M3 — по **функции/назначению** (Menus and actions, Selection and input, Communication, Containment); Carbon и Primer — **по имени компонента**; Atlassian — смесь («Forms and input», «Status indicators»). Паттерны Apple — по **намерению** («Entering data», «Feedback», «Undo and redo»).

## 5. Рекомендуемый порядок для витрины GoRix

Общий вывод из таблиц: сначала то, из чего всё сделано (токены), потом строительные блоки по назначению, потом готовые сборки, потом зависимые от ниши модули, в самом конце неготовое.

1. **Основа** — Цвет · Типографика · Размеры и сетка · Радиусы и тени · Иконки · Анимации и вибрация · Тёмная/светлая тема (по Apple Foundations, M3 Styles; 7–8 строк).
2. **Компоненты (по назначению)** — Действия (кнопки, меню действий) · Ввод и выбор (поля, переключатели, пикеры, сегменты) · Списки и карточки (GroupedList/ListGroup/GroupRow, Card) · Статусы и сообщения (метки статуса, тосты «Вернуть», баннеры, пустые состояния, загрузка) · Окна и шторки · Навигация (нижняя панель, шапка, вкладки). По 6 групп, как у M3.
3. **Шаблоны экранов** — список с поиском, карточка объекта, форма, редактор сметы (ActionBar), документ/PDF клиенту. Это «Patterns» Apple и Carbon.
4. **Модули** — Gutters (рулетка, холст) и далее; отдельно от ядра, как правило «ничего gutter-специфичного в ядре».
5. **Пилоты и черновики** — «Графит» и другое под флагом; в конце, с меткой статуса.

## 6. Шаблон страницы раздела для телефона

Один экран = один раздел/компонент, сверху вниз:

1. Заголовок + одна строка «зачем» + метка статуса (если не «Стабильно»).
2. **Живой образец** в рамке (первый экран, до прокрутки) — как Carbon «Live demo», Atlassian «Default».
3. **Виды** — горизонтальная лента или строки «название — образец» (Atlassian Appearance).
4. **Состояния** — переключатель Обычное / Нажато / Выключено / Загрузка / Ошибка над одним образцом, а не пять копий (Atlassian States).
5. **Темы и ширины** — переключатель Светлая/Тёмная и 390/820/1280 на образце.
6. **Когда использовать / не использовать** — 2–3 пары «Да / Нет» (Apple Best practices, Carbon).
7. **Где используется** — 3–5 ссылок на реальные экраны (чего нет у образцов — наше преимущество).
8. **Доступность и размеры** — зона нажатия 44, контраст, подпись «значок + слово».
9. **Правило** — ссылка «Правило: DESIGN-SYSTEM.md §N» (как «Related/References» у Carbon) и «Токены» — список использованных токенов.

Блоки 6–9 свёрнуты по умолчанию (раскрывающиеся секции), чтобы первый экран был образцом.

## 7. Правила для витрины размером с телефон (8–10)

1. **Глубина не более 3**: Главная витрины → Группа → Страница компонента. Четвёртого уровня нет (Apple и M3 держат 3).
2. **На главной — 5 разделов** (Основа, Компоненты, Шаблоны, Модули, Пилоты), каждый строкой с числом внутри; не плоский список из 40 пунктов.
3. **В группе — не более 10–12 строк** (у Apple максимум 12 в «Menus and actions»); больше — делим по назначению, как M3 (6 групп вместо одного списка).
4. **Названия групп — по назначению пользователя** («Ввод и выбор», «Статусы и сообщения»), а не по имени компонента; внутри группы — имя компонента как в коде. Паттерны — по задаче («Ввод данных», «Отмена и возврат»).
5. **Метка статуса — слово + значок в самой строке** (Стабильно скрыто, показывать только «Бета», «Черновик», «Устарело») — как Atlassian; цвет только по правилу 2 (информ/внимание). Устаревшее — последней группой внутри раздела.
6. **Пилоты и черновики — отдельный раздел в конце**, не вперемешку с компонентами (Primer Internal, Atlassian Deprecated); вход с пометкой «под флагом».
7. **Живой образец — на первом экране страницы**, без текста выше него, кроме одной строки описания.
8. **Виды и состояния — одним переключателем над одним образцом**, не стопкой копий; на телефоне горизонтальные сегменты (до 5 пунктов), иначе список.
9. **Поиск — один на главной витрины** (по названию и по «что делает»: «выбрать значение» → пикер); фильтр по статусу — чипы «Все / Бета / Черновик». На странице внутри раздела поиск не нужен.
10. **Каждая страница ссылается на правило** в DESIGN-SYSTEM.md (и обратно: правило без образца — красный сторож), плюс «Где используется» — реальные экраны.
11. (запасное) Порядок внутри группы — по частоте использования, а не по алфавиту; алфавит только при >12 строк и поиске (Carbon/Primer идут алфавитом лишь потому, что без категорий).

## 8. Ограничения исследования

- Apple (JSON сайта: Foundations, Patterns, группы компонентов, 3 группы с составом) — проверено. Состав остальных групп Apple и «Inputs/Technologies» не снимал.
- M3: страницы не отдали текст (нужен скрипт); состав 6 групп — из поиска по документации Android, вкладки страницы компонента — по описанию.
- Polaris переехал на shopify.dev (301), старый сайт не открылся; данные по нему — по памяти, помечены [П].
- Определения статусов Primer и Atlassian («Release phases») не получены — страницы отдали пусто.

## 9. Источники

- Apple HIG: https://developer.apple.com/design/human-interface-guidelines/ ; данные: https://developer.apple.com/tutorials/data/design/human-interface-guidelines.json , …/foundations.json , …/patterns.json , …/components.json , …/menus-and-actions.json , …/selection-and-input.json , …/layout-and-organization.json
- Material Design 3: https://m3.material.io/components ; https://m3.material.io/components/all-buttons ; обзор групп: https://developer.android.com/design/ui/mobile/guides/components/material-overview
- Shopify Polaris: https://polaris-react.shopify.com/ → https://shopify.dev/docs/api/polaris
- Atlassian: https://atlassian.design/components ; https://atlassian.design/components/button/examples ; https://atlassian.design/get-started/release-phases
- IBM Carbon: https://carbondesignsystem.com/components/overview/components/ ; https://carbondesignsystem.com/components/button/usage/
- GitHub Primer: https://primer.style/product/components/ ; https://primer.style/product/components/button/ ; https://primer.style/product/getting-started/
- Storybook: https://storybook.js.org/docs/writing-docs ; https://storybook.js.org/docs/writing-stories/naming-components-and-hierarchy ; https://storybook.js.org/docs/writing-stories/tags
