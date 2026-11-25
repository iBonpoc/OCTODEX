# ДС v2 — полнота, оверлеи, утечки (аудит 21.11.2026)

Задача основателя 21.11 (по сути): «дизайн-систему v2 нужно обновить в начале… все токены, все сущности, все селекторы, все окна, кнопки… проверить, чтобы токены были новые и никуда не просочились… если чего-то нет — реструктуризация, рефакторинг, перевёрстка… определиться, где селекторы, где выезжающие листы, где дропдауны, где выпадающие меню… есть места, где вместо открывающегося окошка (окно-уведомление) выезжает снизу лист — продумать, исправить».

Документ только читает код ветки `design/2344-direction` (21.11.2026). Пометки: **«проверено»** — путь:строка в `apps/mobile/src/…` (если не сказано иное); **«вывод»** — решение ведущего дизайнера. Числа посчитаны `grep` по `src/app`, `src/features`, `src/nav` (ядро) и отдельно `src/modules` (Gutters, зона «в»); витрина (`features/showcase/**`) в счёт мест не входит.

Главное одной строкой (вывод): **окна-подтверждения в приложении нет вообще** — каждое «Удалить? / Отменить? / Выйти?» сделано шторкой снизу (`ConfirmSheet` и 15+ ручных копий), а `ConfirmDialog`, `InputDialog`, `Popover`, `Tooltip`, `Spinner/Skeleton`, `ActionMenu` описаны в DS, но в `src/ui` их нет. Это и есть то, что видит основатель.

---

## 0. Что есть и чего нет — короткая сводка (проверено)

| Вид | Компонент | В коде | Мест (ядро / Gutters) | В витрине |
|---|---|---|---|---|
| Шторка | `Sheet` | ✅ `ui/overlays.tsx:278` (`height: fit / medium / large`, `footer`, `onBack`, `dirty`) | 110 / 12 | ✅ «Окна» |
| Меню у элемента | `Menu` | ✅ `ui/overlays.tsx:69` | 10 / 5 | ❌ в `UI_PENDING` (`features/showcase/registry.ts:93`) |
| Поле-меню (дропдаун) | `SelectField` | ✅ `ui/selectField.tsx:21`, до `MENU_MAX` 12 | 19 / 1 | ✅ «Селекторы» |
| Длинный выбор с поиском | `PickerSheet` | ✅ `ui/pickerSheet.tsx:26` | 3 / 0 | ✅ |
| Строки выбора | `OptionRows` / `OptionTiles` | ✅ `ui/optionRow.tsx:95`, `ui/optionTile.tsx:71` | 9 / 0 | ✅ «Выбор» |
| Чипы-выбор (запрещены DS §9 А1в) | `ChoiceChips`, `MultiChips` | ✅ `ui/controls.tsx:824, 919` | 34 / 33 | ❌ `UI_PENDING` |
| Сегмент | `Segmented` | ✅ `ui/controls.tsx:268` | 15 / 1 | ✅ |
| Дата | `DateField` / `DatePick` | ✅ `ui/dateField.tsx:26` | 3 / 0 | ✅ |
| **Окно-подтверждение** | `ConfirmDialog` + `useConfirm` | ❌ **нет** (DS §10 Б3, токены `component.alertMaxW` 340 и `motion.alertScale` 1.06 есть, но не используются) | 0 | ❌ |
| Окно-подтверждение шторкой (подмена) | `ConfirmSheet` | ✅ `ui/templates/parts.tsx:43` | 2 (MoreButton, EditorScreen) + ~15 ручных | ✅ (как «правильное» — ошибка) |
| **Окно ввода** | `InputDialog` | ❌ **нет** (DS Б1а; сторож `designSystem.test.ts:85` уже ссылается на него) | 0; своё — `modules/gutters/draw/InputWindow.tsx:34` (`<Modal>`) | ❌ |
| Меню «⋯» | `MoreButton` (`MenuButton` → `Menu`) | ✅ `ui/templates/parts.tsx:79` | шапки шаблонов | ✅ |
| Поповер (от 820) | `Popover` | ❌ нет (DS Б6, токен `popoverW` 360 есть) | 0 | ❌ |
| Подсказка при наведении | `Tooltip` | ❌ нет (токен `component.tip` есть) | 0 | ❌ |
| Подсказка «?» | `HelpButton` | ✅ `ui/overlays.tsx:721` | 7 | ✅ |
| Тост «Отменить» | `ToastProvider` / `useToast` | ✅ `ui/overlays.tsx:829, 1044` | 296 вызовов `toast.show`, из них 129 с `undo` | ✅ |
| Загрузка | `Spinner` / `Skeleton` / `Button loading` | ❌ нет (только `ActivityIndicator` внутри `ui/mainStep.tsx:62`); 22 места `disabled={busy}` без индикатора | — | ❌ |
| Полноэкранный режим | `FullscreenOverlay` | ❌ нет; свои `<Modal>`: `features/SignatureFullscreen.tsx:109`, `nav/NavMenu.tsx:118` | — | ❌ |
| Модальные маршруты Expo Router | `presentation` | ❌ не используется: один `Stack` с `headerShown:false` (`app/_layout.tsx:49`); редакторы (`client/edit`, `estimate/new`, `job/new`, `lead/new`, `expense/new`) открываются обычным переходом, хотя у них шапка `editor` с «×» | — | — |

---

## 1. Правило оверлеев (вывод; по Apple HIG «Sheets», «Alerts», «Action sheets», «Menus», «Pull-down buttons», «Pop-up buttons», «Pickers», «Segmented controls», «Popovers», «Toggles» — редакции 2024–2026 — и по `visual-v2.html`)

### 1.1. Главный тест — четыре вопроса по порядку
1. **Нужен ответ «да / нет» на шаг, который человек уже начал, и шаг нельзя вернуть?** → окно-подтверждение по центру (`ConfirmDialog`). Не шторка.
2. **Нужно выбрать одно действие или одно значение из короткого списка (≤ 7) у того, на что нажали?** → меню у элемента (`Menu`: «⋯», «＋», поле-меню `SelectField`). Не шторка.
3. **Нужно что-то заполнить, выбрать из длинного списка, просмотреть подробности — задача на 5–30 секунд, после которой вернёмся туда же?** → шторка снизу (`Sheet`) нужной высоты.
4. **Задача дольше, полей больше 6, нужны вложенные объекты или черновик?** → полноэкранный редактор (отдельный маршрут, модальное появление).
Всё обратимое — без вопроса: сразу и тост «Отменить» 5 с (правило 5).

### 1.2. Каждый вид: когда, когда нельзя, пример

| Вид | Применять | Нельзя | Пример GoRix | Компонент, числа v2 |
|---|---|---|---|---|
| **Шторка `fit`** (по содержимому, ≤ 0,88 экрана) | короткая форма 1 экрана, информация с действием, выбор с описаниями | вопрос да/нет; выбор действия из ≤ 7 у кнопки; одно значение с клавиатурой | «Принять оплату», «С чего начать?», «Списать в долг» | `Sheet` · радиус 28, ручка 36 × 5, строка шапки 52: заголовок 22/700 + «×» 32, фон `ovSolid` #2C2E33, вуаль 50 % |
| **Шторка `medium`** (½, тянется до `large`) | список, который смотрят и из которого берут (журнал звонков, «Не назначено · N») | форма с клавиатурой (прыгает) | «Без даты · N» на Плане, «Компании» | `Sheet height="medium"` (`sheetMediumRatio` 0,5) |
| **Шторка `large`** | выбор из длинного списка с поиском; форма ≤ 6 полей с клавиатурой | всё короткое | позиция каталога, клиент для сметы, мастер | `PickerSheet`, `Sheet height="large"` |
| **Полноэкранный редактор** | > 6 полей, группы, черновик, вложенные объекты, нужен адрес | короткая правка одного поля | новая смета, клиент, работа, лид, расход | `EditorScreen` (шапка 52: «×» · заголовок 17/700 · «⋯»), маршрут с `presentation: "fullScreenModal"` на iOS (вывод, §5 шаг 7) |
| **Меню у элемента** (pull-down) | «⋯» объекта; «＋» создания; вид экрана «Неделя ⌄»; ≤ 7 пунктов, до 3 групп | выбор, после которого нужна форма из нескольких полей; > 12 пунктов | «⋯» сметы: Изменить · PDF · Поделиться · В архив · Удалить | `Menu` · ширина `menuW` 240, до `menuMaxRows` 6,5 строки, опасное — последней группой красным словом |
| **Поле-меню** (pop-up, дропдаун) | сохраняемое значение формы из 2–12 | навигация; > 12 значений (→ `PickerSheet`) | «Тема · Как в системе ⌄», «Роль», «Ответственный» | `SelectField` |
| **Контекстное меню** (долгое нажатие) | быстрые действия над строкой списка — дубль «⋯», не единственный путь | кнопки, поля, строки сметы (там долгое нажатие — перетаскивание) | строка сметы в «Сметах»: Дублировать · Отправить · Удалить | `Menu` у пальца (`motion.longPressMs` 500) |
| **Сегмент** | **вид** экрана или шторки: 2–3 коротких слова, вверху, до содержимого | сохраняемое значение (тема, язык, роль, способ оплаты, «% / $») | «Сегодня · Неделя · Месяц», «Сметы · Счета · Оплаты» | `Segmented` · 36, `pad` 3, текст 13/600; жёлтый только `accent` (одна заливка экрана) |
| **Строки выбора** | главный вопрос шторки: одно или несколько из 3–12 с подписями | значение поля формы (→ `SelectField`) | причина отмены, теги работы, ответственный | `OptionRows` (одно — нажатие выбирает и закрывает; несколько — «Готово · N») |
| **Плитки выбора** | одно из 2–3 + сразу действие, крупно | > 3 | «Наличными · Картой · Чеком» в оплате | `OptionTiles` |
| **Переключатель** | да / нет, применяется сразу | два названных значения | «Уведомлять клиента» | `ToggleRow` |
| **Колесо / календарь** | дата, время, длительность | число, цена | дата выезда, время начала | `DateField` (быстрые «Сегодня · Завтра» + календарь); время — колесо iOS (⬜ `TimeField`) |
| **Чипы** | **только фильтр списка** (`FilterBar`) и строка фактов (`MetaLine`) | выбор значения формы (DS §9 А1в, слово основателя 11.11 и 16.11) | фильтр «Все · Черновики · Отправлены» | `FilterBar` |
| **Окно-подтверждение** (alert / confirmation dialog) | необратимое и редкое: удалить навсегда, отменить заказ, отправить клиенту, деньги, сменить ключ, выйти с потерей, уйти с несохранённым | обратимое (→ тост), подтверждение «на всякий случай», уведомление без выбора (→ тост или баннер) | «Удалить черновик сметы?» · «Не удалять» / «Удалить» | `ConfirmDialog` ⬜ · по центру, `Glass strong`, ширина `min(экран − 48, alertMaxW 340)`, заголовок-вопрос `heading`, текст `body mut`, ≤ 3 кнопки; фон не закрывает |
| **Окно с выбором из 2–3 исходов** (confirmation dialog iOS) | после начатого действия нужно выбрать, как продолжить | больше 3 исходов (→ шторка действий) | «Выйти? · Подождать отправки / Выйти»; «Сообщить клиенту об отмене? · SMS / Письмо / Не сообщать» | тот же `ConfirmDialog` столбиком: безопасное сверху, «Отмена» снизу отдельно |
| **Окно ввода** | одно (максимум два) значения с клавиатурой | всё, где больше двух полей | «Переименовать вариант», «Как вас зовут?», длина участка Gutters | `InputDialog` ⬜ · закреплено у верха (`space[6]`), не двигается клавиатурой |
| **Тост «Отменить»** | итог обратимого действия: статус, удаление строки, архив, «выполнено» | ошибка, требующая действия (→ баннер); необратимое (→ окно) | «Статус сохранён · Отменить» | `useToast().show(text, undo)` · 5 с (`toastUndoMs`), стопка до 3, плашка `toast` радиус 14 |
| **Подсказка «?»** | объяснить понятие и дать путь к настройке | действие | «Срок сметы ?» | `HelpButton` (телефон — шторка `fit`, от 820 — поповер ⬜) |
| **Подсказка при наведении** | подпись кнопки-значка на вебе / iPad с мышью | на телефоне | «⋯» → «Действия» | `Tooltip` ⬜ (`component.tip`, задержка `motion.tipDelayMs` 500) |
| **Поповер** (от 820) | то же, что шторка выбора на телефоне, но у элемента | на телефоне | дата, статус, «?», сортировка на планшете | `Popover` ⬜ (`popoverW` 360) |

### 1.3. Таблица «ситуация → вид» (вывод)

| Ситуация | Вид | Не так |
|---|---|---|
| Удалить объект навсегда / черновик / замер | окно-подтверждение, `danger` справа | шторка с красной кнопкой |
| Удалить строку сметы, позицию, задачу (есть `undo`) | сразу + тост «Отменить» | окно |
| Уйти с несохранённого (вкладка, «×» редактора, «Назад») | окно: «Не сохранять» (danger) · «Сохранить» · «Отмена» | шторка `ConfirmSheet` / `TabBar` |
| Выйти из аккаунта с очередью | окно с выбором: «Подождать отправки» · «Выйти» | шторка |
| Сменить ключ, отменить заказ, отменить импорт | окно-подтверждение | шторка |
| Отмена работы / аннулирование счёта с обязательной причиной | шторка-форма (`fit`): причина + `footer` danger | окно (поле причины длинное) |
| Возврат денег с суммой и деталями | шторка, страница «Проверьте» + «Вернуть $120.00» | окно (детали не помещаются) |
| Однократное уведомление «Компания закрыта», «Вас удалили» | окно с одной кнопкой «Понятно» | шторка |
| Перед системным разрешением (геолокация) | окно-пояснение с «Разрешить» / «Не сейчас» | шторка |
| Действия объекта (≤ 7) | меню «⋯» у кнопки | шторка со столбиком кнопок |
| Создать что-то («＋») | меню у «＋» | шторка `FabSheet` |
| Сменить статус лида / клиента | меню у статуса (`HeadStatus onPress`) или `StatusPicker` | шторка со столбиком кнопок |
| Позвонить по одному из номеров | меню у кнопки «☎» | шторка |
| Выбрать вид экрана (2–3) | сегмент | меню |
| Выбрать вид из 4+ / «списки денег» | меню вида в шапке | шторка |
| Значение формы из 2–12 | поле-меню `SelectField` | чипы, сегмент |
| «% или $» у суммы | `PctUsdField` | `Segmented` + два поля |
| Тема, язык, роль | `SelectField` (DS §9 А16) | `Segmented` |
| Значение из 13+ / с поиском | `PickerSheet` (`large`) | меню |
| Главный выбор шторки с подписями | `OptionRows` | чипы |
| Одно значение с клавиатурой | окно ввода | шторка над клавиатурой |
| Форма ≤ 6 полей | шторка + `footer` «Сохранить …» | редактор |
| Форма > 6 полей | полноэкранный редактор | шторка |
| Ошибка сети при сохранении | тост ошибки или баннер «Не отправлено» | окно |
| Итог обратимого действия | тост «Отменить» | окно «Готово!» |

### 1.4. Тексты кнопок и место «Отмены» (вывод; HIG «Alerts», «Action sheets», правило 5, DS Б3 и Б1)
- **Кнопка повторяет глагол вопроса:** «Удалить черновик?» → «Удалить»; «Отменить заказ?» → «Отменить заказ» / «Не отменять». Никогда «Да», «ОК», «Подтвердить».
- **Окно, кнопки в ряд (2):** слева «Отмена» / «Не удалять» (`ghost`), справа действие (`danger` для разрушения, `primary` для осознанного «Отправить»). **Три и больше или длинные слова** — столбиком: действие сверху, «Отмена» последней отдельной кнопкой.
- **Enter / клавиша по умолчанию:** у опасного — «Отмена», у безопасного — действие. Фон окна не закрывает; Esc и Android «Назад» = «Отмена».
- **Меню:** «Отмены» нет — закрывается нажатием вне (HIG). Опасный пункт — последней группой, красным словом, после него окно-подтверждение.
- **Шторка-форма:** «Отмены» как кнопки нет — «×» 32 справа в шапке и смахивание; при `dirty` — окно «Не сохранять · Сохранить · Отмена». Главная — в `footer`, глагол + объект: «Сохранить задачу».
- **Шторка действий (если осталась, > 7 исходов):** строки во всю ширину, значок слева, глагол; «Отмена» — отдельной строкой внизу.
- **Тост:** справа слово «Отменить» цвета `toastAction`, без заливки и кольца.
- **Окно ввода:** «Отменить» слева (`ghost`), «Применить» / «Сохранить» справа (`primary`).
- Все слова — ключи `src/i18n` RU/EN/ES; общий набор: `common.cancel`, `common.keep` («Не удалять»), `common.discard` («Не сохранять»), `common.save`, `common.ok` («Понятно»).

---

## 2. Аудит мест (проверено; «→» — что по правилу §1)

Всего вызовов `<Sheet>` — 134: ядро 110, Gutters 12, витрина 12. Ниже все места ядра и Gutters, сгруппированы по виду. «Действие»: **оставить** / **заменить на …**.

### 2.1. Шторка вместо окна-подтверждения — то, о чём пишет основатель (заменить, первоочередно)

| Файл:строка | Сейчас | По правилу | Действие |
|---|---|---|---|
| `ui/templates/parts.tsx:43` `ConfirmSheet` | шторка «Отмена / danger» для опасного пункта «⋯» и ухода из редактора; корень проблемы | окно-подтверждение | **заменить** телом `ConfirmDialog`; `ConfirmSheet` удалить; тесты `tpl-confirm-*` сохранить |
| `ui/templates/parts.tsx:83` `MoreButton` | опасный пункт → `ConfirmSheet` | меню → окно | заменить (через `useConfirm`) |
| `ui/templates/EditorScreen.tsx:72` | уход с несохранённым → `ConfirmSheet` | окно «Не сохранять · Сохранить · Отмена» | заменить |
| `ui/overlays.tsx` (вопрос `dirty` внутри `Sheet`, DS Б1 «✅ `overlays.tsx:334`») | вопрос о несохранённом рисуется внутри шторки | окно поверх шторки | заменить на `useConfirm` (единый) |
| `nav/TabBar.tsx:73` | «Уйти без сохранения?» шторкой, 2 кнопки столбиком | окно | заменить |
| `app/settings/delete-account.tsx:232` | «Передать компанию …?» шторкой, `ButtonPair danger` | окно | заменить |
| `app/settings/delete-account.tsx:250` | «Удалить аккаунт?» шторкой | окно (danger, текст последствий) | заменить |
| `app/purchase-order/[id].tsx:270` | «Отменить заказ?» шторкой, одна danger-кнопка | окно «Не отменять / Отменить заказ» | заменить |
| `app/estimate/new.tsx:1245` | «Удалить черновик?» шторкой, danger + «Отмена» столбиком | окно | заменить |
| `app/client/imports.tsx:118` | «Отменить импорт?» шторкой | окно | заменить |
| `app/company/intake.tsx:198` | «Сменить ключ?» шторкой | окно | заменить |
| `features/SignOutAskView.tsx:38` | «Выйти?» шторкой: «Подождать» primary + «Выйти» | окно с выбором (2 исхода) | заменить |
| `modules/gutters/view/DeleteMeasurementSheet.tsx:20` | «Удалить замер?» шторкой с суммами смет | окно (суммы — в тексте, ≤ 2 строк) | заменить (зона «в», волна G) |
| `app/suppliers/[id].tsx:206` | «Применить +N % к M позициям?» шторкой | окно (массовое изменение) | заменить |
| `features/SupplierTaxAsk.tsx:22` | вопрос о налоге поставщика строками | окно с 2–3 исходами | заменить |
| `app/estimate/new.tsx:1135` (`est-tax-ask`) | вопрос о налоге и настройки в одной шторке | вопрос — окно; настройки — остаются шторкой | разделить |
| `features/VisitChecklist.tsx:178` (`chk-missing`) | «Не заполнено N — Заполнить / Пропустить» шторкой | окно-предупреждение | заменить |
| `features/lead/LeadSheets.tsx:194` (`lead.low`) | вопрос с вариантами «Подождать N дн.» | окно с выбором | заменить |
| `nav/ClosedCompanyNotice.tsx:43` | уведомление с одной кнопкой | окно «Понятно» | заменить |
| `nav/RemovedCompanyNotice.tsx:50` | уведомление | окно «Понятно» | заменить |
| `features/LocationParts.tsx:69` | пояснение перед разрешением, `ButtonPair` | окно «Разрешить / Не сейчас» | заменить |
| `features/client/ClientDuplicates.tsx:80` (кнопка `:104`) | шторка выбора, что оставить, + «Объединить» danger | выбор — шторка (оставить), объединение — окно (необратимо) | добавить окно на `:104` |
| `features/StorageReadError.tsx:40` | подтверждение кнопками на экране сбоя | экран сбоя — окна поверх нет смысла | **оставить** (исключение в DS §8.0: экран сбоя) |

Итого: **21 место** (19 в ядре, 1 Gutters, 1 общий `ConfirmSheet` на все «⋯» и редакторы).

### 2.2. Шторка вместо меню (заменить на `Menu`)

| Файл:строка | Сейчас | Действие |
|---|---|---|
| `nav/Fab.tsx:77` `FabSheet` | «＋ Создать» шторкой из своих `Press` со своим стилем (`:80–89`, нарушение правила 29) | заменить на `Menu` у «＋» (`CreateButton` уже так делает, `parts.tsx:38`) |
| `features/PlanParts.tsx:363` | «Добавить: событие / выходной» строками | `Menu` у «＋» |
| `app/finance.tsx:123` | «Списки денег» — навигация строками | меню вида в шапке |
| `features/lead/LeadSheets.tsx:162` | статус лида — столбик из 4 кнопок | `Menu` у `HeadStatus` (опасное «Закрыть» последним) |
| `features/comms/CallSheet.tsx:76` | выбор номера | `Menu` у «☎», если номеров ≤ 7 |
| `features/EstimateCard.tsx:136` | «PDF» — действия | пункты «⋯» сметы |
| `features/VisitForm.tsx:330, 355, 365` | «Сообщить клиенту?» — 4 кнопки столбиком | окно с выбором (SMS · Письмо · Не сейчас) или шторка действий строками; кнопки-столбики убрать |
| `modules/gutters/draw/DrawScreen.tsx:1590` (`draw-more-sheet`) | «⋯» холста шторкой | `Menu` (волна G) |

### 2.3. Шторка с одним полем — заменить на окно ввода (`InputDialog`, DS Б1а, Н-85)

| Файл:строка | Поле |
|---|---|
| `features/estimate/OptionsCard.tsx:181` | имя варианта |
| `nav/NameAsk.tsx:50` | имя пользователя |
| `features/lead/LeadParts.tsx:348` | стоимость лида |
| `features/EstimateCard.tsx:1121` | имя шаблона |
| `features/VisitChecklist.tsx:333` | текст пункта (проверить: если одно поле — сюда) |
| `modules/gutters/draw/InputWindow.tsx:34` | своё окно на `<Modal>` → станет `ui/InputDialog` (перенос, не новый вид) |

### 2.4. Шторки-выбор — оставить, но поправить содержимое

| Файл:строка | Сейчас | Действие |
|---|---|---|
| `features/sheets.tsx:43`, `features/JobTypeTags.tsx:53, 63`, `features/ServiceCategoryPicker.tsx:50`, `features/VisitForm.tsx:384, 395`, `features/client/ClientSheets.tsx:224`, `features/client/PropertySheets.tsx:138, 147` | `OptionRows` в шторке | оставить |
| `app/job/new.tsx:241`, `features/estimatePickers.tsx:39, 75`, `features/SupplierParts.tsx:41`, `modules/ModulePlaces.tsx:55` | список, собранный по месту | `PickerSheet` (`large`, поиск) |
| `app/company/leads.tsx:95` | ответственный по умолчанию — шторка | `SelectField` (значение настройки) |
| `app/client/import.tsx:372` | поле для колонки — шторка | `SelectField` / `Menu` |
| `features/lead/LeadSheets.tsx:79` | «Следующий шаг через N дн.» кнопками | `DateField` с быстрыми вариантами |
| `features/lead/LeadSheets.tsx:142` | срок «отложить» `ChoiceChips` | `OptionRows` |
| `features/CompanySwitcher.tsx:133` | выбор компании | оставить (`medium`) |
| `features/PlanParts.tsx:286, 316` | «Не назначено · N», «Без даты · N» | оставить, `height="medium"` |
| `app/estimate/new.tsx:1257` «С чего начать?» | выбор начала с подписями | оставить (`OptionRows`) |
| `app/auth/sign-in.tsx:366` | «Нет письма?» — советы строками | оставить (информация с действиями) |
| `features/estimate/OptionsCard.tsx:158` | помощь по вариантам шторкой | `HelpButton` (единый «?») |

### 2.5. Шторки-формы — оставить; проверить `footer` и чипы внутри
Оставить шторкой (≤ 6 полей): `app/team.tsx:134, 176, 249, 330`; `app/purchase-order/[id].tsx:278`; `app/visit/[id].tsx:603, 606, 617, 623`; `app/estimate/templates.tsx:143`; `app/estimate/new.tsx:1080, 1310`; `app/company/intake.tsx:189, 213`; `app/company/checklist/[id].tsx:187`; `features/VisitForm.tsx:279, 304`; `features/EventForm.tsx:124`; `features/EstimateReasonSheet.tsx:38`; `features/VisitChecklist.tsx:280`; `features/EstimateCard.tsx:499, 738`; `features/SetupCards.tsx:73`; `features/SimulatedCheckout.tsx:36`; `features/ContractStatement.tsx:147`; `features/PhotoStrip.tsx:104`; `features/payments/PaySheet.tsx:107, 162`; `features/JobLinesBlock.tsx:169`; `features/tasks/TaskSheet.tsx:127`; `features/QuickPriceSheet.tsx:62`; `features/payments/RefundSheet.tsx:129`; `features/payments/AdvanceSheet.tsx:68`; `features/comms/MessageSheet.tsx:105`; `features/lead/LeadParts.tsx:222, 250, 296, 362, 396`; `features/lead/LeadCard.tsx:308`; `features/lead/SourcePicker.tsx:69`; `features/job/CancelJob.tsx:41`; `features/invoice/VoidInvoice.tsx:86, 140`; `features/invoice/InvoiceCard.tsx:241`; `features/estimate/NotesTerms.tsx:98`; `features/client/PropertySheets.tsx:47, 58, 106, 116`; `features/client/ClientSheets.tsx:144, 279`; Gutters — `prices/TransitionSheet.tsx:50`, `prices/PricesScreen.tsx:210`, `draw/LinkSheet.tsx:68`, `draw/DrawScreen.tsx:1541, 1544, 1557, 1567, 1609` (волна G).
Общий долг этих форм (вывод): главная кнопка лежит в теле, а не в `footer` — `footer` в первых 12 строках тега найден только у 9 из 122 шторок вне витрины (`PaySheet:107, 162`, `QuickPriceSheet`, `CancelJob`, `VoidInvoice:86, 140`, `ClientSheets:144, 224`, `TransitionSheet`; беглый счёт `grep`, сверить при переводе); по DS Б1 «Сохранить» в теле запрещено. Внутри форм — `ChoiceChips` (см. 2.6).

### 2.6. Селекторы не по правилу

| Что | Где (проверено) | Действие |
|---|---|---|
| `Segmented` как **сохраняемое значение** | роль `app/settings/profile.tsx:119`; тема и язык `app/settings/index.tsx:43, 56`; способ оплаты `features/EstimateCard.tsx:259, 504`, `features/payments/PaySheet.tsx:213`; быстрые суммы `PaySheet.tsx:194`; исход лида `features/lead/LeadParts.tsx:397` | `SelectField` (роль, тема, язык); `OptionTiles` (способ оплаты, исход); быстрые суммы — `OptionRows` |
| `Segmented` «% / $» + два поля | скидка `app/estimate/new.tsx:1162`, депозит `:1220`, `app/company/[section].tsx:215`, `features/ContractStatement.tsx:149` | `PctUsdField` (DS А1е) |
| `Segmented` по правилу (вид) | `app/(tabs)/today.tsx:262`, `app/(tabs)/plan.tsx:145`, `features/estimate/OptionsCard.tsx:94` | оставить |
| `ChoiceChips` — выбор значения (запрещено А1в) | ядро 33: `app/team.tsx:139, 152`; `app/settings/index.tsx:83`; `app/expense/new.tsx:74–76`; `app/purchase-order/[id].tsx:144`; `app/suppliers/[id].tsx:132`; `app/company/[section].tsx:116, 210, 399`; `app/company/schedule.tsx:78, 119, 124`; `app/company/checklist/[id].tsx:140`; `app/company/intake.tsx:140`; `features/VisitForm.tsx:222`; `features/EventForm.tsx:131, 136`; `features/ServiceCategoryPicker.tsx:95`; `features/estimatePickers.tsx:42`; `features/comms/CallSheet.tsx:107, 111`; `features/comms/MessageSheet.tsx:134, 143, 154`; `features/payments/RefundSheet.tsx:153`; `features/lead/LeadParts.tsx:227, 310, 407`; `features/lead/LeadSheets.tsx:143, 216`; `features/lead/LeadCard.tsx:310`. Gutters 24: `settings/SettingsScreen.tsx` ×18, `draw/FracPicker.tsx:51, 73`, `draw/AttrPanel.tsx:70, 348, 411, 618` | по одному: значение 2–12 → `SelectField`; главный вопрос шторки → `OptionRows`; 2–3 + действие → `OptionTiles`; да/нет → `ToggleRow`; дни недели (`schedule.tsx`) → `OptionRows multiple`. После — удалить `ChoiceChips` |
| `MultiChips` (запрещено А4) | `app/auth/trade.tsx:50`; Gutters `settings/SettingsScreen.tsx` ×9 | `OptionRows multiple` |
| `Menu` для 2 пунктов | `features/NotesBlock.tsx:87` (команда / личная) | `SelectField` или `ToggleRow` «Только мне» |

### 2.7. Меню (`Menu`) — 15 мест, по правилу
`app/(tabs)/triage.tsx:148`, `app/receipt/[id].tsx:178`, `app/estimate/new.tsx:1360`, `features/EstimateCard.tsx:284`, `features/estimate/SectionHeader.tsx:113`, `features/estimate/OptionsCard.tsx:157`, `features/estimate/LineRow.tsx:310, 482`, `features/invoice/VoidInvoice.tsx:70`, Gutters `view/CardHead.tsx:146, 156`, `view/ViewScreen.tsx:249`, `draw/AttrPanel.tsx:222`, `draw/DrawScreen.tsx:1549` — **оставить**. Опасные пункты помечены `destructive` (проверено `receipt/[id].tsx:97`, `visit/[id].tsx:284`, `job/[id].tsx:252`, `EstimateCard.tsx:122`), но подтверждение после них — шторкой (2.1); после замены — окно.

### 2.8. Свои окна (`<Modal>` вне `src/ui`) и модальные маршруты
- `features/SignatureFullscreen.tsx:109`, `nav/NavMenu.tsx:118`, `modules/gutters/draw/InputWindow.tsx:34` — сторож держит их списком `RULE29_MODAL` (`test/designSystem.test.ts:79`). → `FullscreenOverlay` (подпись), `Sheet`-боковая панель или маршрут (меню навигации), `InputDialog` (Gutters).
- `presentation` Expo Router нигде не задан (`app/_layout.tsx:49`). Вывод: редакторы `estimate/new`, `client/edit`, `job/new`, `lead/new`, `expense/new`, `estimate/signature` — `presentation: "fullScreenModal"` (iOS: снизу, без смахивания назад; Android/веб — как сейчас), чтобы «×» значило то же, что в HIG: закрыть, а не «назад».

### 2.9. Тосты
296 вызовов `toast.show`, 129 с `undo`. Правило 5 в целом соблюдено; проверить вручную: итоги необратимых действий не должны идти тостом без окна до них (после замены 2.1 — тост «Готово» без «Отменить» только как итог окна).

---

## 3. Утечки старых токенов и своего вида (проверено)

### 3.1. Литералы в коде экранов
Сторож `test/designSystem.test.ts:26–32` (цвет, число в стиле, размер-проп, прозрачность, вес, семейство шрифта) — **зелёный**: литералов цвета в стилях ядра нет. Что он не видит:

| Где | Что | Чем заменить |
|---|---|---|
| `features/PlanParts.tsx:468` | `NOW_OPACITY = 0.85` (константа, мимо правила `opacity:`) | токен `component.nowOpacity` или `dimOpacity` |
| `features/CompanySwitcher.tsx:227` | `SAY_LATE_MS = 1500` | `motion.*` (новый `sayLateMs`) |
| `ui/pickerSheet.tsx:12` | `ESC_AFTER_CLEAR_MS = 400` | `motion.durSlow` или новый токен |
| `ui/nowCard.tsx:189` | `KICK_TRACKING = 0.04` | `font.tracking.kick` |
| `ui/figures.tsx` `HATCH` (DS §12.14: «рисунок, не размер») | 7 / 13 / 135° | `component.hatch` — чтобы витрина показывала |
| `modules/gutters/draw/*` | арифметика `space[2] * 2`, `size.hitMin * 2.5`, `w * 0.8` — 15 мест | токены модуля (волна G) |
| `test/designSystem.test.ts:644` `DEBT` | `zIndex 100` в `ui/overlays.tsx`, `zIndex 10 / 0` в `ui/surfaces.tsx` | `z.toast` (поднять над модалкой), `z.over` |
| `ds-allow` | **5** исключений: 2 в `src/ui`, по 1 в `features`, `app/p`, `app/client` | пересмотреть каждое волной 1 |

### 3.2. Старые палитры и пилоты

| Где | Что | Действие |
|---|---|---|
| `packages/design-tokens/src/graphite.ts` + экспорт `index.ts:8` | токены пилота «Графит» (#2254) | после утверждения v2 — удалить (по слову аудита: пилот не правило, правило 3 держит его «до этапа II») |
| `design/naryad-ds/tokens/graphite.css` | 203 переменные `--gr-*`, акцент `#FBFF00` (`:116, 126, 173`) | удалить вместе с пилотом |
| `apps/mobile/src/features/showcase/graphite/**` | 15 файлов, 580 КБ, свой `Modal`, `Pressable`, `ActivityIndicator`, шрифт Jost | удалить; `ds.gr.*` ключи i18n; `useGraphiteFlag` в `app/settings/design-system/index.tsx:20`, `[section].tsx:31` |
| `design/naryad-ds/graphite/OFL-Jost.txt`, загрузка Jost (7 мест в пилоте) | шрифт пилота | удалить |
| `app/_layout.tsx:9, 79` | **грузится старый шрифт Onest** (4 начертания), хотя шрифт v2 — Manrope (`index.ts:14`) | убрать Onest из `useFonts` (быстрее старт) |
| `design/naryad-ds/tokens/foundation.css:3` | `--font:'Onest'` | Manrope (зеркало, `mirror.test.ts`) |
| `design/naryad-ds/CLAUDE.md` п.2, п.6 | «акцент #FBFF00», «шрифт Onest», «кнопки ≤ 36» | переписать на v2 или пометить «устарело» |
| `pastels.*.bar` (`index.ts:491`) | цвет полосы прогресса — в v2 полос нет | убрать `bar` |

### 3.3. Неиспользуемые токены (скрипт по именам ключей; 19)
`font.minSize`, `size.controlSm`, `size.controlMd`, `size.iconStroke`, `size.statusbarH`, `size.safeBottom`, `motion.easeSpring`, `motion.menuScale`, `motion.alertScale`, `motion.skeletonCycle`, `motion.toastInfoMs`, `motion.durBrandFirstMax`, `component.alertMaxW`, `component.paletteW`, `component.stepDot`, `component.stepBar`, `component.toastRing`, `component.valueLabelMax`, `shopSheet.letterMinPt`.
Вывод: `stepBar`, `stepDot`, `toastRing`, `paletteW`, `controlSm/Md`, `easeSpring` — от прошлых палитр, **удалить**; `alertMaxW`, `alertScale`, `menuScale`, `skeletonCycle`, `toastInfoMs` — ждут компонентов (окно, меню с масштабом, скелетон, обычный тост) — **оставить и использовать** в волне.

### 3.4. Расхождения токенов с v2 и DS между собой (вывод — привести к v2)

| Что | v2 / §12.12 | Токен / код | Действие |
|---|---|---|---|
| Радиус шторки | 28 (`radius.sheet` 28) | `component.sheetRadius` **24** (`ui/overlays.tsx:614`) | одно значение 28, `sheetRadius` удалить |
| Ручка шторки | 36 × 5 | `component.grabber` 36 × **4** | 5 |
| Значок в кнопке | 18 (§12.12) | `component.button.glyph` **22** (`index.ts:185`) | сверить по макету, привести |
| Сегмент | 36 / pad 3 (§12.12, токен) | DS §9 А1 пишет 32 / 4 | исправить DS §9 |
| Кнопки | 40 (правило 3 с 21.11) | DS §7.1 «≤ 36» | исправить DS §7.1 |
| Подсказка | 11,5 (DS Б6) | `component.tip.fs` 13 | решить, записать одно |
| Ширина окна | DS Б1 «окно 444» | `modalW` 380 (+ `space[8]`) | записать как формулу в DS |
| Вуаль | v2 50 % | тёмная 0,5 ✅; светлая `rgba(20,21,24,0.3)` | оставить (светлая — своё решение), записать |

### 3.5. Свой вид в обход `src/ui`
- `Press` со своей подложкой / радиусом / рамкой вне `src/ui` — **18 мест в 13 файлах** (`RULE29_STYLED_PRESS`, `test/designSystem.test.ts:99–113`): `features/LegalAgree.tsx` 1, `features/PhotoStrip.tsx` 2, `features/estimate/SwipeRow.tsx` 1, `features/showcase/Rows.tsx` 1, `nav/Fab.tsx` 2, `nav/NavMenu.tsx` 2, `nav/SearchEntry.tsx` 1, `nav/SideNav.tsx` 2, Gutters — 6 (`AttrPanel`, `CornerSheet`, `DrawScreen` ×2, `FracPicker`, `SettingsScreen`).
- Свой `<Modal>` вне `src/ui` — **3** (2.8).
- `ListCard` вместо `ListGroup/GroupRow` (правило 12 с 21.11) — **33 файла** (`LISTCARD_LEFT`, `test/designSystem.test.ts:455–462`).
- `src/ui` с «своим видом» внутри — `UI_OWN_STYLED_PRESS` 13 компонентов (законно: компонент и есть вид).
- Пустая витрина: **31 компонент** `src/ui` в `UI_PENDING` (не показан): среди них `Menu`, `Card`, `ListRow`, `Empty`, `Screen`, `ChoiceChips`, `StatusPicker`, `FilterBar`, `ListCard`, `SwipeRow`.

**Итого утечек (цифры):** 6 скрытых литералов в ядре + 15 в Gutters + 3 `DEBT` + 5 `ds-allow`; 1 старый шрифт в загрузке; 1 пилот целиком (≈ 220 токенов CSS + TS + 15 файлов); 19 неиспользуемых токенов (7 удалить); 8 расхождений чисел; 18 своих `Press`; 3 своих `Modal`; 33 файла на `ListCard`; 67 чипов-выборов; 11 `Segmented`-значений; 21 шторка-подтверждение; 8 шторок-меню; 6 шторок одного поля.

---

## 4. Полнота ДС v2 — каждая сущность (проверено по `src/ui`, DS, `features/showcase/registry.ts`)

Колонки: **Код** — компонент в `src/ui`; **DS** — описан в `DESIGN-SYSTEM.md`; **Витр.** — в витрине (раздел или `UI_PENDING`); **Сост.** — нажата / недоступна / загрузка / пусто / ошибка (по §12.15); **v2** — числа совпадают с §12.12 / `visual-v2.html`.

| Сущность | Код | DS | Витр. | Сост. | v2 | Чего нет |
|---|---|---|---|---|---|---|
| Кнопка primary / secondary / ghost / danger | ✅ `Button` `controls.tsx:33` | §7 | ✅ | нажата ✅, недоступна ✅, **загрузка ❌** (нет пропа `loading`) | 40 ✅; значок 22 ≠ 18 | `loading`, наведение (Н-61) |
| Пара кнопок | ✅ `ButtonPair` `pairs.tsx:18` | §12.12 | ✅ | как `Button` | ✅ | — |
| Ряд кнопок | ❌ `ButtonRow` | §7.1 | ❌ | — | — | компонент (Н-48) |
| Круглая кнопка 40 / 32 / 44 | ✅ `IconButton`, `IconRow`, `HeaderButton` | §12.12 | ✅ | ✅ | ✅ | `Tooltip` на вебе |
| Закреплённая панель | ✅ `ActionBar`, `MainStep` | §8.9 | ✅ | спиннер только в `MainStep` | ✅ | — |
| Поле текста | ✅ `TextField` (`plate`, `big`) | §11, §12.14 | ✅ | ошибка ✅; **фокус ❌**, **недоступно ❌** | 16 ≠ 15 у `plate` | кольцо фокуса (Н-03), вид `disabled` |
| Число / деньги / % | ✅ `NumberField`; старые `MoneyField/PctField/QtyField` в `features/fields.tsx` | §9 А6 | ✅ | ошибка ✅ | ✅ | перевод мест со старых |
| % / $ | ✅ `PctUsdField` | А1е | ✅ | ✅ | ✅ | 4 места не переведены (2.6) |
| Дата | ✅ `DateField` | А7 | ✅ | ◐ | ✅ | поповер от 820 |
| Время, длительность, диапазон | ❌ `TimeField`, `DurationField`, `DateRangeField` | А8, А9 | ❌ | — | — | компоненты (Н-45) |
| Адрес, телефон США | ◐ поля в `TextField type` | А13, А14 | ◐ | ◐ | ✅ | `AddressFields` целиком |
| Фото / файл / камера | ❌ `MediaPicker` (по месту `PhotoStrip`) | А12 | ❌ | — | — | компонент (Н-47) |
| Цвет бренда | ❌ `ColorField` (по месту `company/[section].tsx:502`) | А15 | ❌ | — | — | Н-56 |
| Повторяемые значения | ✅ `MultiValueField`, `ActionRow` | А14а | ✅ | ✅ | ✅ | — |
| Поле-меню | ✅ `SelectField` | А2 | ✅ | ошибка ✅; клавиатура ◐ | ✅ | объявление значения (#1145) |
| Длинный выбор | ✅ `PickerSheet` | А3 | ✅ | пусто ✅ («ничего не найдено») | ✅ | 5 мест собраны по месту |
| Строки / плитки выбора | ✅ `OptionRows`, `OptionTiles`, `CheckMark` | А2а, А2б | ✅ | ✅ | ✅ | — |
| Переключатель | ✅ `ToggleRow` (`Toggle` внутри) | А5 | ✅ | недоступно ✅ | ✅ | — |
| Сегмент | ✅ `Segmented` | А1, §12.12 | ✅ | ✅ | ✅ (DS §9 устарел) | сторож «только вид» |
| Вкладки вида | ✅ `ViewTabs` (`plain`, `chips`), `ViewSteps` | А1п, §12.14 | ✅ | ✅ | ✅ | — |
| Чипы-выбор | ⚠ `ChoiceChips`, `MultiChips` (запрещены) | А1в | ❌ | — | — | **удалить после перевода 67 мест** |
| Фильтр списка | ✅ `FilterBar`, `FilterRow` | А11 | ❌ `UI_PENDING` | ◐ | ? | витрина, «Показать N» |
| Сортировка | ❌ `SortMenu` | А11 | ❌ | — | — | Н-55 |
| Статус объекта | ✅ `StatusPicker` (в `listCard.tsx:625`, не в своём файле) | А10 | ❌ | ✅ | ◐ | перенести, витрина |
| **Шторка** | ✅ `Sheet` | Б1 | ✅ | — | радиус 24 ≠ 28, ручка 4 ≠ 5 | страницы со сдвигом (`SheetPage` ◐) |
| **Окно-подтверждение** | ❌ `ConfirmDialog`, `useConfirm` | Б3 | ❌ | — | токены есть | **компонент (Н-41) — первым** |
| **Окно ввода** | ❌ `InputDialog` | Б1а | ❌ | — | — | компонент (Н-85) |
| **Меню у элемента** | ✅ `Menu`, `MenuButton` | Б4 | ❌ `UI_PENDING` | недоступно (`dim`) ✅ | ✅ | витрина; масштаб `menuScale` не используется |
| Меню «⋯» объекта | ◐ `MoreButton`; ❌ `useObjectActions` | Б4 | ✅ | — | ✅ | один источник действий (Н-53) |
| Контекстное меню | ❌ | Б5 | ❌ | — | — | после окна |
| Поповер | ❌ `Popover` | Б6 | ❌ | — | — | Н-52 |
| Подсказка при наведении | ❌ `Tooltip` | Б6 | ❌ | — | — | Н-51 |
| Подсказка «?» | ✅ `HelpButton` | Б7 | ✅ | — | ✅ | поповер от 820 |
| Тост | ✅ `ToastProvider`, стопка `toastStack.ts` | Б8, §15.2 | ✅ | — | ✅ | `toastInfoMs` не используется; смахивание |
| Баннер | ✅ `Banner`, `SyncBadge`, `QueueLine` | Б9, §15.3 | ✅ | — | ✅ | порядок срочности |
| Плашки статуса | ✅ `StatusPill`, `TonePill`, `HeadStatus`, `StatusChip`, `StatusNote` | §12.12 | ✅ (кроме `StatusChip`) | ✅ | ✅ | слить `StatusChip` в `StatusPill` |
| Счётчик, штриховка, интервал | ✅ `CountPill`, `HatchPlate`, `IntervalPlate` | §12.14 | ✅ | ✅ | ✅ | `HATCH` в токены |
| Метки | ✅ `TagChip`, `MetaTag`, `MetaLine` | А1в | ◐ | — | ? | витрина `TagChip`, `MetaTag` |
| Строка списка | ✅ `GroupRow`, `ListGroup`, `GroupedList` | §12.12, правило 12 | ✅ | нажата ✅; недоступно — нет (правило) | ✅ | 33 файла на `ListCard` |
| Строка «цифры справа» | ✅ `FigureRow` | §12.12 | ✅ | ✅ | ✅ | — |
| Старая строка / карточка списка | ⚠ `ListRow`, `ListCard`, `CardGrid` | §8.1 | ❌ `UI_PENDING` | — | ✗ (не v2) | `ListCard` — удалить после перевода |
| Смахивание строки | ✅ `SwipeRow` | Б13 | ❌ (веб без жеста) | ✅ | ✅ | — |
| Карточка | ✅ `Card`, `NowCard` | §12.12 | `Card` ❌, `NowCard` ✅ | ✅ | ✅ | витрина `Card` |
| Плитки | ✅ `StatTile`, `StatGrid` | §12.12 | ✅ | ноль не рисуется ✅, ошибка «!» ✅ | ✅ | — |
| Тройка цифр, прогресс словами, таймер, чек-лист | ✅ `NumberTrio`, `ProgressWords`, `TimerLine`, `CheckList` | §12.12 | ✅ | ✅ | ✅ | `ProgressBar` с полосой оставлен — убрать полосу везде |
| Время / слот / дни | ✅ `TimeSlot`, `DayStrip`, `WeekStrip`, `MonthPick` | §12.12 | ✅ | ✅ | ✅ | — |
| Шапка (4 вида) | ✅ `screenHeader.tsx`, `FitTitle` | §12.13 | ✅ | ✅ | ✅ | — |
| Шаблоны экранов | ✅ `OverviewScreen`, `ListScreen`, `ObjectScreen`, `EditorScreen`, `CalendarScreen` | §12 | ✅ | ◐ | ✅ | шаблон `Sheet` (шестой в DESIGN.md) — как спецификация шторки |
| Пустые состояния | ✅ `Empty`, `EmptyFilter`, `EmptySearch`, `NotFound`, `PageNotFound` | §13 | ✅ (кроме `Empty` в `UI_PENDING` как самостоятельный) | — | ✅ | — |
| **Загрузка** | ❌ `Spinner`, `Skeleton` | §13, Б12 | ❌ | — | токен `skeletonCycle` есть | компоненты (Н-49) |
| **Ошибка экрана** | ◐ `features/StorageReadError.tsx`, экран сбоя | §13.1 | ❌ | — | — | общий `ErrorState` «Повторить» |
| Только чтение | ✅ `ReadOnly` | §12.15 | ❌ `UI_PENDING` | — | — | вид |
| Значки | ✅ `Icon` + `extraIcons` | §18.1 | ✅ | `active` ✅ | ✅ | — |
| Аватар | ✅ `Avatar`, `pastelOf` | §12.14 | ❌ `UI_PENDING` | — | ✅ | витрина |
| Полноэкранный режим | ❌ `FullscreenOverlay` | Б11 | ❌ | — | — | Н-54 |
| Графики | ✅ `Columns`, `Meter` | — | ❌ | — | ? | сверить с v2 |

**Отсутствует совсем (12):** `ConfirmDialog`, `InputDialog`, `Popover`, `Tooltip`, `Spinner`, `Skeleton`, `Button loading`, `ButtonRow`, `TimeField`/`DurationField`/`DateRangeField`, `MediaPicker`, `SortMenu`, `FullscreenOverlay`, `useObjectActions` (+ контекстное меню, `ColorField`, `ErrorState`).
**Есть, но не в витрине (31):** `UI_PENDING` (`registry.ts:93`).
**Запрещено, но живёт:** `ChoiceChips`, `MultiChips`, `ConfirmSheet`, `ListCard`.

---

## 5. План волны «ДС v2 полная» (вывод)

Порядок — от того, что видит основатель (окна вместо шторок), к чистке. Зона — (г) экраны; Gutters — своя волна G в зоне (в); пилот «Графит» — по слову аудита. Оценки — часы работы одного исполнителя с тестами и витриной.

| Шаг | Что | Файлы | Сторож (чтобы не вернулось) | Часы |
|---|---|---|---|---|
| **0. Документ** | Записать §1 этого файла в DS §10 как «Правило оверлеев» (таблица ситуация → вид), исправить §7.1 (40), §9 А1 (36/3), Б1 (28, ручка 5); `design/naryad-ds/CLAUDE.md` — пометка «устарело, правила — DESIGN-SYSTEM.md» | `DESIGN-SYSTEM.md`, `design/naryad-ds/CLAUDE.md` | раздел существует (`designSystem.test.ts` «section points to heading») | 3 |
| **1. Окно-подтверждение** | `ui/confirmDialog.tsx`: `ConfirmDialog` + `useConfirm()` (Promise: `"yes" / "no" / "third"`), ряд / столбик, `danger`, фон не закрывает, Esc = отмена, `alertMaxW`, `alertScale`, `accessibilityRole="alert"`; витрина «Окна → Подтверждение» (удалить, выйти, 3 исхода) | `src/ui/confirmDialog.tsx`, `ui/overlays.tsx` (вопрос `dirty` → `useConfirm`), `features/showcase/Windows.tsx`, `registry.ts`, i18n `common.keep/discard/ok` | **«оверлей по правилу»**: `variant="danger"` внутри `<Sheet>` без `footer`-формы с полем — красный; список старых мест только сокращается | 8 |
| **2. Перевод 21 подтверждения** | `ConfirmSheet` → `useConfirm`; все места §2.1 | `ui/templates/parts.tsx`, `EditorScreen.tsx`, `nav/TabBar.tsx`, `SignOutAsk.tsx`, `delete-account.tsx`, `purchase-order/[id].tsx`, `estimate/new.tsx`, `client/imports.tsx`, `company/intake.tsx`, `suppliers/[id].tsx`, `SupplierTaxAsk.tsx`, `VisitChecklist.tsx`, `LeadSheets.tsx`, `ClosedCompanyNotice.tsx`, `RemovedCompanyNotice.tsx`, `LocationParts.tsx`, `ClientDuplicates.tsx` + e2e по `testID` | `ConfirmSheet` нет в `src` (как `ItemCard`); e2e `confirm-dialog` у каждого действия Б3 | 10 |
| **3. Окно ввода** | `ui/inputDialog.tsx` (закреплено у верха, без `KeyboardAvoidingView`, ≤ 2 полей); перевод §2.3; `InputWindow` Gutters — в волну G | `src/ui/inputDialog.tsx`, 5 файлов ядра, витрина | в `InputDialog` нет `KeyboardAvoidingView`; `<Sheet>` с одним `TextField` и без других детей — предупреждение-список | 6 |
| **4. Меню вместо шторок** | `FabSheet` → `Menu`; `PlanParts` «＋», «Списки денег», статус лида, звонок, PDF; `Menu` — в витрину с группами, `dim`, `destructive`; применить `menuScale` | `nav/Fab.tsx`, `PlanParts.tsx`, `finance.tsx`, `LeadSheets.tsx`, `CallSheet.tsx`, `EstimateCard.tsx`, `VisitForm.tsx`, `registry.ts` (`Menu` из `UI_PENDING`) | «шторка без полей и выбора, только 2+ `Button` в теле» — красный (это меню или окно) | 6 |
| **5. Селекторы** | `Segmented`-значения → `SelectField` / `OptionTiles` / `PctUsdField` (11); `ChoiceChips` ядра (33) и `MultiChips` (1) — по таблице §2.6; `NotesBlock` | §2.6 ядро | **`Segmented` только в списке мест-«видов»** (DS §21.2 п.27.1); `ChoiceChips`/`MultiChips` — список файлов только сокращается, в новом файле красный; после — компоненты удалить | 12 |
| **6. Шторки** | радиус 28 и ручка 36×5 по v2; `footer` у всех шторок-форм (главная кнопка из тела); `height="medium"` у списков; 5 выборов по месту → `PickerSheet` | `ui/overlays.tsx`, `index.ts` (`sheetRadius` удалить, `grabber.h` 5), ~35 файлов §2.5 | «`Button primary` в теле `<Sheet>`» — красный (DS §21.2 п.27.7); `sheetListMax` только в `PickerSheet` | 10 |
| **7. Редакторы модально** | `presentation: "fullScreenModal"` для 6 маршрутов-редакторов (iOS), проверка «Назад» Android и веб | `app/_layout.tsx` (`Stack.Screen`), e2e навигации | сторож: экран с шапкой `editor` объявлен модальным | 3 + натив (правило 27) |
| **8. Загрузка и ошибка** | `Spinner` (после `spinnerDelayMs` 300), `Button loading` (22 места `disabled={busy}`), `Skeleton` списка (`skeletonCycle`), `ErrorState` «Повторить» | `src/ui/loading.tsx`, `controls.tsx`, `ListScreen.tsx`, витрина | `ActivityIndicator` только в `src/ui`; `disabled={busy}` без `loading` — предупреждение-список | 8 |
| **9. Подсказка и поповер (820+)** | `Tooltip` (веб, iPad), `Popover` для `SelectField` с поиском, `DateField`, `StatusPicker`, `HelpButton` | `src/ui/popover.tsx`, `tooltip.tsx` | у `IconButton` есть `accessibilityLabel` (уже) → `Tooltip` из него, без нового текста | 8 |
| **10. Чистка токенов и пилота** | удалить 7 мёртвых токенов (§3.3), `pastels.bar`, Onest из `_layout.tsx` и `foundation.css`; литералы §3.1 → токены; `DEBT` zIndex; пересмотр 5 `ds-allow`; пилот «Графит» целиком (по слову аудита) | `packages/design-tokens/src/index.ts`, `graphite.ts`, `design/naryad-ds/tokens/*.css`, `features/showcase/graphite/**`, i18n `ds.gr.*`, `app/settings/design-system/*` | **«нет мёртвых токенов»**: каждый лист `tokens` прочитан в `src` или в списке «ждёт компонента»; **«нет старых токенов»**: в `src`, `packages/design-tokens`, `tokens/*.css` нет `graphite`, `--gr-`, `FBFF00`, `Onest`, `Jost`, `stepBar`, `toastRing`; **«нет литералов-констант»**: `const [A-Z_]+ = число` в `src/app|features|nav` — только счётчики (список) | 6 |
| **11. Свой вид и витрина** | 18 своих `Press` (ядро 12: `Fab`, `NavMenu`, `SideNav`, `SearchEntry`, `PhotoStrip`, `SwipeRow`, `LegalAgree`, `Rows`); `SignatureFullscreen`, `NavMenu` → `FullscreenOverlay` / `Sheet`; 31 компонент из `UI_PENDING` в витрину (или удалить устаревшие `StatusChip`, `ListRow`, `ListCard`) | `nav/*`, `features/*`, `features/showcase/*` | существующие `RULE29_*` (только сокращаются) → цель 0; `UI_PENDING` — цель 0 | 10 |
| **12. Gutters (волна G, зона «в»)** | `DeleteMeasurementSheet` → окно; `DrawScreen` «⋯» → `Menu`; `InputWindow` → `InputDialog`; 24 `ChoiceChips` + 9 `MultiChips` в `SettingsScreen`, `AttrPanel`, `FracPicker`; 6 своих `Press`; 15 арифметик | `src/modules/gutters/**` | те же сторожа без исключения для модуля | 14 |
| | **Итого** | | | **≈ 104 ч** (ядро ≈ 90, Gutters ≈ 14) |

Порядок зависимостей: 0 → 1 → 2 (окна сразу видно основателю) → 3 → 4 → 5 → 6 → 8 → 7 → 9 → 10 → 11; 12 — параллельно после 1 и 3. Шаги 1–4 — один PR на шаг, каждый с «Проверить в витрине: Окна — …» и снимками «было/стало».

### 5.1. Сторожа одной таблицей (новые)

| Сторож | Где | Что красное |
|---|---|---|
| Оверлей по правилу | `test/overlayRules.test.ts` | `variant="danger"` в `<Sheet>` вне формы с причиной; `<Sheet>` без полей и выбора, где в теле только `Button`; `ConfirmSheet` в коде; `<Sheet>` с одним `TextField` (список старых) |
| Селектор по правилу | `designSystem.test.ts` | `<Segmented` вне списка «видов» или с > 3 пунктами; `<ChoiceChips`/`<MultiChips` в новом файле |
| Нет старых токенов | `packages/design-tokens/test/legacy.test.ts` | имена и значения прошлых палитр (`graphite`, `--gr-`, `#FBFF00`, `Onest`, `Jost`, `stepBar`, `toastRing`, `controlSm`) |
| Нет мёртвых токенов | `packages/design-tokens/test/used.test.ts` | лист токена не читается в `apps/mobile/src` и не в списке «ждёт компонента» |
| Нет констант-литералов | `designSystem.test.ts` | `const X = 0.85` / `1500` в экранах для стиля или времени |
| Загрузка через `src/ui` | `designSystem.test.ts` | `ActivityIndicator` вне `src/ui` |
| Витрина полна | существующий `registry` | `UI_PENDING` не пуст после шага 11 |
| Числа v2 | `mirror.test.ts` + новый `v2Numbers.test.ts` | `sheetRadius ≠ radius.sheet`, `grabber.h ≠ 5`, `button.glyph` ≠ значения DS §12.12 |

### 5.2. Образцовые экраны в витрине — «как правильно» (вывод)
Собрать в витрине раздел «Образцы» (Дизайн-система → «Образцы»), живыми компонентами на демо-данных, с подписью у каждого оверлея «вид · почему». Агенты дальше копируют отсюда.

1. **«Смета — действия и выход»** (`EditorScreen`): «⋯» → `Menu` (Изменить · PDF · Поделиться | В архив | Удалить красным) → «Удалить» → `ConfirmDialog` «Удалить смету EST-0012? · Не удалять / Удалить»; «×» с правками → окно «Не сохранять · Сохранить · Отмена»; «Переименовать вариант» → `InputDialog`; удаление строки → тост «Строка удалена · Отменить»; скидка → `PctUsdField`. Покрывает: меню, окно-подтверждение, окно ввода, тост, селектор значения.
2. **«Выезд — форма и выбор»** (`ObjectScreen` + шторки): «Перенести» → шторка `fit` с `DateField` и `footer` «Перенести выезд»; «Мастер» → `PickerSheet` `large` с поиском; «Причина отмены» → `OptionRows` в шторке + `footer` danger «Отменить выезд»; «Тема уведомления» → `SelectField`; «Уведомлять клиента» → `ToggleRow`; «Не заполнено 2» → окно-предупреждение «Заполнить / Пропустить». Покрывает: все высоты шторки, длинный выбор, строки выбора, поле-меню, переключатель.
3. **«План — вид и создание»** (`CalendarScreen`): «Сегодня · Неделя · Месяц» — `Segmented` (вид); «Ноябрь ⌄» — `MonthPick`; «＋» → `Menu` (Выезд · Событие · Выходной); «Без даты · 3» → шторка `medium`; загрузка — `Skeleton` дня; ошибка — `ErrorState` «Повторить»; на 820 — `Popover` даты вместо шторки. Покрывает: сегмент как вид, меню создания, `medium`, загрузку, ширины.

Каждый образец — e2e-спека на 6 видах (`h.layout`) по `testID`, и строка в DS §10 «Образец: витрина → Образцы → №N».

---

## 6. Что спросить основателя (только продукт, остальное — решено выше)
- **ВОПРОС:** удалять ли пилот «Графит» целиком сейчас (v2 утверждён 21.11), или держать до этапа II, как записано в правиле 3?
- **ВОПРОС:** редакторы (смета, клиент, работа) на iPhone открывать снизу на весь экран, как «Новое событие» в Календаре iOS (без смахивания «назад»), — да?

## Дополнение 21.11 — образец основателя «Inline Alert» (kokonutui.com/docs/feedback/inline-alert)
Основатель прислал ссылку. Суть образца: предупреждение в потоке экрана, которое не просто сообщает, а помогает исправить — список не прошедших проверок, у каждой «Повторить», строка становится зелёной, когда проверка прошла. Образец — веб (React, Tailwind, motion), напрямую не ставим (правило 17, не React Native); делаем свой компонент `CheckAlert` в `src/ui` на токенах v2 (тихие тона статусов, значок + слово, без колец прогресса; движение — только смена тона и галочка, Reduce Motion — без анимации).
Где применить (вывод): 1) перед отправкой сметы/счёта клиенту — «нет телефона/почты», «позиция на $0», «проверьте цены каталога» (правило 9), «нет подписи» — каждая с кнопкой «Исправить»; 2) шторка «Ждёт отправки» — каждое не ушедшее изменение с «Повторить»; 3) импорт клиентов CSV — ошибки строк. Соседний образец той же библиотеки «Save Status» (плашка «Правка · Сохранение · Сохранено», счёт изменений без сети) — для строки состояния редактора («Черновик · сохранено 8:19»). Место в плане волны — после шага «окно-подтверждение», вместе с загрузкой и ошибками.

## Дополнение 21.11 — образец основателя «Switch Button» (kokonutui.com/docs/buttons/switch-button)
Основатель: «красивая анимация, как включается и выключается светло-тёмный фон — от кнопки загорается вся страница». Суть: при смене темы новый фон расходится кругом от нажатой кнопки на весь экран. Образец — веб (View Transitions / clip-path), в React Native так не работает; делаем своё: поверх экрана круг цвета новой темы растёт `transform: scale` из точки кнопки (Reanimated, только transform и opacity), в конце тема переключается и круг убирается; ~400 мс easeOut; Reduce Motion — простое растворение 160 мс. Новая зависимость не нужна. По правилу движения подходит: смену темы делают редко. Где: «Настройки → Тема» (там же по правилу оверлеев выбор темы — сегмент «Светлая · Тёмная · Как в системе», не чипы) и меню аватара, если там будет переключатель. Правило 27: проверить в симуляторе iPhone (нет мелькания, нет рывка при смене темы). Место в плане — в конце волны, «приятные детали», после обязательного.

## Дополнение 21.11 — образец основателя «Floating label input» (library.aimran.es/blocks/floating-label-input)
Основатель: «красивое поведение… текстовое поле для почты и вообще для всего». Суть: подпись стоит внутри пустого поля; при фокусе или вводе плавно уезжает вверх и уменьшается, поле подсвечивается рамкой цвета акцента. Мнение руководителя: берём — экономит строку подписи над каждым полем (компакт, слово основателя), подпись всегда видна (не пропадает, как placeholder), сразу видно, какое поле активно. Наше исполнение (React Native, без framer-motion и новых зависимостей): поле 52 (вместо подписи 12 над полем 44 — экономия ~10 pt на поле), подпись 15/500 `mut` внутри → 12/600 вверху поля; движение только transform (translateY + scale) 160 мс easeOut, Reduce Motion — без сдвига, сразу в верхнем положении; рамка фокуса — `accEdge`/`acc` 1,5, ошибка — тон bad + слово под полем; зона нажатия 44+. Где: все обычные формы (почта и код входа, клиент, лид, компания, событие, оплата). Где НЕ: плотные строки позиций сметы и поля в ячейках таблиц (там подпись колонкой), поиск (там значок лупы и placeholder). В волне — шаг «поля»: меняем `TextField`/`MoneyField`/`SelectField` одним компонентом, все экраны получают его сразу; VoiceOver читает подпись как имя поля; правило 27 — проверить клавиатуру и автозаполнение почты на iPhone.

## Дополнение 21.11 — образец основателя «OTP six» (library.aimran.es/blocks/otp-six)
Основатель: «для OTP-кода, у нас есть такое на вход в приложение». Суть: шесть отдельных ячеек под цифры кода, активная подсвечена, цифра появляется с лёгкой анимацией. Берём для экрана входа по коду из письма. Обязательное устройство (не только вид): ОДНО скрытое поле на весь код, а ячейки — только рисунок над ним — иначе ломаются вставка и автозаполнение; `textContentType="oneTimeCode"` (iOS сам предлагает код из письма/SMS над клавиатурой), `autoComplete="one-time-code"` (Android/веб), цифровая клавиатура, вставка всего кода одним движением, стирание назад по одной, после 6-й цифры — сразу проверка (без кнопки «Войти»), ошибка — ячейки тоном bad + слово «Неверный код» + новый ввод; ячейки 46×56 радиус 14 (`surf2`, активная — рамка `acc` 1,5); анимация цифры — scale 0.9→1 + opacity 120 мс, Reduce Motion — без неё. VoiceOver: одно поле «Код из письма, 6 цифр». Правило 27: проверить автоподстановку кода и вставку в симуляторе iPhone. В волне — шаг «поля», вместе с плавающей подписью.

## Дополнение 21.11 — образец основателя «Coloured floating label» (library.aimran.es/blocks/uv-in-float)
Вариант того же поля с плавающей подписью: поднятая подпись становится меньше и цветной (основной + вторичный цвет). Решение: берём как цвет состояния для нашего плавающего поля — пока поле в фокусе, поднятая подпись и рамка цвета акцента (тёмная `acc`, светлая `accText` — контраст ≥ 4,5); поле заполнено и не в фокусе — подпись `mut`; ошибка — подпись и рамка тоном bad. Это слово/рамка, не заливка — правило «одна жёлтая заливка на экран» не нарушается. Градиента из двух цветов в подписи не делаем (у нас один акцент). Отдельного компонента нет — это состояние того же `TextField`.

## Дополнение 21.11 — образец основателя «Underline input» (library.aimran.es/blocks/uv-in-line)
Основатель: «ещё для поля текста, для подписи». Суть: поле без рамки и фона — только линия снизу; при фокусе из центра вырастает цветная линия. Решение: берём как второй, «тихий» вид поля `TextField look="line"` — только там, где рамка лишняя: 1) имя подписавшего под полем подписи (как строка «подпишите здесь» в бумажном документе) — на странице клиента `/p/`, в выезде и на весь экран; 2) правка названия на месте (заголовок сметы, название позиции, заметка) внутри карточки. Везде остальное — обычное поле с плавающей подписью. Линия: покой — 1 pt `off`; фокус — 1,5 pt `acc` (светлая `accText`), растёт `transform: scaleX` 0→1 из центра 160 мс easeOut (Reduce Motion — сразу); ошибка — тон bad + слово под линией; без градиента (один акцент); высота зоны нажатия 44. Подпись поля — плавающая, как у основного поля.

## Дополнение 21.11 — образец основателя «Expanding search bar» (library.aimran.es/blocks/uv-in-search)
Суть: круглая кнопка-лупа раскрывается в поле поиска на всю ширину. Решение: берём для круглой «🔍» 40 в строке шапки корней вкладок со списками (Клиенты, Лиды, списки Денег, План): нажатие — строка шапки превращается в поле поиска по этому списку прямо на месте (остальные значки и аватар гаснут, клавиатура открыта, справа «Отмена»), список фильтруется на ходу; «Отмена» или пустое поле + смахивание вниз — обратно. На Главной лупа по-прежнему ведёт в общий поиск по всему (экран поиска). Движение без анимации ширины (её в RN не делаем): подложка поля растёт `transform: scaleX` от места лупы 200 мс easeOut, текст поля и «Отмена» проявляются opacity; Reduce Motion — растворение. Поле — `surf`, радиус 18, высота 36, лупа слева, «×» очистки справа. Правило 27: клавиатура и прокрутка списка под полем — проверить в симуляторе iPhone. В волне — шаг «шапка/поиск», после полей.

## Дополнение 21.11 — образец основателя «Password field with eye» (library.aimran.es/blocks/uv-in-password)
Суть: поле пароля с кнопкой-глазом; когда пароль показан, с глаза «съезжает» черта. Паролей в GoRix нет (вход по коду из письма, Face ID, Apple/Google — правило 28), поэтому как поле пароля не берём. Берём сам приём «показать/скрыть» с анимированным глазом для скрытых значений: код ворот и доступа (видят назначенные, по умолчанию скрыт «••••», глаз — показать на 30 с), секретные значения в настройках интеграций (ключи Stripe и т.п. — только показать последние 4 и скрыть). Значок глаза — из набора «Тонкие острые»; черта уезжает `transform` 160 мс, Reduce Motion — сразу; VoiceOver: «Показать код» / «Скрыть код».
**Выбор основателя 21.11:** для раскрывающегося поиска — образец «Pop-open search» (library.aimran.es/blocks/uv-in2-expand), «значок поиска мне больше нравится»: круглая лупа «растягивается» в поле (с лёгкой упругостью в конце), лупа остаётся кнопкой у края поля. Поведение и место — как описано выше для «Expanding search bar»; вид раскрытия — по этому образцу (растяжение + небольшой перелёт и возврат, ≤ 250 мс; Reduce Motion — растворение).

## Дополнение 21.11 — образец основателя «File drop» (library.aimran.es/blocks/uv-in-file-drop)
Суть: зона «перетащите файл сюда» — при наведении файла подсвечивается, показывает файл, имя и размер. Решение: берём как компонент `FileDrop` в `src/ui` (то же, что «загрузчик файлов» из #2217): на телефоне — нажатие открывает выбор «Снять фото · Из фото · Из файлов» (системные окна iOS), на планшете, компьютере и в вебе — ещё и перетаскивание файла. Где: прайс поставщика и чеки для распознавания (ответ основателя 34), импорт клиентов CSV, фото и PDF к работе/выезду, логотип компании. Вид v2: пунктирная рамка `dash` радиус 22, значок 24 и слово, при наведении — тон `tint` и рамка `acc`; после выбора — строка файла (значок типа, имя, размер, «×»), загрузка — словами «Загрузка · 60 %» (полос нет), ошибка — тон bad + «Повторить» (как CheckAlert). Офлайн — файл ждёт в очереди (правило 6). Шаг волны — «поля».

## Сохранено по просьбе основателя 21.11 — «Interactive map» (21st.dev/@lovesickfromthe6ix/components/interactive-map)
Основатель: «сохрани эту карту в список компонентов… спутниковые снимки… отсюда будем брать». Назначение скажет позже. Задача #2367.

## Сохранено по просьбе основателя 21.11 — «Address map» (library.aimran.es/blocks/uv-in-address-map)
Основатель: «эту карту сохрани, я знаю, куда её применю немножко позже, просто сохрани». Ссылка: https://library.aimran.es/blocks/uv-in-address-map — поле адреса с картой. Не планировать и не встраивать, пока основатель не скажет, куда.

## Модуль Gutters, 21.11 — образец основателя «Pantone fan» (library.aimran.es/blocks/uv-card-pantone-fan)
Основатель: «для модуля Gutters — когда будем выбирать цвет койла, цвет материала, цвет гаттерса, переходников и так далее». Суть: веер карточек-образцов цвета (как веер Pantone), листается, выбранная карточка выдвигается с названием. Решение: берём для окна выбора цвета материала Gutters (желоб, coil, трубы, колена, переходники). Это ровно третье исключение правила 2: образец цвета `materialSwatch.*` — только в окне/списке выбора цвета материала и всегда рядом с названием цвета; сами цвета — данные поставщика и настройка компании, не общие токены. Вид: веер карточек 56×88 радиус 14, имя цвета и код поставщика на карточке, выбранная — выше и с рамкой `acc`; листание пальцем (жест — правило 27: модульные тесты математики веера + проверка в симуляторе); Reduce Motion — простой горизонтальный ряд образцов; VoiceOver — список «White, Brown, …», выбран — «выбрано». Делать в волне Gutters (зона (в) `src/modules/gutters/**`), не в ядре.

## Удаление, 21.11 — образцы основателя «Type to confirm» и «Hold to confirm»
Ссылки: https://library.aimran.es/blocks/uv-ov-type-to-confirm · https://library.aimran.es/blocks/hold-to-confirm-dialog. Лестница подтверждений по тяжести (решение руководителя):
1. **Обычное удаление с возвратом** (позиция, заметка, фото, черновик) — без окна, тост «Отменить» 5 с (правило 5).
2. **Необратимое** (удалить клиента без денег, отменить заказ поставщику, выйти без сохранения) — окно по центру `ConfirmDialog` (правило оверлеев).
3. **Самое тяжёлое, с потерей данных и денег** (удалить учётную запись, закрыть компанию, удалить клиента со счетами и оплатами, удалить всё демо) — **«Type to confirm»**: окно, где надо напечатать имя (компании/клиента) или слово «УДАЛИТЬ», кнопка становится активной только при совпадении; кнопка — тон bad со словом-глаголом.
**«Hold to confirm»** (удерживать кнопку, пока заполнится круг) — не берём: в перчатках и на солнце легко сорваться, VoiceOver плохо его объявляет, это ещё одна полоса/кольцо прогресса (основатель 21.11: полос нет), а для тяжёлых случаев «напечатай имя» надёжнее. Ранее по разбору идей «сдвинь для подтверждения» тоже не берём — по той же причине.

## 21.11 — образец основателя «Coach scheduling card» (21st.dev, @isaiahbjork/components/coach-scheduling-card)
Ссылка: https://21st.dev/community/components/s/clients?preview=%2F%40isaiahbjork%2Fcomponents%2Fcoach-scheduling-card. Предпросмотр у руководителя не открылся (21st.dev перенаправил на список) — разобрано по названию, уточнить у основателя снимком. Карточка записи на время: кто (аватар), выбор дня полосой, выбор свободного окна, «Записать». Место: форма выезда и «Перенести» (вместе с «ближайшими свободными окнами» #2208 — пилюли дней + чипы окон в одну строку), а позже — страница клиента `/p/` «выбрать время выезда».

## 21.11 — образцы основателя для календаря и Плана (21st.dev)
Предпросмотры 21st.dev у руководителя не открываются (перенаправление на список) — разобрано по названию, перед работой основатель пришлёт снимки или откроем вместе. Куда (вывод):
- «Cell to card calendar expansion» (@aloksivastava1025, https://21st.dev/community/components/s/calendar?preview=%2F%40aloksivastava1025%2Fcomponents%2Fcue-cell-to-card-calendar-expansion) — План, вид «Месяц»: нажатый день раскрывается из клетки в карточку дня с выездами.
- «Event calendar» (@sean0205, reui, …preview=%2F%40sean0205%2Fcomponents%2Freui-event-calendar) — План, виды «Неделя» и «День»: события блоками по часам, перетаскивание выезда на другое время (жест — правило 27).
- «Visualize booking» (https://21st.dev/@ln-dev7/components/visualize-booking) — доска диспетчера на 820/1280: строки — бригады/мастера, по горизонтали — часы, выезды плашками; перетаскивание между мастерами.
- «Inbox calendar» (@ruixen.ui, …preview=%2F%40ruixen.ui%2Fcomponents%2Finbox-calendar) — План на планшете/компьютере: слева «Не назначено / без даты», справа календарь; перетащить работу из списка в день (слово основателя про drag & drop).
- «Timeline» (@abui, …preview=%2F%40abui%2Fcomponents%2Ftimeline) — «Журнал» клиента и работы: лента событий по дням (звонки, сметы, выезды, оплаты).
Место в плане — после волны «ДС v2 полная», шаг «План и календарь» (виды Неделя/Месяц и 820/1280 сейчас без макетов v2 — сначала макеты).
- «Schedule calendar» (https://21st.dev/@abushaidislam7/components/schedule-calendar) — ещё один образец расписания для Плана (вид «Неделя»/«День» с событиями по часам); сравнить с «Event calendar» вместе с основателем и выбрать один.

## 21.11 — образец основателя «Smooth dropdown» (https://21st.dev/@0xUrvish/components/smooth-dropdown)
Плавно раскрывающийся выпадающий список. Место по правилу оверлеев: выбор одного значения из ≤ 7 у поля/кнопки (тема, язык, роль, способ оплаты, единица) — вместо чипов и шторок, найденных в аудите (67 чипов-выборов). Наш `Dropdown` в `src/ui`: раскрывается от поля вниз (или вверх, если нет места) `transform: scaleY` + opacity 180 мс easeOut, строки 44, выбранная — галочка и слово `accText`, тень и радиус 14 как у ячейки; закрытие — нажатие мимо, выбор, смахивание; VoiceOver — «список, N вариантов». Больше 7 вариантов или с поиском — шторка. Шаг волны — «селекторы».
