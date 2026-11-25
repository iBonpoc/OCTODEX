# Инвентаризация селекторов GoRix (выбор значения)

Источник: `~/GoRix/wt-2412/apps/mobile/src` (коммит a2435d4, в чекауте лежат чужие правки: `ui/overlays.tsx`, `ui/templates/screenHeader.tsx` и временный `app/mockq10.tsx`).
Счёт: `src/app`, `src/features`, `src/modules`, без витрины `features/showcase` и без `app/mockq10.tsx` (временный мок #2412, не в коммите; там ещё 12 SelectField, 4 Stepper и т.д.).
Правила: DS §9 (А1–А16), §10, §20 в `design/naryad-ds/DESIGN-SYSTEM.md`.

## 1. Компоненты выбора

| Компонент | Файл | Вид поля | Что открывается | Значок / swatch / подзаголовок | Поиск / лимит |
|---|---|---|---|---|---|
| `SelectField` | ui/selectField.tsx | Рамочное поле 44: подпись слева, значение `mut` справа, ⌄. С `labelAbove` подпись над полем, внутри только значение. Ошибка строкой под полем | до 12 пунктов: `Menu` под строкой (matchWidth, галочка у выбранного); больше 12 (`MENU_MAX`): `PickerSheet`; с `onOpen` — шторка владельца | Значка и swatch нет; в пункте только текст. Подзаголовок только в `PickerSheet` | Поиска в меню нет; 13+ — шторка с поиском |
| `Menu` | ui/overlays.tsx | Не поле, а всплывающее окно у якоря (`anchor` = measureInWindow) | Окно под/над кнопкой | В `MenuItem`: `icon`, `selected`, `destructive`, `dim`, `group`. Swatch нет | Лимит высоты 6,5 строк, дальше прокрутка. Поиска нет |
| `Sheet` | ui/overlays.tsx | Нижняя шторка (основа PickerSheet, OptionRows в формах) | Снизу | любое содержимое | — |
| `PickerSheet` | ui/pickerSheet.tsx | Шторка `large` с поиском сверху, строки `ListRow` с галочкой | Нижняя шторка | `subtitle` (адрес, цена); значка и swatch нет | Поиск всегда. Только выбор одного (`multiple` из DS А3/А4 в коде нет) |
| `OptionRow` / `OptionRows` | ui/optionRow.tsx | Строка 48: значок слева (опц.), название, подзаголовок, ✓ справа | Постоянно на месте (внутри шторки, не поле) | `icon`, `subtitle`; swatch нет | 2–12; есть `multiple` |
| `OptionTiles` | ui/optionTile.tsx | 2–3 плитки значок + слово + действие | На месте | значок обязателен | 2–3 |
| `Segmented` | ui/controls.tsx | Сегмент в одну линию (ползунок), `scroll`, `radio`, `full`, `equal` | На месте | только текст | 2–3 коротких (DS), в коде бывает больше |
| `ChoiceChips` | ui/controls.tsx | Без `label`: старые чипы-пилюли с переносом строк. С `label`: превращается в `Segmented radio` (если влезает, `fitsSegment`) или в `SelectField`. `layout="strip"` — одна лента с прокруткой | На месте / меню | только текст | любое. Сторож `chipsLabel.test.ts`: без `label` только сокращать |
| `MultiChips` | ui/controls.tsx | Чипы «несколько», тот же вид | На месте | текст | DS это запрещает (А4) |
| `Stepper` | ui/controls.tsx | Строка: подпись слева, −, число, + (кнопки 36, зона 44) | На месте | `unit` | `min`/`max` |
| `Toggle` / `ToggleRow` | ui/controls.tsx, ui/toggleRow.tsx | Переключатель; в строке подпись + пояснение, вся строка нажимается | На месте | — | вкл/выкл |
| `DateField` | ui/dateField.tsx | Поле по образцу SelectField (`SelectField onOpen`) | Календарь под строкой, на месте | — | быстрые «Сегодня/Завтра», `optional` «Без даты» |
| `PctUsdField` | ui/pctUsdField.tsx | `NumberField` + сегмент «% / $» | На месте | — | 2 |
| `MultiValueField` | ui/multiValueField.tsx | Список значений с `Menu` типа (иконка + ⌄) на каждой строке | `Menu` метки (Мобильный/Домашний) | значок вида | — |
| `FilterBar` / `useFilterHeader` | ui/filterBar.tsx | Поиск + кнопка «Фильтр» + лента статусов (1 строка, прокрутка) | Шторка фильтров | счётчики | — |
| `ViewTabs` / `ViewSteps` | ui/viewTabs.tsx | Листаемые вкладки-пилюли | На месте | число-бейдж | 4+ вкладок |
| `FracKeys` | ui/fracKeys.tsx | Кнопки долей дюйма (клавиатура рулетки) | На месте | — | — |
| `menuPick` | ui/menuPick.ts | Не компонент: логика «закрыть меню, потом выбор» (#743) | — | — | — |
| `Collapsible`, `CheckList`, `ListRow` | ui/* | Не селекторы (сворачивание, список, строка) | — | — | — |

Заметка: `swatch`/`materialSwatch` в коде нет вообще (grep по `materialSwatch` пуст). `SelectField` образцов цвета не умеет; временный мок `mockq10.tsx` сам сделал `Sel` с кружком цвета и написал «what SelectField does not have yet».

## 2. Использования (прод-экраны, без витрины и мока)

| Компонент | Всего | Где (файл:строка) | Типично пунктов | swatch / значок | Заметки |
|---|---|---|---|---|---|
| `SelectField` | 25 | catalog/[id] 117 (вид), 139 (ед.); client/edit 204 (источник); f/[token] 128 (язык), 145 (услуга); job/new 181 (адрес), 210 (тип); visit/[id] 494 (способ); EventForm 152 и VisitForm 165 (время начала); ClientSheets 133 (язык), 173 (роль); PropertySheets 80; LineRow 360 (ед.), 377 (группа) — оба `labelAbove`; SourcePicker 125; TaskSheet 163, 178, 220 (кто); gutters/prices/TransitionSheet 67 | 2–12, время и «кто» — 13+ → PickerSheet | нет | `labelAbove` только в LineRow (ряд «Кол-во · Ед. · Цена») |
| `PickerSheet` (напрямую) | 3 | estimate/new 1399 (позиция каталога), 1419 (раздел «перенести»); job/new 283 (адрес) | 10–1000 | нет | + ещё неявно через SelectField 13+ |
| `Menu` (все) | 15 | triage 148, receipt 178, EstimateCard 284, NotesBlock 87, LineRow 306 и 486, OptionsCard 157, SectionHeader 113, VoidInvoice 70, Gutters: AttrPanel 222 (единица), DrawScreen 1550, CardHead 146 и 156, ViewScreen 249 | 2–10 | иконки в пунктах | Почти все — меню действий «⋯». Меню значения вне SelectField: AttrPanel `UnitPick`, LineRow, DrawScreen |
| `Segmented` | 17 | plan 145, today 281, company/[section] 215, estimate/new 1465 и 1533, settings 43 и 56, profile 119, ContractStatement 149, EstimateCard 259 и 508, OptionsCard 94, LeadParts 397, PaySheet 194 и 213, gutters/draw/LinkSheet 82 | 2–4 | нет | вид экрана И значения в форме (PaySheet — способ оплаты) |
| `ChoiceChips` без `label` | 52 | company/[section] 116 210 399; checklist/[id] 140; intake 140; schedule 78 119 124; expense/new 75; purchase-order/[id] 144; settings 83; suppliers/[id] 132; team 139 152; EventForm 131 136; ServiceCategoryPicker 95; VisitForm 222; CallSheet 107 111; MessageSheet 134 143 154; estimatePickers 42; LeadCard 294; LeadParts 227 310 407; LeadSheets 143 216; RefundSheet 153; gutters AttrPanel 70 (`Pick`, 14 мест) 351 (`Select`) 414 621; gutters SettingsScreen 368–495 (18 мест) | 2–12+ | нет | Старые чипы, переносятся на 2–3 строки. Запрещены DS А1в, но сторож позволяет |
| `ChoiceChips` с `label` | 3 | expense/new 74 и 76; gutters/SettingsScreen 58 | 2–4 → сегмент | нет | Новый путь (→ Segmented или SelectField) |
| `ChoiceChips layout=strip` / `nowrap` | 2 | gutters/draw/FracPicker 51 и 73 | 8–16 | нет | лента долей |
| `MultiChips` | 10 | auth/trade 50; gutters/SettingsScreen 262–303 (9 мест) | 3–15 | нет | DS А4 «флажков нет», но живут |
| `OptionRows` | 9 | JobTypeTags 55 и 66; ServiceCategoryPicker 52; VisitForm 139 и 397; ClientDuplicates 85; ClientSheets 235; PropertySheets 152; features/sheets 45 | 2–12 | иногда значок / подзаголовок | единственный по-настоящему «шторочный» выбор |
| `OptionTiles` | 0 | только витрина | — | — | нет ни одного места (угол Gutters ещё не переведён) |
| `Stepper` | 23 | company/[section] 213; checklist/[id] 168 169; checklists 136 143; leads 84; schedule 62 133; EventForm 163 165; VisitForm 181; CallSheet 114; TaskSheet 211; AttrPanel 487 и 617; gutters/SettingsScreen 204 358 392 393 397 400 408 | 0–20 | unit | норм |
| `ToggleRow` | 14 | client/edit 218 229; f/[token] 163; job/new 228; JobLinesBlock 157 184; LocationParts 91; SignBlock 21; VisitChecklist 274 344; VisitForm 158; InvoiceCard 205 | 2 | нет | норм |
| `Toggle` напрямую | 33 | в `ToggleRow`/Gutters и др. | 2 | нет | в Gutters `Switch` (AttrPanel 45) — свой, рядом с `Toggle` |
| `DateField` | 2 | EventForm 145; VisitForm 122 | — | — | другие даты — `DatePick` (features/DatePick) 1 место |
| `FilterBar` | 11 | plan, catalog, job/[id], jobs, money, purchase-orders, reports, suppliers, boards, CommsScreen, MeasurementsScreen | — | счётчики | норм |
| `ViewTabs` | 1 | lead/LeadCard 317 | 5–8 | число | |
| `MultiValueField` | 4 | client/edit 159 174; ClientSheets 99 116 | — | значок | |
| `PctUsdField` | 0 | только витрина | — | — | не внедрён |

## 3. Свои пикеры в обход src/ui

| Где | Что это | Заметка |
|---|---|---|
| `modules/gutters/draw/AttrPanel.tsx:335` `Select` (10 мест: цвет 376, материал 394, калибр 395, размер 452/468/546/563, профиль 456/467, ещё 589) | Свой `Press` + `RowView` (рамка, значение, ⌄), по нажатию **раскрывает ChoiceChips на месте** (инлайн, чипы в несколько строк). `fit` — поле по ширине значка | Нарушает правило 29. Тот же тип значений, что у SelectField, но вид и поведение другие; размер/профиль/цвет/материал |
| `AttrPanel.tsx:64` `Pick` (14 мест: этаж, крепление, подвес, низ, стена, головка, редьюсер…) | `ChoiceChips` без `label` в `Field` | чипы с переносом строк, 3–8 значений |
| `AttrPanel.tsx:187` `UnitPick` | `Press` (слово + ⌄) + `Menu` | единица длины; не `SelectField` |
| `AttrPanel.tsx:45` `Switch` | подпись + `Toggle` вручную | рядом с ToggleRow ядра |
| `AttrPanel.tsx:414` Corners, `:621` Offsets | `ChoiceChips` (Как у компании / срезать / полоса / заводской; 4–12 вылетов) | |
| `gutters/settings/SettingsScreen.tsx` | 18 `ChoiceChips` + 9 `MultiChips` + 7 `Stepper` | вся настройка модуля на чипах. `MultiChips` — копия, DS обещает убрать в волне G |
| `features/CompanySwitcher.tsx:56` | `Press` «Название компании ⌄» → шторка | заголовочная кнопка, не поле |
| `modules/gutters/view/CardHead.tsx:104` | `Icon chevronDown` в заголовке + `Menu` | выбор клиента/объекта через меню |
| `features/estimate/LineRow.tsx:447` | `Press` + «Ещё ⌄» раскрывает строку | свёртка, не выбор |
| `app/mockq10.tsx:37` `Sel` | поле с кружком цвета (swatch), значение до 2 строк | временный мок, не в коммите |

Итог: «чипы как выбор» живут в 52 местах ядра и Gutters, хотя DS их запрещает (§9 А1в).

## 4. Несогласованности

1. **Один и тот же тип значения, разные компоненты.**
   - Единица: `SelectField` (catalog/[id] 139, LineRow 360); `ChoiceChips` (EventForm, schedule); `Menu`+Press (Gutters `UnitPick`).
   - Размер / профиль / материал / цвет (Gutters): свой `Select` с чипами внутри (AttrPanel); в настройках модуля те же значения — `ChoiceChips`/`MultiChips`. В ядре подобный выбор — `SelectField`. Значок цвета (`materialSwatch` из CLAUDE.md, правило 2 исключение 3) в коде не реализован.
   - Время начала: `SelectField` (EventForm 152, VisitForm 165), а «длительность» в тех же формах — `ChoiceChips` (EventForm 131/136, VisitForm 222) и `Stepper` (163/165/181).
   - Способ оплаты / тип: `Segmented` (PaySheet 194/213), `ChoiceChips` (RefundSheet 153), `SelectField` (visit method).
2. **Меню против шторки на похожей длине.** SelectField: ≤12 → меню у поля, 13+ → шторка. Но «Выбор одного из 2–12» в шторке — `OptionRows`, в форме — `SelectField`, в Gutters-панели (чипы, до 12 вариантов) — раскрывающаяся лента. Статус клиента/источник — иногда меню, иногда шторка.
3. **Вид поля.** Три разных:
   - `SelectField` — «подпись слева / значение справа ⌄»;
   - `SelectField labelAbove` (LineRow, ряд «Кол-во · Ед. · Цена») — подпись над полем;
   - Gutters `Select` — подпись над полем, значение слева без подписи в рамке, чипы под полем; высота `hitMin`, а не `fieldPhone`.
   Плюс чипы без рамки (52 места) и сегменты. Внешний вид «выбора» зависит от экрана.
4. **Чипы-сторож только сокращается, но 52 живы.** `chipsLabel.test.ts`: новый `ChoiceChips` должен быть с `label`; `Pick` в Gutters передаёт чипы без `label`, обходя автоматическое превращение в SelectField.
5. **`MultiChips` (10)** остался вопреки DS А4 «флажков нет»; `OptionRow multiple` в коде есть, но ни разу не использован прод-экраном как замена.
6. **`OptionTiles` и `PctUsdField` не внедрены**, хотя DS называет конкретные места (угол Gutters; наценка/скидка).
7. **Swatch / значок значения.** `SelectField` умеет только текст (значка, образца, подзаголовка в меню нет); подзаголовок только в шторке. Цвета материала — слова (AttrPanel шапка «Colours are words, never swatches»), что противоречит исключению 3 правила 2.
8. **`Segmented` служит и видом экрана, и значением** (PaySheet, settings, ContractStatement) — граница DS «вид или значение» размыта.
9. **`Menu` двойного смысла:** действия «⋯» и выбор значения идут одним компонентом; значение вне `SelectField` (UnitPick, DrawScreen) не имеет единой подписи/галочки.
10. **Планшет/десктоп:** DS (А3) требует поповер 360 у поля на 820+, у `PickerSheet` код — одна шторка `large` (в рамках чтения не проверял, возможно через `Sheet`).

## 5. Снимки (витрина «Дизайн-система», тёмная, 390)

Папка `inv-img/`. Снято из чекаута `~/GoRix/design-2344` (коммит e651de1, ветка docs/leader22-handover), потому что `wt-2412` не собирается: `app/mockq10.tsx` — синтаксическая ошибка (`Identifier 'text' has already been declared`, строка 124). Правок в репозитории не делалось. Сервер: `GORIX_SHOT_PORT=8095`.

| Файл | Что |
|---|---|
| `01-selectfield-menu-open.png` | SelectField: `Menu` открыт под полем «Единица», галочка у ft |
| `02-pickersheet-search.png` | PickerSheet: шторка с поиском (20 пунктов) |
| `03-selectors-top-viewtabs-selectfields.png` | витрина «Селекторы»: ViewTabs + состояния SelectField |
| `04-segmented-and-select-few-many.png` | Segmented и поле-меню для «мало / много» |
| `05-choice-optionrow-tiles-toggle.png` | «Выбор»: OptionRow (А2а), строки с галочками (А4) |
| `06-choice-lower.png` | «Выбор», ниже: плитки, ToggleRow и т.д. |

Снимка панели Gutters (AttrPanel) нет: у неё нет маршрута без рисунка и состояния (нужно рисовать участок), а `wt-2412` не собирается.
