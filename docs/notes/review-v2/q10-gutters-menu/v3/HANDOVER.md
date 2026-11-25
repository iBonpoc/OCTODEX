# Памятка-передача: исполнитель дизайна #2412 (Gutters, шторки свойств) — 23.11.2026
Задача: https://github.com/iBonpoc/OCTODEX/issues/2412 (зона (в) Gutters; Refs #1879). gh — ~/GoRix/tools/bin/gh. Руководитель №24 `local_4b79df58-90fd-4921-a47d-28d617ff439f`; отчёты — ему (5–8 строк); страницы основателю он собирает сам, ты не публикуешь и вопросов основателю не задаёшь.
## Состояние
- Кода в main/ветке нет. Рабочая копия: ~/GoRix/wt-2412 (ветка design/2412-gutters-sheet от origin/main a2435d4, `npm install --ignore-scripts` сделан). ~/GoRix/design-2344 — чужая папка руководителя, там я всё убрал (mockq10.tsx удалён, ветка docs/leader22-handover).
- Основатель ОТКЛОНИЛ макет v2 и решения №24 (журнал ~/GoRix/notes/review-v2/founder-answers-1.md, раздел 23.11 ~02:20 и ~02:35): «всё по новой, сначала логика (workflow), потом экраны, вместе с дизайнером».
- Слова основателя в силе: Колено A и B — 30/45/60/75/90° + кол-во у каждого; Offset A и B — 1/2/4″ + кол-во; у Downspout вид + размер + этаж одной строкой.
- Шаг 1 (логика) СДАН: v3/WORKFLOW.md (+ RESEARCH.md, WORKFLOW-installer.md, council-crm.md, council-design.md). 11 вопросов (продукт) ушли основателю через №24; ответ №24 запишет в журнал.
## Что делать дальше (после ответа основателя на логику)
1. Прочитать ответ в журнале; обновить WORKFLOW.md.
2. Картинки «было | станет» на 390 тёмн.+светл. в v3/, index.json пар; независимый design-reviewer (+crm-reviewer) на пары; карта окон MAP.md: новый gutter, 2×тап по gutter, новый downspout, готовый downspout, «Новые».
3. Только после «да» основателя на картинки — код (шаг 2, ветка design/2412-gutters-sheet в wt-2412): тесты e2e Gutters на 6 видах, designSystem.test.ts, `npm run check`, PR (ярлык `к-влитию`, `Closes #2412`, `Refs #1879`, строки «Проверить в витрине», «Натив:»), bind_pr, не вливать.
## Как делать макет-картинки
Временный экран-макет на настоящих компонентах src/ui (шаблон был: scratchpad мой mockq10.v2.tsx — потерян при очистке, но идея простая: apps/mobile/src/app/mockq10.tsx, `?v=` выбирает вид; Sheet монтировать через setTimeout 300 мс, иначе не рисуется). Снимать: `GORIX_SHOT_PORT=8094 npm run shot -- "/mockq10?v=x" --theme dark --width 390 --by q10 --do "wait:1500"` (ПУТЬ В КАВЫЧКАХ — zsh); фото в ~/GoRix/notes/screens/<commit>/. Склеить пару нельзя (нет Pillow/ImageMagick) — класть отдельно + index.json. Макет НЕ коммитить; удалить после снимков.
## Что нужно добавить в src/ui (шаг 2, правило 29: сначала DS + витрина + сторож)
CountChoiceRow («подпись · меню значения · Stepper»; на 390 ~296 из 326 px) — DS А6.4 и §20; FieldRow долями (1,6:1:0,7) + токен component.pair.* для «вид·размер·этаж»; Sheet без ✕ (окна Gutters, DS §8.1/#1857); PickerSheet со слотом образца + поиск; токен materialSwatch в design-tokens (в DS описан Н-88, в коде НЕТ) + зеркало CSS (mirror.test) + сторож п.25; иконки профилей gutter (в коде нет; рисовать новые, журнал Q7); переключатель «Гнём по месту/Готовые» (спека 33 §2.1 п.6 обещает, в окне нет); Segmented — только ≥44 и во всю ширину (место должно быть в списке сторожа).
## Находки по существу (для памяти)
- Модель: elbows — количества по стилю: прямой rect A/B (без угла), круглый 30/45/60/75/90 (attrs.ts ELBOW_STYLES). Offset один (OFFSETS_IN 1/2/4). Основатель хочет A/B × углы у обоих — ЖДЁТ ответа.
- Толщина водостока берётся из списка жёлоба (.027/.032) — вероятная путаница; ждёт основателя.
- Окно живое сейчас (правка сразу, «Назад» откатывает, «Сохранить» нет); DS §7.3 требует «Закрыть | Сохранить» для окон свойств Gutters — расхождение, решает основатель.
- Баги/задачи вне #2412: рулетка #2414, меню двойного тапа #2415, чертёж и заказ #2416.
- Ревьюеры по v2: Segmented в карточке ≈32–36 px (<44, правило 3) — блокер; ✕ дублирует «Закрыть» (DS §8.1 запрещает ✕).
## Правила
В main не коммитить; логи только фильтром; без git stash; первое ✗ — сразу строку руководителю; перед вопросом сверяйся с founder-answers-1.md.


## ОБНОВЛЕНИЕ 23.11 (круг 2 готов)
Сдано: v3/WORKFLOW.md, DECISIONS.md (п.1–20, поправки руководителя №24 и решения круга 2), MAP.md, REVIEW.md (круг 1), img/ (круг 2, 34 снимка 390 тёмн.+светл.), img-r1/ (круг 1), index.json (пары). Повторное ревью: design-reviewer — блокеров нет; crm-reviewer — 3 «блокера» = состояния макета, решены в DECISIONS п.16–18 (макет не перерисован). Кода нет, wt-2412 чист (на ветке design/2412-gutters-sheet без коммитов). Дальше: №24 показывает основателю; после «да» — шаг 2 (код): сначала DS/витрина/сторож для новых компонентов (список в DECISIONS п.20), потом окна, e2e Gutters на 6 видах, PR с `к-влитию`, `Closes #2412`, `Refs #1879`. Папка design-2344 — чужая, не использовать.


## ОБНОВЛЕНИЕ круг 3 (23.11 ~04:30)
Круг 3 снят (v3/img/ 32 файла, img-r1/img-r2 — прежние круги), index.json обновлён. Решения: DECISIONS п.21–29 (круг 3 отменяет часть п.7–20). Ревью круга 3: design — блокеров нет; crm — решены п.25–27. Открыто к основателю: п.28. Дальше: страница основателю (№24); после «да» — шаг 2 (код) в wt-2412: сначала спека 33 (п.26), DS/витрина/сторож для новых компонентов, затем окна. Ошибки (футы→дюймы обнуляются, прилипание рулетки) — отдельная задача ошибка, родитель #1879, ссылка на #2414 — заводит №24.

По п.28 решено: круглый 3 Elbow; без крепления — не блокируем, ⚠ + напоминание перед отправкой (DECISIONS п.30). Баг и рулетка — #2434. Круг 3 у основателя (страница 9nebmZM1q125FMyshPKZjN); ждём его ответ через №24.

П.31 DECISIONS: основатель — 3 Elbow по умолчанию на КАЖДЫЙ новый downspout (и гладкий тоже), отменяет «гладкий 0». Макет d-new (гладкий) в img/ показывает 0 — устарел.

П.32 DECISIONS: смена этажа меняет только длину трубы (кратно 10 ft), Elbow/Offset не добавляются; тесты движка и окна.

П.33–34 DECISIONS: рулетка — стандартная американская 1″ на ширину окна, переключатель мм|ft·in·дробь, красная метка (исключение 5 правила 2, запись в DS при коде), 1/32 штрихами без подписей. g-new/g перерисовываются.

П.35 DECISIONS: решения по ревью рулетки (подписи 1/16 оставляем, лента=поле «Дробь», число под меткой, 1/32 заметнее). g-new/g с новой рулеткой в img/.

П.36 DECISIONS ОТМЕНЯЕТ п.31: гладкий 0 Elbow, ребристый 3×A; без переключателя «По месту/Готовые»; цвет downspout = селектор как у gutter; стена пусто; крепление к стене — ресёрч. d-new/d-ready возвращены к 0.

П.37 DECISIONS: список «Крепление к стене» по ресёрчу, к модели: wall «не выбрана», vinyl/concrete, минимум 2 крепления.

П.38 DECISIONS: красная линия короче + жёлтый овал с дробью; крепление gutter в «Ещё»; Outlet/Outlet screen/Rain barrel diverter/Size reducer по-английски.

КРУГ 4 (v4/): 54 кадра 390 + NAMES.md + references/ (стенды Berger, профиль Fascia, Hidden Hanger). Ревью: design — блокеров нет, crm — 4 (решения DECISIONS п.40). Нужен круг 4.1: названия по стенду, строка «один раз на замер», 2 этажа, состояния цвета, размер 5″. Исходники мока и shoot.sh — v4/mock-src/. Контекст исполнителя дизайна у порога: следующий исполнитель берёт HANDOVER.md.

## КРУГ 4.1 — ТОЧНЫЙ СПИСОК (23.11; уже запущен субагентом sonnet a2408bb67d01b6173 в wt-2412 → вывод в v41/; перед повтором проверь v41/img и v41/index.json — не делай заново, если готово)
Основа: v4/ (img, index.json, NAMES.md, mock-src/mockq10.tsx + overlays.diff + shoot.sh), стенды v4/references/berger-chart-*.jpg, DECISIONS п.40. Правило надписей: все детали — дословно по стенду Berger/прайсу по-английски; чего на стенде нет — не показывать.
УБРАТЬ из окон: Hidden Band, Downspout Band/Strap, Reducer, Rain barrel diverter, Outlet screen, Extension, Drain Connection; «Rack & Key Set» (это винт-ключ, не крепление). «Reducer/Size reducer» нет нигде.
ЗАМЕНИТЬ: «Крепление к стене» (downspout): — · Universal Band · Square Stamped Sickle Hook · Heavy Duty Channel Brick Hook · Metco Ornamental Conductor Band · U-Bracket Downspout Hanger · Conductor Bracket Downspout Hanger · Sq. Side Fasten / Wire Downspout Hooks (круглый + #31 Pipe Cleat). Низ: Ничего · Splash Blocks · Flex-A-Spout (+ наши «В землю», «На нижнюю крышу»). Верх: Ничего · Funnel · Square Corrugated “Y” Funnel · #14 Ornate Conductor Head, Soldered · Plain Tapered Conductor Head, Riveted · Molded Universal Conductor Head. Переключатели «Ещё»: Round Wire Strainer (только круглый); Cutoff with Diverter (только ребристый; круглый ребристый — Cutoff w/ Diverter – Round Corrugated; гладкий прямой — нет). Крепление gutter: Hidden Hanger · Hidden Hanger with Screw · Heavy Duty Hidden Hanger · #40 Fascia Hanger with Snap Strap · #41 Rafter Hanger with Snap Strap · Wrap Around Hanger · Premium Fascia Hanger with Crossbar · Custom Crossbar Hanger. Elbow A/B (стенд: Elbows – A & B Style); Offset A/B — наша разметка (на стенде только Square Corrugated Offset; пометить).
ПЕРЕСНЯТЬ (обе темы; Ещё раскрыт): g-new (размер 5″ выбран стандартно; цвет и крепление пустые; mut-строка «Задаёт все Gutter этого замера»; подпись «Цвет один на весь замер»), g-ready, g-mm, ds-new-smooth, ds-new-ribbed, ds-new-round, ds-ready (+ -more/-more2 каждого; под «Стена»/«Крепление к стене» когда оба «—»: mut-строка «Крепление к стене не выбрано — в смету не входит»), menu-wall, menu-color («Без покраски» — перечёркнутый кружок; названия цветов — стенд HR: Natural Clay, Musket Brown A, Royal Brown, AMP Dark Bronze, Black, Grecian Green, Dark Bronze, 80 White + High Gloss White). НОВЫЕ: ds-new-2floor («Длина 20 ft · 2 эт.», «1 эт. = 10 ft», колена те же), menu-bottom, menu-top, menu-color-empty (у gutter цвет не выбран: «Как у gutter» нет, цвет Downspout «Выберите цвет»). «Закрыть» — обычный цвет текста. Сводка «Ещё» у Gutter не должна обрезаться «…».
ПОСЛЕ: v41/NAMES-41.md (надпись · строка стенда · дословно; пометка «наша разметка»), v41/index.json (простой список, тёмные имена), design-reviewer + crm-reviewer, одной строкой №24.
ПРИ КОДЕ: перенести справочные фото и выводы NAMES.md в docs/specs/33-gutters-part-names.md отдельным разделом «Стенд Berger 23.11» (слово №24).

КРУГ 4.1 СНЯТ (v41/img 64 кадра, NAMES-41.md, mock-src, index.json). Ревью: надписи по стенду выполнены; остатки — DECISIONS п.41 (круг 4.2: 4 правки названий/кадров + мелочи). Чтобы пересъёмку делал следующий: v41/mock-src/shoot.sh (ONLY="…" собирает отдельные кадры).

П.42 DECISIONS: один общий список на всех поставщиков (Berger + прайс §5 + Service Partners), без имён поставщиков; цвета — PALETTE_ALL. Отдельного файла «ВГС/Service Partners» не нашёл: есть docs/prototypes/gutters-ref/colors-service-partners-aluminum.jpg и сводка §5 в spec 33-gutters-part-names.
