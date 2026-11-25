# Как пользователь выбирает значение: правила источников (ресёрч для DS)

Дата: 22.11.2026. Страницы Apple HIG и SwiftUI прочитаны через их публичный JSON (`developer.apple.com/tutorials/data/...`), страницы M3 — через текстовую выгрузку m3.material.io. Цитаты ≤15 слов. Что НЕ удалось подтвердить первоисточником — помечено «нет источника».

## 1. Таблица «правило → источник → цитата/пересказ»

| # | Правило | Источник | Цитата / пересказ |
|---|---|---|---|
| 1 | Pop-up button = плоский список взаимоисключающих значений; кнопка показывает текущий выбор | https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons | "present a flat list of mutually exclusive options or states" |
| 2 | Pop-up нельзя, если нужны действия, мультивыбор или подменю — тогда pull-down | там же | Пересказ: действия / мультивыбор / submenu -> pull-down |
| 3 | Всегда есть значение по умолчанию; заголовок поля объясняет, что внутри | там же | "Provide a useful default selection" |
| 4 | Pop-up экономит место, когда не нужно показывать все варианты сразу | там же | "space-efficient way to present a wide array of choices" |
| 5 | Вариант «Другое/Custom» в конце, чтобы не засорять форму | там же | "include a Custom option" |
| 6 | iPad: в поповере/модалке вместо шеврона-перехода лучше pop-up, если набор небольшой и чётко определён | там же (iPadOS) | "fairly small, well-defined set of options that work well in a menu" |
| 7 | Pull-down = команды/элементы, связанные с действием кнопки; выбор значения — не он | https://developer.apple.com/design/human-interface-guidelines/pull-down-buttons | "If you need to provide a list of mutually exclusive choices… use a pop-up button" |
| 8 | Пункты меню: минимум 3, иначе кнопки/переключатели; слишком много — долго искать | там же | "listing a minimum of three items" ; "too many items… slow people down" |
| 9 | Меню: следить за длиной; длинное — делить; подменю редко | https://developer.apple.com/design/human-interface-guidelines/menus | "Be mindful of menu length"; "Use submenus sparingly" |
| 10 | Подменю — один уровень; больше ~5 пунктов в подменю — делать отдельное меню | там же | "more than about five items, consider creating a new menu" |
| 11 | Иконки в группе меню: у всех или ни у кого | там же | "icons for all menu items in a group, or none" |
| 12 | Галочка = атрибут в силе (состояние) | там же | "checkmark to show that an attribute is currently in effect" |
| 13 | Меню показывать рядом с тем, чем оно управляет | там же (visionOS, но принцип общий) | "Prefer displaying a menu near the content it controls" |
| 14 | Segmented: близкие взаимоисключающие варианты, влияют на объект/вид; показывает состояние выбора | https://developer.apple.com/design/human-interface-guidelines/segmented-controls | "closely related choices that affect an object, state, or view" |
| 15 | Segmented: на iPhone не более ~5 сегментов; на широких — 5–7 | там же | "no more than about five segments on iPhone" |
| 16 | Сегменты одной ширины, одного типа содержимого; текст ИЛИ картинки, не смесь; метки — существительные | там же | "Prefer using either text or images — not a mix of both" |
| 17 | Picker (колёса) — для средних/длинных списков; для короткого — segmented; для очень длинного — таблица/список | https://developer.apple.com/design/human-interface-guidelines/pickers | "consider using a picker to offer medium-to-long lists" |
| 18 | Значения picker предсказуемы и упорядочены; не переключать экран ради picker, показывать в контексте | там же | "Avoid switching views to show a picker" |
| 19 | Список/таблица — для очень больших наборов; индекс; строки со значком слева допустимы | https://developer.apple.com/design/human-interface-guidelines/lists-and-tables | "Prefer displaying text in a list or table"; много картинок — коллекция |
| 20 | Для опций список подсвечивает/отмечает выбранную строку (таблица выбора, не навигации) | там же | "a table that lists options often highlights a row"... |
| 21 | Не ставить индекс в строки с индикатором раскрытия справа | там же | Пересказ: индекс и disclosure конфликтуют справа |
| 22 | Sheet: запросить конкретные данные или простая задача; не для сложных/долгих потоков | https://developer.apple.com/design/human-interface-guidelines/sheets | "request specific information… or presenting a simple task" |
| 23 | Sheet iPhone: detents medium/large, grabber, смахивание вниз закрывает | там же | "Include a grabber in a resizable sheet" |
| 24 | Sheet: Cancel слева, Done справа; не показывать Cancel+Done+Back вместе; один sheet за раз | там же | "Display only one sheet at a time" |
| 25 | Color well: тап открывает пикер цвета; лучше системный пикер; (системный на iOS — сетка 120 цветов, спектр, RGB — со слов стороннего источника) | https://developer.apple.com/design/human-interface-guidelines/color-wells | "Consider the system-provided color picker for a familiar experience" |
| 26 | Stepper не показывает значение — рядом поле; при больших изменениях — пара со текстовым полем | https://developer.apple.com/design/human-interface-guidelines/steppers | "pairing a stepper with a text field when large value changes are likely" |
| 27 | Toggle — два противоположных значения; switch на iOS только в строке списка; вне списка — кнопка-тумблер | https://developer.apple.com/design/human-interface-guidelines/toggles | "Use the switch toggle style only in a list row" |
| 28 | SwiftUI Picker в Form на iOS = строка «метка — значение — шеврон», тап открывает список выбора | https://developer.apple.com/documentation/swiftui/picker | Пересказ: "appears in a row with the label and selected value, and a chevron" |
| 29 | Стили SwiftUI Picker: automatic, inline, menu, navigationLink, palette, segmented, wheel (+ radioGroup/tabs для macOS) | https://developer.apple.com/documentation/swiftui/pickerstyle | `palette`: "options as a row of compact elements"; `navigationLink`: "pushing a List-style picker view"; `menu`: "as a menu when the user presses a button"; `inline`: "each option is displayed inline" |
| 30 | M3 Segmented: 2–5 сегментов; больше — другой компонент (chips) | https://m3.material.io/components/segmented-buttons/guidelines | "best used for selecting between 2 and 5 choices" |
| 31 | M3 Segmented: метки короткие, не переносятся; иконки/текст не смешивать | там же | "Don't allow segments to wrap onto a new line" |
| 32 | M3 Menu: временный набор действий; занимает меньше места, чем радио/чипы; открывается по тапу на элемент/кнопку/поле | https://m3.material.io/components/menus/guidelines | "A menu takes up less space than a set of radio buttons" |
| 33 | M3 Menu: недоступное — серым, не удалять; разделители в прокручиваемых меню; зазоры (gaps) — не в прокручиваемых | там же | "Don't use gaps in scrollable menus" |
| 34 | M3 Menu: слоты в пункте — картинки, прогресс, цветовые образцы | там же | Список слотов: "Images", "Progress indicators", "Color swatches" |
| 35 | M3 exposed dropdown (M2/M3): выбранное значение видно в поле, один выбор, меню под полем | https://m2.material.io/go/design-menus (через поиск) | "can be used only when a single menu item can be chosen" |
| 36 | Меню vs bottom sheet: меню — когда варианты нужно держать рядом с элементом; sheet — когда выбор влияет на всю страницу (SAP Fiori Android, вторично) | https://www.sap.com/design-system/fiori-design-android/v25-11/components/system-components/bottom-sheet/usage | Пересказ: заменять sheet меню, если список ближе к элементу |
| 37 | M3 Bottom sheet вмещает меню-подобный список с иконками, разделителями | https://m3.material.io/components/bottom-sheets/guidelines | "Bottom sheet with menu items in a list" |
| 38 | Baymard: выпадающий список <5 или >10 значений — плохо; при малом числе люди открывают список только чтобы посмотреть (55 %) | https://baymard.com/blog/drop-down-usability | "generally advises against drop-downs with fewer than 5 or more than 10 options" (пересказ; это e-commerce на десктопе) |
| 39 | Baymard: для коротких наборов — радио (все видны), для длинных с проверкой — автодополнение | там же | Пересказ |
| 40 | NN/g: dropdown подходит для заполнения форм (показывает только допустимое); избегать, когда быстрее набрать, и для знакомых данных; длинные прокручиваемые — тяжело | https://www.nngroup.com/articles/drop-down-menus/ | "Avoid dropdown boxes when typing may be faster." |
| 41 | Порог радио/выпадающего у дизайн-систем: USWDS <7, M3 6, Carbon 3 (NN/g через поиск, страница «dropdown-list» напрямую не открыта) | https://nngroup.com/articles/dropdown-list | Пересказ результата поиска; «~15 — перебор для прокрутки» |
| 42 | Jobber (моб.): позиции из каталога выбираются списком с поиском, мультивыбор (с 03.2023), услуги выше товаров; картинки позиций только в смете | https://productupdates.getjobber.com/news/15004-select-multiple-line-items-at ; https://help.getjobber.com/hc/en-us/articles/115009727668 | Пересказ из выдачи поиска; вариантов/цветов у позиции в справке нет |
| 43 | Housecall Pro: в «Pricing forms» поля Single-Select, Multi-Select, Quantity Select, Numerical Range; на мобиле форма заполняется целиком, создаётся только в вебе | https://help.housecallpro.com/en/articles/8774752-pricing-forms-setup-features-and-faqs | "Single-Select: Customers choose one item from a list" (пересказ); как выглядит контрол — в справке не описано |

## 2. Числовые пороги

| Что | Значение | Источник |
|---|---|---|
| Segmented, iPhone | ≤ ~5 | HIG segmented (#15) |
| Segmented, широкий экран | ≤ 5–7 | HIG |
| Segmented, M3 | 2–5 (меньше 2 нет смысла) | M3 (#30) |
| Pull-down, минимум пунктов | ≥ 3 (иначе кнопки/тумблеры) | HIG pull-down (#8) |
| Подменю, макс. пунктов | ~5; глубина 1 | HIG menus (#10) |
| Меню/выпадающий, разумный диапазон | 5–10 (Baymard); <7 — радио (USWDS, M3 6, Carbon 3) | Baymard, NN/g |
| Длинный список | >~10 — искать/группировать; >~15 прокрутка тяжела; Select2 показывает поиск от 20; Firefox предлагал от 40 | Baymard, NN/g, Select2 (вторично) |
| Picker (колёса) | «medium-to-long»; для короткого — segmented/menu; для очень большого — список | HIG pickers (#17) |
| Минуты в date picker | интервал, делящий 60 | HIG pickers |
| Gaps в M3 меню | 1–2 на меню | M3 (#33) |
| Сетка цветов (Fluent, не M3/Apple) | до 8 в ряд; сетка от 4+; макс 8×8 | https://microsoft.github.io/coreai-design-system/components/SwatchPicker.md |
| Зона нажатия | 44 pt (HIG, общеизвестно; в этом проекте уже правило 3) | — |

Порог «когда в меню появляется поиск» у Apple и Google **не найден** (нет источника). Практика: Select2 — от 20 (вторично).

## 3. Выбор цвета-образца

- **Apple:** Color well (тап -> системный пикер: сетка, спектр, RGB). HIG: брать системный (#25). Для ограниченной **палитры поставщика** (24 цвета) системный пикер не подходит: он даёт произвольный цвет. В SwiftUI подходящий стиль — `.palette` («row of compact elements», #29) или своя сетка. Прямой HIG-страницы про swatch-пикер нет.
- **M3:** отдельного компонента «swatch picker» нет; в меню есть слот "Color swatches" (#34) — образец внутри пункта меню рядом с названием; выбор в списке остаётся списком (название обязательно).
- **Лучшие практики (не первоисточники):** Fluent SwatchPicker — сетка, до 8 в ряд (в таблице порогов). Общий вывод: сетка кружков/квадратов + название выбранного цвета над/рядом; для 24 цветов — сетка 6×4 в шторке или поповере, а не меню в 24 строки; выбранный — обводка+галочка (не только цвет, чтобы не опираться на один цвет).
- **Вывод для DS:** один компонент «ColorSwatchPicker» с одинаковым видом в обеих формах: поле-строка (образец + название + шеврон) -> шторка/поповер с сеткой и названиями. Образцы разрешены только в нём (правило 2 CLAUDE.md, третье исключение).

## 4. Как выглядит хорошее привязанное меню

Официальных числовых спецификаций iOS 26 для меню Apple **не публикует** (HIG даёт только структуру; WWDC25-323 говорит лишь, что меню «вырастают» из стеклянных контролов — https://developer.apple.com/videos/play/wwdc2025/323/). Что подтверждено:

- iOS: меню привязано к кнопке/полю и вырастает из него; стандартные компоненты принимают стекло автоматически (https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass.md). Кастомная стилизация не нужна.
- iOS HIG: три раскладки (small — ряд из 4 иконок сверху; medium — 3 с подписями; large по умолчанию — все пункты списком). Для выбора значения нужна large (список).
- Галочка для состояния (#12); иконки — у всех пунктов группы или ни у одного (#11); разделители между группами; длинное — делить.
- M3 baseline: ширина 112–280 dp (не на всю ширину), радиус 4 dp (Expressive — скруглённее), пункт 48 dp, отступы лево/право 12 dp, верх/низ 8 dp, иконка 24 dp, разделитель 1 dp с отступом 8 dp, тень/elevation уровня 2 (https://m3.material.io/components/menus/specs ; токены https://github.com/material-components/material-web/tree/main/tokens).
- Anchoring: M3 exposed dropdown — меню прямо под полем, ширина = ширине поля; Apple — меню рядом с кнопкой, не на всю ширину экрана.
- Без источника (наблюдения, проверять в Xcode/на устройстве): у iOS-меню строка ≈44–52 pt, радиус ≈13–20 pt, галочка слева у выбранного, пересчёт максимальной высоты с прокруткой. Для DS брать за ориентир M3 (ширина 112–280, строка >=44 для нашей зоны нажатия) и сверить с реальным UIMenu на устройстве.

## 5. Применение к четырём случаям (вывод, не цитата)

1. **5 коротких вариантов (низ водостока):** это 5 взаимоисключающих значений — pop-up/menu (HIG #1, Baymard 5–10); segmented на iPhone — предел (≤5), но «Splash Blocks / Flex-A-Spout / Into ground / Onto lower roof» длинные -> не segmented (M3: метки не переносятся).
2. **7 длинных названий с картинками (кронштейны):** меню не подходит (картинки, длина) -> навигационная строка -> список-экран или шторка со строками с миниатюрой слева (HIG lists: «small image in the leading end of a row»; M3 слоты: images).
3. **24 цвета с образцами:** сетка в шторке/поповере (см. §3), одна и та же в двух формах.
4. **Угол 30–90° (5 значений) рядом со stepper количества:** угол — segmented (5 значений, числа короткие, на iPhone ровно предел 5) или menu; stepper — для количества, рядом со значением/полем (HIG steppers #26). Не смешивать: два разных контрола в одной строке — каждый со своей подписью.

## 6. Иерархия (предложение)
1. 2 значения -> toggle/switch (в строке списка). 2. 2–5 коротких одного типа -> segmented. 3. 3–~10 коротких строк текста -> pop-up (menu) со строкой-полем. 4. Длинные/с картинками/образцами или >~10 -> строка-навигация -> список-экран или шторка (поиск, если >~15–20). 5. Числа в диапазоне -> stepper (малые шаги) / поле (большие). 6. Колёса picker — только для упорядоченных числовых/дат значений. 7. Цвет-образец — свой swatch-пикер в шторке.

## 7. Что не получилось
- M3 "Lists" и "Chips" как when-to-use — не читал отдельно; M3 bottom sheet — только общее.
- Числовые размеры iOS 26 меню — нет официального источника.
- Jobber/Housecall Pro: справка описывает мультивыбор из каталога и "Pricing forms" (single/multi-select), но не вид контролов выбора варианта; скриншотов не видел.
- Page «dropdown-list» NN/g (пороги 3/6/7) — только через пересказ поиска.
