# Gutters: названия деталей — как у поставщика (#1800)

Решение аудита 16.11.2026 (вариант Б, слово основателя ~04:50 UTC): названия деталей Gutters — английские торговые термины поставщика во всём интерфейсе, на RU тоже («gutter, downspout, end cap, elbow… coil вместо „катушка“»). Источник — стенды Berger Building Products, фото основателя `docs/prototypes/gutters-ref/berger-*.jpg`; чего на стендах нет — ресёрч #1800 (пометка «ресёрч»). Названия SKU сверять по странице продавца перед ценами (правило 9: цен здесь нет).


Источники: таблица K — `berger-kstyle-1.jpg` (самый читаемый кадр, остальные 6 фото — тот же стенд с других ракурсов); таблица HR — `berger-halfround-2.jpg` (кадры 1 и 3 — тот же стенд, общий план).
Заголовки стендов: «K-Style Gutter Systems and Accessories»; «Half Round Gutter Systems and Accessories» (частично закрыт образцом), над ним «AVAILABLE IN 8 COLORS: HALF ROUND ALUMINUM GUTTER AND COMPONENTS».
Звёздочка `*` в колонке «SIZES / NOTES» ссылается на сноску. Сноска K, дословно (с опечаткой поставщика): «Note: Not all sizes are available in the materials shown in this chart. Please contact Berger for availibility.»

**Колонки материалов на K** (11 шт., дословно): `Galvanized Steel` · `28 Ga. Galv. Steel` · `26 Ga. Galv. Steel` · `24 Ga. Galv. Steel` · `26 Ga. Paintgrip Steel` · `Mill Finished Alum.` · `Painted Aluminum` · `.027 Painted Alum.` · `.032 Painted Alum.` · `Copper` · `Painted Steel`
**Колонки материалов на HR** (12 шт.): те же 11 + `FreedomGray® Copper` (последняя колонка).

Сокращения материалов в таблицах ниже: Galv = Galvanized Steel, 28G/26G/24G = 28/26/24 Ga. Galv. Steel, 26PG = 26 Ga. Paintgrip Steel, Mill = Mill Finished Alum., PA = Painted Aluminum, .027 / .032 = .027/.032 Painted Alum., Cu = Copper, PS = Painted Steel, FGC = FreedomGray® Copper.
Принадлежность точек к колонкам определялась по координатам на увеличенных фрагментах. Фото снято под углом, поэтому соседние Mill и PA в середине таблицы различаются примерно на 30 px; в целом надёжно. Колонка размеров сдвинута по перспективе на полстроки. Строки сопоставлены по порядку; спорные места отмечены.

## Стенд K (K-Style), 50 позиций (+40A/40B)

| № | Название (дословно) | Размеры / заметки (дословно) | Материалы | Наш код | Примечание |
|---|---|---|---|---|---|
| 1 | K-Style Gutter | 5", 6", 7", 8" * | все 11 | gutter | |
| 2 | Square Corrugated Downspout | 2" x 2", 2" x 3", 3" x 4", 4" x 5" * | Galv, 28G, 26G, 24G, 26PG, Mill, PA, Cu, PS | downspout | профиль: Sq. Corrugated |
| 3 | Plain Square Downspout | 2" x 3", 3" x 4", 4" x 5", 5" x 6" | Galv, 28G, 26G, 24G, 26PG, Mill, PA, Cu, PS | downspout | профиль: Plain Sq. |
| 4 | End Caps - Left or Right | 5", 6", 7", 8" * | Galv, 26PG, Mill, PA, Cu, PS | end_cap | Left/Right в названии |
| 5 | End Section with Outlet | 5" x 3" | Galv, PA, Cu, PS | end_outlet | |
| 6 | Slip Joint Connector | 5" * | Galv, PA, Cu, PS | slip_joint | |
| 7 | 90 Degree Box Miter - Outside or Inside | 5", 6", 7", 8" * | Galv, Mill, PA, Cu, PS | miter | 90°, Outside/Inside |
| 8 | Elbows - A & B Style - Sq. Corrugated or Plain Sq. | 2" x 2", 2" x 3", 3" x 4", 4" x 5" Custom for Pl. Sq. * | Galv, Mill, PA, Cu, PS | elbow | стиль A/B и профиль; градусы не указаны |
| 9 | Outlets - Oval or Square | 2" x 3", 3" x 4", 4" x 5", 3" Oval, 4" Oval * | Galv, Mill, PA, Cu, PS | outlet | Oval/Square |
| 10 | #40 Fascia Hanger with Snap Strap | 5", 6" * | Galv, Mill, PA, Cu, PS | k.fascia_strap | номер #40 |
| 11 | #41 Rafter Hanger with Snap Strap | 5", 6" * | Galv, Mill, PA, Cu, PS | k.rafter | номер #41 |
| 12 | Snap Strap | — | Galv, Mill, PA, Cu | нет у нас | отдельная планка к #40/#41 (у нас входит в k.fascia_strap) |
| 13 | Premium Fascia Hanger with Crossbar | 5", 6" | PA, Cu | k.fascia_crossbar | |
| 14 | Wrap Around Hanger | 5", 6" * | Galv, Mill, PA, Cu, PS | k.wrap_around | |
| 15 | Gutter Spike /  Gutter Screw | 7", 8" | Galv, PA, Cu, PS | несколько: spike, screw (вид крепления k.spike) | размеры — длина |
| 16 | Ferrule | 5", 6" * | Galv, Mill, Cu, PS | ferrule | |
| 17 | Universal Band | — | Galv, 26PG, Mill, PA, Cu, PS | wk.conductor_band? / wk.ds_strap? | хомут на трубу; точного аналога нет |
| 18 | Square Stamped Sickle Hook | 2" x 3", 3" x 4" | Galv, PS | wk.sickle_hook | Square, Stamped |
| 19 | Metco Ornamental Conductor Band | 3", 4" | Galv, Cu | wk.conductor_band | «Metco» — марка |
| 20 | Heavy Duty Channel Brick Hook | 2" x 3", 3" x 4" | Galv, PS | wk.brick_hook_hd | |
| 21 | Hidden Hanger | 5", 6", 7", 8" | Mill | k.hidden_noscrew | без шурупа (ср. №22) |
| 22 | Hidden Hanger with Screw | 5", 6" | Mill, Cu | k.hidden | с шурупом |
| 23 | Heavy Duty Hidden Hanger | 5", 6" | Mill | k.hidden_hd | |
| 24 | Custom Crossbar Hanger | 5", 6", 7", 8" | Galv, Mill, Cu | k.fascia_crossbar (вариант) | «Custom», не «Premium» |
| 25 | Roof Bar Hanger with Rod & Nut | 5" | Mill | k.roof_bar | |
| 26 | Sq. Side Fasten / Wire Downspout Hooks | 3" x 4", 4" x 5" * | Cu | нет у нас | проволочный крюк для трубы, крепление сбоку; близко к wk.sickle_hook |
| 27 | U-Bracket Downspout Hanger | 2" x 3" - Aluminum White Only | PA | wk.u_bracket | |
| 28 | Conductor Bracket Downspout Hanger | 2" x 3" | PA, Cu | wk.conductor_bracket | |
| 29 | 90 Degree Strip Miter - Outside or Inside | 5", 6" | PA | strip_miter | 90°, Outside/Inside |
| 30 | Funnel | 3", 4" Round Outlets | Galv, PA, Cu | funnel | |
| 31 | Pop Rivets | A-42, A-44 | PA | rivet | |
| 32 | Touch Up Paint - 12 oz. Can | Call for Available Colors | PA, PS | touch_up_paint | |
| 33 | Gutter Mastic - 5 oz. Tube | Call for Available Colors | Mill, PA | sealant | у Berger — «Mastic» |
| 34 | Round Wire Strainer | 2", 3", 4", 5", 6" | Galv, Mill, Cu | outlet_screen | |
| 35 | Stamped Drives #0, #4, #6 | #0 Masonry / #4, #6 Wood | Galv, PA, Cu | нет у нас | забивные крюки в стену (ближе всего anchor) |
| 36 | Malleable Drive #5 | Wood Drive | Galv | нет у нас | то же |
| 37 | Key Only | — | Mill, Cu | нет у нас | |
| 38 | Rack & Key Set | — | Galv, Mill, PA, Cu | нет у нас | |
| 39 | #14 Ornate Conductor Head, Soldered | 3", 4", 5", 6" Oval Outlet * | Galv, Cu | conductor_head | |
| 40A | Plain Tapered Conductor Head, Riveted | 3", 4" Oval Outlets, 4" x 5" Square Outlet | PA | conductor_head | |
| 40B | Molded Universal Conductor Head | White Polypropylene - Any Outlet Size or Shape | — (нет точек) | conductor_head | пластик |
| 41 | Downspout Tube | 2", 3", 4" - Aluminum High Glass White Only | Galv, PA, Cu | downspout (круглая?) | «Glass» — опечатка поставщика (на HR «Gloss») |
| 42 | Eave Box - Open, Closed, Sloped | 3", 4" Round Outlets - Call for Available Sizes | Galv, PA, Cu | eave_box | варианты Open/Closed/Sloped |
| 43 | Square Corrugated "Y" Funnel | 2" x 3", 3" x 4" | PA | wye | Y-образник называется «"Y" Funnel» |
| 44 | Square Corrugated Cutoff with Diverter | 2" x 3", 3" x 4" | PA | diverter | |
| 45 | Square Corrugated Offset | 2" x 3", 3" x 4" | Galv, PA, Cu | offset | |
| 46 | Stainless Steel Self Tapping Hex Screws #8 x 1/2 | Stainless Steel Compatible with all Metals | все 11 | screw | |
| 47 | Hinged Gutter Guard | 5", 6" | Mill | guard / guard_run | |
| 48 | Drop-In Gutter Guard | 5" | Mill | guard / guard_run | |
| 49 | Flex-A-Spout | Brown, Green, White | — (нет точек) | flex | торговая марка |
| 50 | Splash Blocks | Brown, Green, Gray | — (нет точек) | splash_block | |

## Стенд HR (Half Round), 45 позиций (+39A/39B)

| № | Название (дословно) | Размеры / заметки (дословно) | Материалы | Наш код | Примечание |
|---|---|---|---|---|---|
| 1 | Half Round Gutter | 5", 6", 7", 8" - * | Galv, 26G, 24G, 26PG, Mill, PA, .027, .032, Cu, FGC | gutter | |
| 2 | Plain or Round Corrugated Downspout | 2", 3", 4", 5", 6", 7" - * | Galv, 28G, 26G, 24G, 26PG, Mill, PA, Cu, FGC | downspout | Plain / Round Corrugated |
| 3 | "C" End Caps | 5", 6", 7", 8" - * | Galv, 26PG, Mill, PA, Cu, FGC | end_cap | тип «C»; Left/Right не указано |
| 4 | "D" End Section w/ Outlet | 4"x3", 5"x3", 6"x3", 6"x4" - * | Galv, .027, Cu | end_outlet | тип «D» |
| 5 | Slip Joint Connector | 5", 6" - * | Galv, PA, Cu | slip_joint | |
| 6 | 90 Degree Box Miter - Outside or Inside | 5", 6", 7", 8" - * | Galv, 26PG, Mill, PA, Cu, FGC | miter | |
| 7 | Elbows - Plain Round or Round Corrugated | 2", 3", 4", 5", 6" - * | Galv, 26PG, Mill, PA, Cu, FGC | elbow | |
| 8 | "B" Outlet Tube | 3", 4", 5", 6" - * | Galv, Mill, PA, Cu, FGC | outlet | тип «B» |
| 9 | Wide Flange Round "B" Outlet | 3", 4" | Mill, PA | outlet | широкий фланец |
| 10 | Rival Strap Hanger | 5", 6" - * | Galv, Mill, PA, Cu | k.hr_rival_strap | |
| 11 | #10 Shank Plate for Fascia Mount | — | Galv, Mill, PA, Cu | k.hr_shank_fascia | планка к шанку #10 |
| 12 | Stamped Shanks | See Shank Notes | Galv, Mill, PA, Cu, FGC | shank; k.hr_shank_* | номера см. Shank Notes |
| 13 | Stamped Circle | 5", 6" - * | Galv, Mill, PA, Cu, FGC | circle | |
| 14 | Wire Spring Clips | — | Galv, Mill, PA, Cu, FGC | нет у нас | пружинный зажим кольца |
| 15 | Stamped Extension Shank | — | Galv, Mill, PA, Cu | нет у нас (вариант shank) | удлинитель шанка |
| 16 | Stamped Plain Round Sickle Hook | 3", 4" Plain Round | Galv, PS | wk.sickle_hook | |
| 17 | Heavy Duty Channel Brick Hook | 3", 4" Plain Round | Galv, PS | wk.brick_hook_hd | |
| 18 | #8 Malleable Shank | — | Galv | shank | номер #8 нет в Shank Notes |
| 19 | #10 - 24 x 3/4" Nut & Bolt for Shanks | — | Galv, Cu, FGC | bolt | |
| 20 | Regal Bar Hanger w/ Rod & Nut | 5", 6", 7", 8" - Used for Single Bead Gutter | Galv, Mill, Cu | k.hr_regal_bar | Single Bead |
| 21 | Regal Double Bead Bar Hanger w/ Rod & Nut | 5", 6", 7", 8" - Used for Double Bead Gutter | Galv, Mill, Cu | k.hr_regal_bar | Double Bead |
| 22 | Face Mount Hanger w/ Crossbar & Clip | 7", 8" | Galv, Mill, Cu | k.hr_face_clip | размеры по порядку строк; возможен сдвиг |
| 23 | Cast Plain Round Sickle Hook | 4", 6" | Cu | wk.sickle_hook | литой; размеры см. №22 |
| 24 | Hinged Downspout Hook - Plain Round | 3", 4", 5" | Cu, FGC | wk.hinged_hook | |
| 25 | Hinged Downspout Hook - Round Corrugated | 3", 4", 5" | Cu, FGC | wk.hinged_hook | |
| 26 | #31 Pipe Cleat | — | PA, Cu | wk.pipe_cleat | номер #31 |
| 27 | Cutoff w/ Diverter - Round Corrugated | 3", 4" - High Gloss White Only | PA | diverter | |
| 28 | Hinged Gutter Guard | 5", 6" | Mill, Cu | guard / guard_run | |
| 29 | Funnels | 3", 4" Round Outlets | Galv, PA, Cu | funnel | здесь мн. ч. (на K — «Funnel») |
| 30 | Pop Rivets | A-42, A-44 | PA | rivet | |
| 31 | Touch Up Paint - 12 oz. Can | Call for Available Colors | PA, PS | touch_up_paint | |
| 32 | Gutter Mastic - 5 oz. Tube | Call for Available Colors | Mill, PA | sealant | |
| 33 | Round Wire Strainer | 2", 3", 4", 5", 6" | Galv, Mill, Cu | outlet_screen | |
| 34 | Stamped Drives #0, #4, #6 | #0 Masonry / #4, #6 Wood | Galv, PA, Cu | нет у нас | |
| 35 | Malleable Drive #5 | Wood Drive | Galv | нет у нас | |
| 36 | Key Only | — | Mill, Cu | нет у нас | |
| 37 | Rack & Key Set | — | Galv, Mill, PA, Cu, FGC | нет у нас | |
| 38 | #14 Ornate Conductor Head, Soldered | 3", 4", 5", 6" Oval Outlet - * | Galv, Cu | conductor_head | |
| 39A | Plain Tapered Conductor Head, Riveted | 3", 4" Oval Outlets, 4"x5" Square Outlet | PA | conductor_head | |
| 39B | Molded Universal Conductor Head | White Polypropylene - Any Outlet Size or Shape | — | conductor_head | |
| 40 | Downspout Tube | 2", 3", 4" - Aluminum High Gloss White Only | Galv, PA, Cu | downspout | |
| 41 | Eave Box - Open, Closed, Sloped | 3", 4" Round Outlets - Call for Available Sizes | Galv, PA, Cu | eave_box | |
| 42 | Stainless Steel Self Tapping Hex Screws #8 x 1/2 | Stainless Steel Compatible w/ all Metals | все, кроме FGC | screw | название в две строки |
| 43 | #10 Combination Circle and Plate | 5", 6" | Galv, Mill, PA, Cu | несколько: circle + k.hr_shank_fascia | |
| 44 | Flex-A-Spout® | Available in Brown, Gray, White | — | flex | |
| 45 | Splash Blocks | Available in Green, Brown, Gray | — | splash_block | |

**Shank Notes** (HR, дословно): «#1 - for fascia, #6 - for ogee or crown moulding, fits contour, #10- for fascia, #11 - for nailing to rafter, #12 - for nailing to sheeting, #25 - for nailing to sheeting, #30 - adjustable pitch for angled end rafters and fascia»
→ соответствие: #6 = k.hr_shank_crown, #10 = k.hr_shank_fascia, #11 = k.hr_shank_rafter, #12 = k.hr_shank_sheathing, #30 = k.hr_shank_angled. #1 и #25 у нас нет. (#8 Malleable — отдельная позиция №18.)

## 3. Наши коды, которых нет ни на одном стенде

- Детали (p.*): `ds_strap` (если не считать Universal Band), `extension`, `drain`, `drain_adapter`, `splash_pan`, `splash_guard`, `expansion_joint`, `reducer`, `rain_chain`, `rain_chain_adapter`, `anchor` (есть только Drives #0 Masonry), `flat_coil`, `flux`, `solder`, `wedge`. Отдельной позиции `hanger` тоже нет, есть только конкретные виды. `guard_run` нет как погонной позиции: щитки только Hinged / Drop-In.
- Виды крюков (k.*): `k.hidden_clip`, `k.hidden_boss`, `k.hidden_speed`, `k.hidden_speed_clip`, `k.hangfast`, `k.tbar_strap`. (`k.spike` есть только косвенно, через Gutter Spike + Ferrule.)
- Крепления трубы к стене (wk.*): `wk.ds_strap`, `wk.ds_strap_masonry`, `wk.coil_strap`, `wk.u_bracket_masonry`, `wk.brick_hook` (есть только Heavy Duty), `wk.conductor_band_masonry`, `wk.pipe_cleat_masonry`. Отдельных «+ anchors» у Berger нет: вместо них Stamped/Malleable Drives (#0 Masonry, #4/#6/#5 Wood).

## 4. Как Berger называет позиции

- **Углы:** «90 Degree Box Miter - Outside or Inside» (не «Corner»); полосовой — «90 Degree Strip Miter - Outside or Inside». Слово «Corner» нигде не встречается.
- **Заглушки:** K — «End Caps - Left or Right»; HR — «"C" End Caps» (тип буквой в кавычках, без L/R). Заглушка с выпуском: K — «End Section with Outlet», HR — «"D" End Section w/ Outlet».
- **Колена:** «Elbows - A & B Style - Sq. Corrugated or Plain Sq.» / «Elbows - Plain Round or Round Corrugated». Градусов (75°/90°) нет, стиль A/B — в названии. Названий вида «A Elbow 75°» нет.
- **Выпуски:** K — «Outlets - Oval or Square» (размеры «2" x 3"… 3" Oval»); HR — «"B" Outlet Tube», «Wide Flange Round "B" Outlet». Слов «Drop Outlet» и «Drop» нет.
- **Труба:** «Square Corrugated Downspout», «Plain Square Downspout», «Plain or Round Corrugated Downspout», «Downspout Tube». Слово «Downspout» используется для самой трубы и для креплений к ней («U-Bracket Downspout Hanger», «Hinged Downspout Hook»). Слово «Conductor» — в «Conductor Head», «Conductor Band», «Conductor Bracket». Слово «Leader» не встречается ни разу.
- **Профиль трубы** пишется перед словом и сокращается: «Sq. Corrugated», «Plain Sq.», «Pl. Sq.», «Round Corrugated», «Plain Round»; фасонные части трубы — «Square Corrugated "Y" Funnel», «Square Corrugated Cutoff with Diverter», «Square Corrugated Offset», «Cutoff w/ Diverter - Round Corrugated».
- **Крюки** нумеруются: «#40 Fascia Hanger with Snap Strap», «#41 Rafter Hanger with Snap Strap», «#10 Shank Plate…», «#31 Pipe Cleat», «#14 Ornate Conductor Head». Комплектующие указаны через «with» / «w/»: «with Crossbar», «w/ Rod & Nut», «w/ Crossbar & Clip».
- **Сокращения:** «Ga.» (gauge), «Galv.», «Alum.», «Sq.», «Pl.», «w/», «oz.», «#8 x 1/2». Дюймы — прямой знак `"`, размеры через « x » с пробелами на K («2" x 3"») и слитно на HR («4"x3"»). Варианты перечисляются через « - » и «or»: «- Outside or Inside», «- Left or Right», «- Open, Closed, Sloped».
- **Рулона/полосы из рулона нет** (нет «Coil» / «Flat Coil» / «Strap from coil»). Есть только «Snap Strap» как часть крюков #40/#41.
- **Герметик** — «Gutter Mastic - 5 oz. Tube», краска — «Touch Up Paint - 12 oz. Can», сетка — «Round Wire Strainer», воронка — «Funnel» (K) / «Funnels» (HR), тройник — «"Y" Funnel». Торговые марки: «Flex-A-Spout»/«Flex-A-Spout®», «Metco», «FreedomGray®», «Regal», «Rival».
- **Опечатки поставщика** (сохранены как напечатано): «availibility» (сноска K), «High Glass White» (K №41; на HR — «High Gloss»).

## 5. Второй источник: прайс поставщика основателя (16.11.2026, через аудит)

Имя поставщика и цены в репозиторий не вносятся (правило 9). Названия — дословно, как в прайсе. Торговые марки одного поставщика («GT …», «Leaf Exterminator», «Leaf ProBlaster», «BOSS», «Speed Master») в названия детали **не** идут: каталог компании общий, марка — только в позиции прайса компании.

| Что | Как в прайсе (дословно) | Наш код |
|---|---|---|
| Заглушки K 5″ | «5” K ends (OG)», «25L / 25R» | end_cap (side L/R) |
| Заглушка fascia | «Straight Face End Cap» | end_cap (profile fascia) |
| Заглушки HR | «HR endcaps» | end_cap (profile half_round) |
| Углы | «Bay Miter», «Strip Miter», «Box miters» | miter (bay), strip_miter, miter |
| Выпуски | «round outlets 2 3/8”, 2 ¾”», «2x3 rectangle», «3x4 rectangle», «3” HR outlets» | outlet (размер) |
| Сетка на выпуск | «3” round wire strainers» | outlet_screen |
| Клин | «gutter wedge 5”/6”» | wedge |
| Воронка | «leader head 2x3 / 3x4 / 3” round» | conductor_head |
| Отбойник | «Splash block, concrete 12x24» | splash_block |
| Пайка | «Solder 50/50 tri-bar» | solder |
| Герметик | «Geocel 3300» (марка) → «Gutter Sealant» | sealant |
| Краска | «Touch up paint» | touch_up_paint |
| Водосток | «2x3x10 corrugated / smooth», «3x10 round», «3x4x10» | downspout (stickIn 120) |
| Колена | «2x3 A or B», «3” round» | elbow |
| Крепления желоба | «… HANGER 5"/6" U-CHANNEL NO CLIP / W/CLIP», «… S2», «SPEED SCREW», «HEAVY DUTY SCREW W/CLIP», «HALF-ROUND ALUM .060 W/WEDGE», «T-bar hangar straps», spikes, ferrule | k.hidden_noscrew / k.hidden_clip / k.hidden_boss / k.hidden_speed / k.hidden_hd / k.hr_* / k.tbar_strap / spike, ferrule |
| Крепёж | «#42 rivet, mill / painted», «#8 x ½ screw», «#10 x 1” screw», «#10 x 1½ / 2” …», «3/16 x 7/8 … anchor», «¼ x 1 … anchor» | rivet, screw (8x0.5, 10x1, 10x1.5, 10x2), anchor |
| Защита | «Leaf Exterminator», «… Stainless Steel Mesh», «… EZ Lock», «… EZ HR Deluxe 6.5”» | guard (вид — без марки: micro-mesh, screen, lock-in screen) |

## 6. Третий источник: ресёрч аудита (Amerimax, двуязычные инструкции)

- EN: Hidden Hanger with Screw; Downspout Band; Left / Right End Cap; Outside / Inside Box Miter 90°, Strip Miter; Slip Joint Connector; A (front) / B (side) Elbow 75°; End with Drop; Drop Outlet 2x3 / 3x4 (wide flange), narrow flange 2x3, oval 2x3 / 3x4; Wire Strainer; Leader Head; Gutter Wedge; Zip Screw #8 x 1/2" (металл к металлу); Gutter Screw #10 x 1-1/2" (крепление к доске); Pop Rivet 1/8" #42.
- ES: «canaleta» везде (не «canalón»); bajante; tapa terminal izquierda / derecha; codo frontal «A» / lateral «B»; banda para bajante; filtro contra hojas. Без устойчивого испанского — английское слово: strip miter, offset, wedge, leader head, reducer, wye, eave box.
- Выпуски, которых нет в коде: oval 2x3 / 3x4, round 2-3/8″ / 2-3/4″ / 3-3/8″, narrow flange 2x3.
