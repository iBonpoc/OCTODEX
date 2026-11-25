# #2412 · круг 4 — названия деталей в окнах Gutter / Downspout (ШАГ 0)

Источник: `docs/specs/33-gutters-part-names.md` §5 (прайс поставщика основателя, дословно), §6 (ресёрч Amerimax), стенды Berger (таблицы K/HR) как запасной вариант; английские названия деталей не переводятся (DECISIONS п.23). Цен нет. Колонка «Прайс» — дословно из §5/§6; «нет в прайсе» = слова в §5/§6 нет, взято ближайшее (откуда — указано).

| В окне (надпись) | Как в прайсе (§5 / §6, дословно) | Код модели | Где в окне |
|---|---|---|---|
| Gutter | нет в прайсе отдельной строкой (в §5 только «gutter wedge 5”/6”»); термин Amerimax/стенда | `p.gutter`, `mod.gutters.attr.run` | заголовок «Gutter № N», подпись «линия · …» |
| Downspout | §5: «2x3x10 corrugated / smooth», «3x10 round», «3x4x10»; §6 «Downspout Band» (слово «Downspout») | `p.downspout`, `mod.gutters.attr.ds` | заголовок окна, значения «Вид» |
| Elbow A / Elbow B | §5: «2x3 A or B», «3” round»; §6: «A (front) / B (side) Elbow 75°» | `p.elbow`, `ELBOW_STYLES` (rect A/B, round 30–90°) | строки «Elbow A · 75° ⌄ · − n +», у круглого «Elbow» |
| Offset (Offset A / Offset B) | нет в прайсе §5; §6 (ES-список): «offset»; стенд №45 «Square Corrugated Offset». «A/B» у offset — наша разметка (слово основателя), в прайсе нет | `p.offset`, `OFFSETS_IN` 1/2/4 | строки «Offset A · 2″ ⌄ · − n +», у круглого «Offset» |
| Extension | **нет в прайсе** (§3: «extension» нет ни на одном стенде); код-имя `Downspout Extension` → в окне коротко «Extension» | `p.extension` / `b.extension` | «Низ» |
| Splash block | §5: «Splash block, concrete 12x24»; Berger «Splash Blocks» | `p.splash_block` / `b.splash_block` | «Низ» |
| Flexible Extension | **нет в прайсе** (Berger №44/49 «Flex-A-Spout» — торговая марка, в окно не идёт); код-имя `Flexible Extension` | `p.flex` / `b.flex` | «Низ» |
| Drain Connection | **нет в прайсе**; код-имя `Drain Connection` (стенда нет, §3) | `p.drain` / `b.drain` | «Низ» |
| На нижнюю крышу | не деталь, а наше слово (`b.lower_roof`, «Onto lower roof») — по-русски | `b.lower_roof` | «Низ» |
| Funnel | **нет в прайсе §5/§6**; Berger K №30 «Funnel» | `head: "funnel"`, `h.funnel` | «Верх» |
| Leader Head | §5: «leader head 2x3 / 3x4 / 3” round»; §6 «Leader Head» | `p.conductor_head`, `head: "conductor"` | «Верх» |
| Wire Strainer | §5: «3” round wire strainers»; §6 «Wire Strainer» | `p.outlet_screen`, `ds.outletScreen` | «Ещё», переключатель (вместо «Сетка на выпуске»/«Outlet screen») |
| Rain barrel diverter | **нет в прайсе**; Berger №44 «Cutoff with Diverter» (код-имя в приложении «Rain barrel diverter» оставлено — понятнее, чем «Cutoff») | `p.diverter`, `ds.diverter` | «Ещё», переключатель |
| Reducer | **нет в прайсе §5**; §6 (ES-список) «reducer»; код-имя `Reducer`. В окне вместо «Size reducer» из DECISIONS п.38 — «Reducer» (слово прайса-ресёрча) | `p.reducer`, `ds.reducers` | «Ещё», переключатель |
| Outlet | §5: «round outlets 2 3/8”…», «2x3 rectangle», «3x4 rectangle»; §6 «Drop Outlet 2x3 / 3x4» | `p.outlet` | **в окне Downspout не показывается** (ставится сам с downspout, п.38) |
| Downspout Band | §6 (EN): «Downspout Band»; (ES: «banda para bajante») | `p.ds_strap` («Downspout Band»), `wk.ds_strap` | меню «Крепление к стене» (вместо «Downspout Strap» из ресёрча крепления: слово «Strap» для трубы в прайсе нет) |
| Hidden Band | **нет в прайсе**; ресёрч крепления: «Hidden Strap / Hidden Bracket» (Amerimax vinyl hidden band); взято «Hidden Band» по аналогии с «Downspout Band» (§6) | новый (в модели нет) | меню «Крепление к стене» |
| Sickle Hook | Berger K №18 «Square Stamped Sickle Hook», HR №16 «Stamped Plain Round Sickle Hook»; в прайсе §5/§6 нет | `wk.sickle_hook` | меню «Крепление к стене» |
| Brick Hook | Berger №20/№17 «Heavy Duty Channel Brick Hook» (простого Brick Hook на стенде нет, §3); в прайсе нет | `wk.brick_hook` / `wk.brick_hook_hd` | меню «Крепление к стене» |
| Pipe Cleat | Berger HR №26 «#31 Pipe Cleat» (номер #31 в окно не идёт); в прайсе нет | `wk.pipe_cleat` | меню «Крепление к стене» |
| Conductor Band | Berger K №19 «Metco Ornamental Conductor Band» (марка «Metco» не идёт); в прайсе нет | `wk.conductor_band` | меню «Крепление к стене» |
| Rack & Key Set | Berger №38/№37 «Rack & Key Set» (в ресёрче «Rack & Key»); в прайсе нет | нет у нас (§3) | меню «Крепление к стене» |
| High Gloss White (и цвета) | Berger K №41 печатает опечатку «High Glass White», HR — «High Gloss»; в прайсе цвета не перечислены | цвет — данные модуля | цвета в окне «Цвет» и в строке «Цвет» |
| K | §5: «5” K ends (OG)», стенд «K-Style» | `profile: "k"`, `p.k` «K-style» | «Профиль» |
| Hidden Hanger | §5: «… HANGER 5"/6" U-CHANNEL NO CLIP / W/CLIP»; §6 «Hidden Hanger with Screw» | `k.hidden*` | значения «Крепление» gutter (в кадрах — «Выберите») |

Наши слова — по-русски: Размер, Цвет, Этаж, Профиль, Крепление, Материал (значение «Алюминий»), Толщина, Край крыши, Низ, Верх, Стена, Крепление к стене, Своя высота, Ещё, Закрыть, Сохранить, Ничего, «Свой…», «Выберите».

## Расхождения с запросом (слова «нет в прайсе» и поправки)
- «Size reducer» → **Reducer** (по §6); «Outlet screen» → **Wire Strainer** (прайс); «Downspout Strap» → **Downspout Band** (§6); «Pipe Cleat / Conductor Band» разделены на два пункта (это две разные детали у поставщика); «Rack & Key» → **Rack & Key Set**; «Hidden Strap» → **Hidden Band** (в прайсе нет вообще, имя по аналогии).
- Нет в прайсе вовсе: Extension, Flexible Extension, Drain Connection, Funnel, Rain barrel diverter, Reducer, Hidden Band, Sickle Hook, Brick Hook, Pipe Cleat, Conductor Band, Rack & Key Set, Offset A/B (A/B), Gutter (отдельной строкой).

## ДОПОЛНЕНИЕ 23.11: каталог Berger (фото основателя, v4/references/berger-chart-3…12.jpg — K-Style и Half Round, схема и таблица деталей)
Основатель прислал настоящие стенды поставщика (Berger). Слова из таблицы стенда (дословно) — ЕДИНСТВЕННЫЙ источник названий. Многое из «нет в прайсе» на стенде ЕСТЬ — перепроверить при следующем круге (проверить каждую позицию по фото, не по памяти):
- Sickle Hook → «Square Stamped Sickle Hook» (K), «Stamped Plain Round Sickle Hook», «Cast Plain Round Sickle Hook» (HR); Brick Hook → «Heavy Duty Channel Brick Hook»; Pipe Cleat → «#31 Pipe Cleat»; Conductor Band → «Metco Ornamental Conductor Band»; Universal Band → «Universal Band»; U-Bracket → «U-Bracket Downspout Hanger»; «Conductor Bracket Downspout Hanger»; «Sq. Side Fasten / Wire Downspout Hooks»; «Hinged Downspout Hook – Plain Round / Round Corrugated»; Rack & Key → «Rack & Key Set» (+«Key Only»).
- Funnel → «Funnel», «Square Corrugated “Y” Funnel»; Diverter → «Square Corrugated Cutoff with Diverter» / «Cutoff w/ Diverter – Round Corrugated» (это и есть «Rain barrel diverter»: на стенде «Cutoff with Diverter»); Offset → «Square Corrugated Offset»; Elbows → «Elbows – A & B Style – Sq. Corrugated or Plain Sq.» / «Elbows – Plain Round or Round Corrugated»; Extension/Flexible → «Flex-A-Spout»; Splash Blocks; Downspout Tube; Eave Box; Leader/Conductor Head → «#14 Ornate Conductor Head, Soldered», «Plain Tapered Conductor Head, Riveted», «Molded Universal Conductor Head»; Outlet → «Outlets – Oval or Square», «End Section with Outlet», «“B” Outlet Tube», «Wide Flange Round “B” Outlet»; Wire strainer → «Round Wire Strainer»; Reducer — на стенде нет (нет в прайсе).
- Hidden hanger → «Hidden Hanger», «Hidden Hanger with Screw», «Heavy Duty Hidden Hanger»; «#40 Fascia Hanger with Snap Strap», «#41 Rafter Hanger with Snap Strap», «Snap Strap», «Premium Fascia Hanger with Crossbar», «Wrap Around Hanger», «Roof Bar Hanger with Rod & Nut», «Custom Crossbar Hanger», «Gutter Spike / Gutter Screw», «Ferrule».
- «Hidden Band», «Downspout Strap», «Reducer», «Size reducer» — на стенде НЕТ: убрать или заменить словом стенда (Universal Band / Wrap Around Hanger / ...).
- Цвета (Half Round, фото основателя): Natural Clay, Musket Brown A, Royal Brown, AMP Dark Bronze, Black, Grecian Green, Dark Bronze, 80 White. K-Style: «Call for Available Colors»; цвета — по settings.ts PALETTES.
- Профиль Fascia — картинка references/fascia-profile.jpg (форма разреза для значка профиля «Fascia»). Скрытый крюк Hangfast (K&M) — references/hangfast-hidden-hanger.jpg (внешний вид Hidden Hanger для значка/пояснения).
