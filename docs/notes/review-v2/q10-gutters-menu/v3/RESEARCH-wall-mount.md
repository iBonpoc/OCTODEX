# Крепление водосточной трубы к стене (США) — ресёрч для меню «Крепление к стене»

Дата: 22.11.2026. Код не правился. Источники — страницы производителей и розницы, прочитанные WebSearch/WebFetch.
Честно: страницы Home Depot, Lowe's, Ace, Angi, copper.org отдали 403 — по ним только сниппеты поиска. Инструкций по монтажу
Gibraltar, Euramax, Spectra с шагом в футах и типом анкера на стену **не нашёл**.

## 1. Что подтвердилось (общее)
- Минимум 2 крепления на 10 ft трубы (ремни, крюки, кронштейны — одинаково). Источники: K&M Sheet Metal (docs.kmsheetmetal.com/category/downspout-fastening);
  листинг Amerimax на Lowe's (lowes.com/pd/Amerimax-2-188-in-White-Aluminum-Downspout/3092259, «2 per 10 ft: bands, sickle hooks, rack and key» — по сниппету);
  Ace (band, «2 per 10 ft» — по сниппету); Euramax Canada clip на homedepot.ca/product/1000407106: «2 clips for a 10 ft» (по сниппету).
- Пример K&M: труба 20 ft — 3 опоры (≈1 ft от верха, у среднего шва, ≈1 ft от низа); ремень ставят так, чтобы он накрывал стык. Сам K&M отмечает, что это расходится с правилом «2 на 10 ft» (по нему на 20 ft нужно ≥4).
- Крепёж подбирают под стену (K&M: «confirm suitable backing»). Дерево — шуруп #10; кирпич/камень/бетон — масонный анкер + сверло по камню. Подробные гайды (eHow/Angi) — сниппеты.
- Шаг в других источниках разный (одна опора на 3–4 ft; кронштейны через 5–10 ft) — это не производители, брать как диапазон 5–6 ft.
- Пилот в кирпиче сверлят не глубже ~1/2″ для штукатурки; анкер лучше в кирпич, а не в раствор (сниппеты eHow/Angi, не производитель).
- Винил: крепить в каркас; без каркаса — анкер; шляпку шурупа герметизировать (сниппет eHow). Для винилового сайдинга есть Ply Gem Vinyl Mounting Block (плоское основание под кронштейн) — но инструкции «кронштейн на блоке» не нашёл.

## 2. Таблица: пункт · труба · стена · чем крепится · шаг · источник
| Пункт меню (название по-англ.) | Труба | Стена | Чем крепится | Шаг | Источник |
|---|---|---|---|---|---|
| Downspout Strap (band, wrap-around) | rect 2×3/3×4, round, гладкая и corrugated | дерево/сайдинг в каркас; с анкером — кирпич, stucco, бетон | 2 шурупа в стену по бокам (#10 wood; на кладке — masonry anchor + шуруп); к трубе — шуруп/заклёпка | ≥2 на 10 ft, ставить на стык | K&M; Amerimax/Ace; Gibraltar CPSF2WH (2×3 white steel strap, карточка HD — 403) |
| Hidden Strap / Hidden Bracket | smooth rect или round (не corrugated) | как Strap | крепится к стене до установки трубы, лапки к бокам трубы; лицо трубы чистое | ≥2 на 10 ft | K&M (hidden mount straps: plain square or round only); Amerimax vinyl hidden band (Ace, сниппет) |
| Sickle Hook | round (Amerimax 3″ galv. sickle hooks) | дерево, drive-in | забивается/ввинчивается; труба держится проволокой (wire, отдельно) | 2 на 10 ft | HD Amerimax 85108 (сниппет); K&M wood hooks (wire не в комплекте) |
| Rack & Key (rack + drive + key) | rect, round | drive под дерево/сайдинг; под кирпич — другой drive | rack на трубе, drive в стене, key соединяет | 2 на 10 ft | GutterSupply guttersupply.com/p/downspout-racks-keys («different drives for different wall materials»); Englert (drive: wood, aluminum, vinyl siding; для кирпича не указан) |
| Brick Hook / Brick Strap (masonry clip) | rect и round | кирпич | крюк в шов/кирпич, труба на проволоке (wire); или strap с анкером в кирпич | 2 на 10 ft | BMR «Hi-Bak pipe clip for wood and brick» (bmr.ca, «2 per 10 ft»); copper.org (hanger в mortar joint + wire, сниппет) |
| Pipe Cleat / Conductor Band (masonry) | round 3″/4″, corrugated | stucco, кирпич, бетон | masonry anchor + screw через cleat/band | 2 на 10 ft | K&M round brackets (Euro bracket, hinged, mounting screw «not guaranteed for every wall»); Englert pipeband/clip/cleat (englertinc.com — только названия) |
| Mounting Block (vinyl J-block) + strap | любая | виниловый сайдинг без каркаса под крепёж | кронштейн/strap к блоку | как strap | Ply Gem vinyl mounting block (doitbest.com 101214); схема крепления не найдена |

## 3. Что уже есть в модели (WALLS, WALL_KITS_BY_WALL)
Файл `apps/mobile/src/modules/gutters/canvas/attrs.ts` стр. 72–87; комплекты — `packages/estimating-engine/src/gutterKits.ts` (DEFAULT_WALL_KITS).
Стены только 3: **wood, stucco, brick**.
| Стена | rect | round |
|---|---|---|
| wood | ds_strap (по умолчанию), sickle_hook, u_bracket, conductor_bracket, coil_strap | hinged_hook (по умолчанию), pipe_cleat, conductor_band |
| stucco | ds_strap_masonry (по умолчанию), u_bracket_masonry | pipe_cleat_masonry (по умолчанию), u_bracket_masonry |
| brick | brick_hook (по умолчанию), brick_hook_hd | conductor_band_masonry (по умолчанию), brick_hook_hd |
Количество: `max(1, ceil(длина_трубы_in / dsFastenerSpacingIn))`, `dsFastenerSpacingIn = 60` (т.е. 1 на 5 ft, не меньше 1). Комплект: 1 ремень/крюк на точку + 2 шурупа (SCREW_WOOD «10x1.5») или 2 masonry anchor; к трубе 2 шурупа 8×0.5 (кроме крюков). Без стены → `defaultWall = "wood"`.

## 4. Расхождения с моделью
1. **Минимум «2 на трубу» не выполняется:** при трубе ≤5 ft модель даёт 1 точку, а источники говорят «2 per 10 ft» (K&M, Amerimax, BMR). Для короткой трубы это спорно — решение за продуктом. Подтверждено: 10 ft → 2 (совпадает).
2. **Нет стен «vinyl/siding» и «concrete»** (их нет в WALLS). Стена под сайдингом сейчас сводится к wood; бетон — к stucco/brick вручную.
3. **Нет «hidden strap/bracket»** и **«rack & key»** — есть только видимые ремни, крюки и cleats. u_bracket в модели есть, но у производителей я его под таким именем не нашёл (у Amerimax — band/hook/rack-key).
4. **Нет «не выбрано».** `ds.wall` пустое = wood (`rules.defaultWall`), в UI `wallOf()` при неизвестном значении тоже возвращает wood. Пожелание основателя «Стена не выбрана по умолчанию» требует нового значения (например `none`/пусто) и решения, что считает смета без стены (нет крепежа + совет advice, как `wall_kit_unknown`?). Сейчас такого режима нет.
5. Названия в модели (`ds_strap`, `conductor_band`, `hinged_hook`) — внутренние id; точные английские названия поставщика для `hinged_hook`, `u_bracket`, `conductor_bracket` не подтверждены.

## 5. Рекомендация для меню «Крепление к стене» (порядок)
0. **— Not selected —** (по умолчанию, по слову основателя; требует доработки модели, см. п.4.4)
1. Downspout Strap (wrap-around) — самый частый вариант на жилом доме; труба rect и round
2. Hidden Strap / Hidden Bracket — когда лицо трубы чистое; только гладкая труба
3. Sickle Hook (wood) — round на дереве
4. Brick Hook (wire) — кирпич
5. Pipe Cleat / Conductor Band (masonry) — round на stucco/кирпиче/бетоне
6. Rack & Key — по запросу поставщика (Englert/GutterSupply)
7. Strap + Vinyl Mounting Block — сайдинг без каркаса (опционально; слабо подтверждено)

Умолчание по сути (если надо подставлять при выбранной стене): wood/сайдинг — Downspout Strap, кирпич — Brick Hook, stucco/бетон — Strap + masonry anchors. Совпадает с текущими DEFAULT_WALL_KIT_BY_WALL.

## 6. Оговорки
- Страницы Gibraltar и Home Depot/Lowe's отдали 403 — цитирую по сниппетам поиска; тип анкера и шаг от Gibraltar/Euramax/Spectra: **не нашёл**.
- Шаг «5–6 ft» — это 2 на 10 ft (практика), а не нормативная цифра производителя; в одном источнике «1 на 3–4 ft».
- Для Spectra и Euramax US собственных инструкций не нашёл.
