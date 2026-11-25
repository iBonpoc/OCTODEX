/**
 * OCTODEX design tokens (from the founder's "Naryad" design system) — single source of truth for the app (iOS, Android, tablet, web).
 * Mirrors design/naryad-ds/tokens/{foundation,components,theme,status}.css one to one.
 * Rule: no component may use a value that is not here. Change a token → it changes everywhere.
 */
export * from "./icons";
export { extraIcons } from "./extraIcons";
export { graphite, graphiteThemes, type GraphiteColors, type Graphite } from "./graphite";

/* ---------- foundation.css ---------- */
export const font = {
  /** redesign #2348 (decision 06): the system font — SF on iOS, Roboto on Android, system-ui on the web */
  /** founder 21.11 (#2350): a geometric sans like his references (Poppins has no Cyrillic → Manrope) */
  family: "Manrope",
  /** RN needs one family per weight (custom fonts ignore fontWeight on Android). */
  families: {
    regular: "Manrope_400Regular",
    medium: "Manrope_500Medium",
    semibold: "Manrope_600SemiBold",
    bold: "Manrope_700Bold",
  },
  /** visual language v2 (docs/design/visual-v2.html «Визуальный язык числами», founder 21.11): the screen title 30/600, a tile's figure
   *  26/700 (two in a row) and `figureSm` 18/700 (three in a row), a card 17/700, text 15/500–600, the second line 13/500, a caption 12/600;
   *  not more than five sizes on one screen */
  size: { display: 30, title: 22, heading: 17, body: 15, button: 15, caption: 13, micro: 12, input: 16, figure: 26, figureSm: 18 },
  /** letter spacing as a share of the size (em): the screen title −0.02 em, a figure −0.01 em (v2) */
  tracking: { display: -0.02, figure: -0.01 },
  lineHeight: { tight: 1.15, body: 1.45, snug: 1.35 },
  weight: { regular: "400", medium: "500", semibold: "600", bold: "700" },
  /** Minimum readable text size (DS rule 6). */
  minSize: 12,
  /** Dynamic Type: small labels that sit in a fixed shape (tab labels, StatusPill, QuickActions, a day pill) grow at most this much (BUILD-SPEC §0) */
  labelMaxScale: 1.5,
  /** a one-line screen title (`T fit`): shrinks to at most this part of its size before it is cut (30 → 22,5; the founder 21.11, #2350) */
  fitMinScale: 0.75,
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;
/** half steps (foundation.css --space-hair / --space-tight): label↔value inside a tile, gap in a chip */
export const spaceHalf = { hair: 2, tight: 6 } as const;
/** the rhythm of a screen (visual v2, founder 21.11): the screen's side padding 16, between cards 8, inside a card 16 (its rows 12),
 *  between blocks 20, a block's title → its content 10 */
export const rhythm = { screen: 16, cardGap: 8, cardPad: 16, rowGap: 12, blockGap: 20, headGap: 10 } as const;

export const radius = {
  pill: 999,
  field: 12,
  chip: 999,
  /** redesign #2348: calmer, iOS 26 inset-grouped */
  card: 22,
  inner: 14,
  sheet: 28,
  tip: 8,
} as const;

export const size = {
  controlSm: 28,
  controlMd: 32,
  field: 34,
  hitMin: 44,
  /** Android touch target (Google Play / Material 48 dp) */
  hitMinAndroid: 48,
  /** visible button on a phone (--control-lg / --control-md-phone) */
  /** redesign #2348: the phone's main / secondary button 50 (gloves, thumb; rule 3 — founder's decision pending) */
  /** founder 21.11 (#2350): «кнопку 50 я бы не делал» — compact 40, the touch zone stays 44 */
  controlLg: 40,
  controlMdPhone: 36,
  fieldPhone: 44,
  // #2350: основной размер значков 24 (основатель 21.11.2026: «измени на 24, не 22»); всё ×1,2 от прежних 12/16/20/24
  iconXs: 14,
  iconSm: 18,
  iconMd: 24,
  iconLg: 28,
  iconStroke: 1.75,
  statusbarH: 44,
  tabbarH: 56,
  safeBottom: 34,
  fab: 52,
  /** list rows (clients, dropdown items, price list) — not buttons */
  rowMin: 48,
  rowMax: 60,
} as const;

export const motion = {
  durFast: 160,
  durBase: 220,
  durSlow: 350,
  /** a press held this long is a long press (iOS 0.5 s): the canvas takes an end or a corner by it (founder 12.11, #818) */
  longPressMs: 500,
  /** a second tap on the same object within this is a double tap (app-only like longPressMs; = the toast's arm time): the canvas opens properties by it (spec 33, #1273) */
  doubleTapMs: 300,
  /** a downspout just put blinks this many beats (off, on, …) and only then its sheet opens (founder 16.11, #1763: «вначале
   *  моргнул, помигал, а потом открылось меню… полсекунды»); app-only like doubleTapMs; reduce motion — no blink, the sheet at once */
  blinkSteps: 4,
  /** one beat of that blink, ms: blinkSteps × blinkStepMs = 0.5 s */
  blinkStepMs: 125,
  durChart: 900,
  /** DS §14 (Ш III-1): a press shrinks the control this fast, ms (the release is the spring) */
  durPress: 80,
  easeOut: [0.2, 0.8, 0.2, 1] as const,
  /** DS §18.2 (#1394): a fade-out that starts gently and ends at full speed — the launch layer leaving */
  easeIn: [0.4, 0, 1, 1] as const,
  /** components.css --ease-spring (overrides foundation's .3,1.4,.5,1) */
  easeSpring: [0.3, 1.25, 0.5, 1] as const,
  easeLiquid: [0.3, 1.35, 0.5, 1] as const,
  /** DS §14.2 (#brand): the mark's own curves — a symmetric ease for the loop and the dot's way; the way of a quick launch; the fold */
  easeInOut: [0.45, 0, 0.55, 1] as const,
  easeBrandWay: [0.4, 0, 0.6, 1] as const,
  easeBrandFold: [0.45, 0, 0.35, 1] as const,
  liquidStretch: 160,
  liquidSettle: 420,
  pressScale: 0.95,
  /** DS §14.6 (Н-28): a lifted card / row grows to this scale and tilts by `liftTilt` degrees */
  liftScale: 1.05,
  liftTilt: -2,
  /** DS §14 (Н-10): a menu grows from this scale to 1 when it opens */
  menuScale: 0.96,
  /** DS §14 (Н-11): a dialog shrinks from this scale to 1 when it opens */
  alertScale: 1.06,
  /** #2405 (founder 22.11: «коллапсирует без анимации, просто прыгает»): the estimate's «Итого» folding to the capsule and back —
   *  the capsule slides in by `foldShift` from the right growing from `foldScale`, the card comes up by `foldShift` (durBase, easeOut) */
  foldShift: 12,
  foldScale: 0.92,
  /** DS §14.2 (Н-26): one pulse of a skeleton, ms */
  skeletonCycle: 1800,
  /** Reanimated spring roughly equal to the CSS spring curve above. */
  spring: { damping: 16, stiffness: 220, mass: 0.9 },
  toastUndoMs: 5000,
  /** DS §15.2 (Н-02): a plain toast stays this long, ms */
  toastInfoMs: 2600,
  /** DS Б8 (Н-06): a toast with an action stays this long for a screen-reader user */
  toastUndoA11yMs: 10000,
  /** DS §13 (Н-07): a spinner / skeleton shows only after this delay, so a fast load does not flash */
  spinnerDelayMs: 300,
  /** DS §7.4 (Н-37): a button in loading says «failed» after this long */
  actionTimeoutMs: 10000,
  /** app-only: «Отменить» on a toast ignores taps this long after it shows — the second tap of a double tap
   *  must not undo what the first one made (reduced motion shows the toast at once, under the finger) */
  toastArmMs: 300,
  /** app-only (DS Б8, #2214): toasts stand in a stack of at most this many, the newest on top; a fourth pushes the oldest out */
  toastStack: 3,
  /** app-only (spec 24 A4): delay between columns / bars growing one after another */
  chartStagger: 40,
  /** DS §14.2 (#brand): the GoRix mark's splash, ms — longer than a chart's growth (durChart), only here */
  durBrand: 1600,
  /** DS §18.2 (#1156): the short launch on GR (the dot drives in), the dot fading at the ends of the wait's loop,
   *  the intro's pause and its fold GoRix → GR — only the brand */
  durBrandQuick: 600,
  durBrandEdge: 120,
  durBrandPause: 150,
  durBrandFold: 450,
  /** DS §18.2 (#1394): the launch keeps the mark still this long; only a longer load shows the wait with its word */
  durBrandHold: 1000,
  /** DS §18.2 (#1394): the launch layer's mark grows to this while it fades into the first screen */
  brandExitScale: 1.06,
  /** DS §18.2 v4.4 (#1394): the layer's fade waits this long after the mark starts growing — the growth is seen */
  brandExitFadeDelay: 60,
  /** DS §18.2 v4.4: the dot's one soft bounce on its place (up, down, a light squash); the lift — a share of the dot's
   *  diameter, the squash — of its size */
  durBrandBounce: 380,
  brandBounceLift: 0.6,
  brandBounceSquash: 0.15,
  /** DS §18.2 v4.4: the first launch after install (the dot along the G, the bounce, the exit) takes no longer */
  durBrandFirstMax: 1200,
  /** DS §18.2 v4.4: a wait once shown stays at least this long — the word does not flash */
  durBrandWaitMin: 500,
} as const;

export const z = { /** DS §14.6: the plain level — under its neighbours */ under: 0, /** just above its neighbours (a layer that covers, a dragged row's siblings) */ over: 1, /** DS §14.6: the row in a hand, above `over` */ dragged: 2, nav: 2, fab: 4, scrim: 5, sheet: 6, modal: 7, toast: 8, /** DS §14.6 (Н-27): a lifted card — above the neighbours, below the chrome */ lift: 3 } as const;

/** DS §14.6 (Н-28, Н-87): the numbers of a drag — app-only tokens (not in the DS css) */
export const gesture = {
  /** a finger holds a folded card / row this long to lift it (otherwise it is a scroll) */
  dragHoldMs: 230,
  /** #2375 (founder 22.11: «срабатывает моментально, случайно хватаю позицию»; 21.11 «зажал ~0,5 с»): an estimate line is taken
   *  by a finger only after this hold — its body and its «⠿» alike (the board keeps `dragHoldMs`) */
  sortHoldMs: 500,
  /** a mouse (or a handle) moves this far to start a drag, px */
  dragStart: 5,
  /** near the top / bottom edge of the screen this wide the page scrolls while a row is held, px */
  autoScrollEdge: 64,
  /** the fastest the page scrolls at the very edge while a row is held, px a frame (the speed grows with the depth squared) — DS §14.6 */
  autoScrollMax: 18,
  /** a held row's place changes only once its middle is this far past a neighbour's middle (no flicker between two places), px */
  slotHysteresis: 6,
  /** a finger moves this far and the gesture is «taken» (swipe of a row, sheet body, back swipe), px — DS §14.6, Н-19 */
  slop: 10,
  /** a full row swipe, once armed, is let go only this far back inside its line (no flicker on the line), px — DS Б13 п.2 */
  swipeFullHysteresis: 10,
  /** a row swipe starts no closer than this to the left edge of the screen: nearer is the system «back», px — DS Б13 п.2 */
  edgeGuard: 24,
} as const;

/* ---------- components.css ---------- */
export const component = {
  /** visual v2: the phone's capsule 40, the icon in it `glyph` 18 */
  button: { sm: 32, md: 36, phone: 40, hit: 44, glyph: 22 },
  field: { h: 40, phone: 44 },
  chip: { h: 24, px: 10 },
  /** visual v2: the segment 36 high, radius 18 (a pill), the track 3 inside; the chosen one is a 15-radius pill (`h / 2 − pad`), text 13/600 */
  segmented: { h: 36, pad: 3 },
  /** DS §8.7а (founder 23.11, MAP §12 п.8): a totals row «Скидка / Налог / Депозит» — the value field right in the row, `fieldW` wide; the sum a right-aligned column `sumW` (the fields of the rows stand in one column) */
  modeRow: { fieldW: 96, sumW: 80, titleW: 112 },
  /** a tab of a screen (pill); `fadeW` — the row of view tabs fades this wide at an edge that has more tabs past it (DS §9 А1п, #1343) */
  tab: { h: 30, fadeW: 32 },
  /** DS §9 А5 (spec 56 §3.3, wave 1а): the knob 18 (was 16), pad 2 inside the 1-px edge */
  switch: { w: 42, h: 24, knob: 18 },
  help: { visible: 18, icon: 11 },
  tip: { fs: 13, px: 8, py: 4, radius: 8, max: 220, gap: 6 },
  fab: 52,
  dockBtn: 40,
  /** a module's tape measure: px between two marks, 1/16″ or 1 mm — stretched over a real tape so a finger can hit a mark (founder 13.11.2026, #1315: «чуть растянутая, ничего страшного») */
  tapeTick: 16,
  sheetRadius: 24,
  modalW: 380,
  /** DS Б3 (Н-04): the confirm dialog's max width */
  alertMaxW: 340,
  /** DS Б1 (Н-08): a sheet of medium height is this share of the screen */
  sheetMediumRatio: 0.5,
  /** DS Б6 (Н-09): a popover's width */
  popoverW: 360,
  panelW: 360,
  /** side menu on 820/1280 (docs/specs/13 §2.5): icon rail with labels / the open menu. Not in the DS css yet (BACKLOG). */
  navRail: 72,
  navMenu: 232,
  paletteW: 560,
  avatar: { sm: 28, md: 36 },
  /** company logo preview (settings, client page, PDF) */
  logo: 96,
  stepDot: 10,
  /* ---- app-only tokens (not in the DS css yet; same style, keep here so components never use raw numbers) ---- */
  /** company logo stored size, px (image processing) */
  logoPx: 256,
  /** a signature stroke, px (the pad, the full-screen pad, the preview) */
  signStroke: 2.4,
  /** app-only (#2215): the smooth pen — the stroke's width from the finger's speed (segment length per sample, in field px):
   *  ≤ `slow` px → `thick` × signStroke, ≥ `fast` px → `thin` × signStroke; the width follows by `follow` per sample (no jumps)
   *  and is drawn in `levels` steps (one path per step) */
  signInk: { thin: 0.6, thick: 1.3, slow: 2, fast: 24, follow: 0.35, levels: 5 },
  /** «Ещё» on 820/1280: one column of menu rows, not wider than the palette (spec 25) */
  menuListMax: 560,
  /** charts of «Сегодня» (spec 24 A3; «Наряд» prototype column bars r8 / min 4 / muted .55, track 8; height 130 → 120 for the phone) */
  chart: { h: 120, barRadius: 8, barMin: 4, track: 8, mutedOpacity: 0.55 },
  /** compact row (lines of an estimate, small lists) */
  rowCompact: 40,
  /** signature pad, receipt photo */
  mediaH: 160,
  /** scroll area inside a bottom sheet: list / form */
  sheetListMax: 380,
  sheetFormMax: 560,
  /** narrow numeric field (qty in a kit) */
  qtyFieldW: 72,
  /** value column of a stepper */
  stepperValueW: 56,
  /** two side by side (founder 21.11.2026, #2350: «две кнопки в столбик — две кнопки в ряд… селекторы… в ряд, если помещаются»; DS §7.4):
   *  `labelMax` — the longest label (characters) a button of a pair may have and still stand in a row; `charEm` — the average width of a
   *  button character as a share of `size.button` (Manrope, Latin and Cyrillic), to tell if a label fits its half; `fieldMin` — the
   *  narrowest a field of a `FieldRow` may be (a date «Wed, Nov 18», a time «12:45 PM» with the chevron) */
  pair: { labelMax: 16, charEm: 0.62, fieldMin: 150 },
  /** sheet grabber */
  grabber: { w: 36, h: 4 },
  /** progress bar of Steps */
  stepBar: 4,
  /** colored status edge on cards */
  statusEdge: 3,
  /** selected card / drop target border */
  selectedBorder: 2,
  /** the small shadow of a raised «Заливка» (the chosen segment, tab, chip): DS «Выделение выбранного», foundation.css --shadow-sm */
  shadowSm: { offsetY: 2, radius: 8, opacity: 0.25, /** Android has no shadow* props: the same lift as `elevation` (app-only, not in the CSS) */ elevation: 2 },
  /** a button under a swiped row: width (DS Б13, Н-23); `full` — the share of the card for a full swipe (common lists, after 1.0; the estimate has none) */
  swipeAction: { w: 80, full: 0.6 },
  /** DS §18.2 (#1156): the GoRix mark («Страницы нет», «Новая компания»), the full-screen wait, the «О приложении» logo, the splash, the first-launch intro */
  brand: { mark: 48, wait: 56, about: 160, splash: 120, intro: 200 },
  /** DS §8.3 (#1307): the open estimate line's numbers in one row — the quantity and the unit narrow, the price takes the rest */
  estRow: { qty: 80, unit: 88 },
  /** hairline border */
  hairline: 1,
  /** drag preview handle */
  dragHandle: 16,
  /** the shadow of a lifted card or row at full lift (opacity) */
  liftShadow: 0.35,
  /** checklist checkbox */
  checkbox: { size: 22, radius: 7, border: 1.5 },
  /** gap between photo thumbnails */
  /** photo thumbnail side */
  photoThumb: 72,
  /** bottom sheet: share of the screen height before it is pulled up to full height */
  sheetHeightRatio: 0.88,
  /** bottom sheet release rule (DS Б1, from iOS 26.2 measurements, #1163): the sheet goes where it would be in
   *  `sheetProjectMs` ms (drag + speed × time) — past `sheetDismissRatio` of its height it leaves, else it comes back;
   *  below `sheetSlowVelocity` (pt/ms) the speed does not count; from `sheetFlickVelocity` (pt/ms) down it always leaves */
  sheetDismissRatio: 0.5,
  sheetProjectMs: 100,
  sheetSlowVelocity: 0.25,
  sheetFlickVelocity: 1,
  /** bottom sheet: pull up this far (pt) to open it to full height */
  sheetExpandDrag: 60,
  /** bottom sheet body: a downward move this long (pt) at the top of the scroll becomes a swipe to close, not a tap */
  sheetBodySlop: 10,
  /** width of the countdown ring around the toast Undo button */
  toastRing: 2,
  /** widest "‹ Parent" back button in a header */
  backMax: 220,
  /** widest crumb in the header trail ("Today › Clients › …"); longer names end with "…" */
  crumbMax: 160,
  /** dimmed element: disabled control, day outside the shown month */
  dimOpacity: 0.45,
  /** iOS-style menu that opens at the control (status, quick choices) */
  menuW: 240,
  /** a menu shows at most this many rows (the last one half — it scrolls); a longer list is a PickerSheet (DS А2, #1164) */
  menuMaxRows: 6.5,
  /** choosing a value (DS §9б, council 23.11.2026, #2412): the value menu is as wide as its words — `menuW`…`menuMaxW`, `menuGap` under
   *  the field; a list (not a menu) opens past `menuMaxItems` items or a label longer than `menuMaxChars`, or when a row has a picture;
   *  search from `searchFrom`; the picture of a part `thumb`; a colour's sample — `swatchField` in the field, `swatchRow` in the list */
  select: { menuMaxW: 280, menuGap: 6, menuMaxItems: 12, menuMaxChars: 22, searchFrom: 13, thumb: 40, swatchField: 18, swatchRow: 24 },
  /** list cards (docs/specs/06-list-cards.md): option row in a picker sheet; narrowest figure tile */
  rowOption: 48,
  tileMin: 78,
  /** choice controls (DS §9, spec 56 wave 1а): a tile of `OptionTile` (≈ 100 × 76, not wider than 120 — the row stays left on 1280, А2б); the «⊖» of a repeated value — visible 22,
   *  the zone 44 (А14а); its label button — not wider than 110 (the row on 390: ⊖ 36 + label 110 + 8 + field 204) */
  optionTile: { h: 76, maxW: 120 },
  valueIcon: 22,
  valueLabelMax: 110,
  /* ---- prototype v2 (docs/design/BUILD-SPEC.md §1, BUILD-PLAN §1 поток А; approved by the lead №21, 21.11.2026) ---- */
  /** GroupedList / ListRow: a row from `h` 56 (initials 36 · title 15 · line 13); separators start `inset` 64 from the left (past the initials) */
  /** `timeW` — the hour column of a row («8:30», as in the Plan; GroupRow `lead={{ time }}`) */
  listRow: { h: 56, inset: 64, timeW: 52 },
  /** StatTile (visual v2): two in a row `h` 112 (figure 26), three in a row `hSm` 92 (figure 18); the icon `glyph` 15 in a circle `icon` 28
   *  top left, the word 12 over the figure, the unit 12 paler; one tile of a screen may be the yellow one */
  statTile: { h: 112, hSm: 92, icon: 28, glyph: 18 },
  /** DayStrip (visual v2): pills 46 × 64 (radius 23), 7 fill the 358 row with `gap` 6; the day 12/600 over the number 17/700, the «есть выезды» dot `dot` 4 */
  dayPill: { w: 46, h: 64, dot: 4, gap: 6 },
  /** StatusPill (visual v2): 24 high (`chip.h`), radius 12, the icon `icon` 13 and the word 12/600, padding `padL` 7 · `padR` 9 */
  statusPill: { icon: 16, padL: 7, padR: 9 },
  /** CheckList (visual v2): the circle `dot` 20 (empty — a dashed `dash` 1.5 ring), a row `row` 34, one line `line` 1 on the left through the circles */
  checkList: { dot: 20, row: 34, line: 1, dash: 1.5, glyph: 13 },
  /** FigureRow «цифры справа» (visual v2): a card from `h` 64, the icon square `icon` 40 with radius `iconRadius` 13, a value column `colW` 64 */
  figureRow: { h: 64, icon: 40, iconRadius: 13, colW: 64 },
  /** TimeSlot (visual v2): the hour column `timeW` 44 (hour 15/700, duration 12), the interval plate `interval` 26 of two halves, the notch `notch` 8 */
  /** `meridiem` — «AM»/«PM» in the interval plate: two letters in a column beside the hour, the column as high as a digit
   *  (founder 21.11, #2363: «вместе высотой как цифра», each letter ≈ half a digit) — the letter `meridiem` 6 on a line `meridiemLine` 5 */
  timeSlot: { timeW: 44, interval: 26, notch: 8, meridiem: 6, meridiemLine: 5 },
  /** #2363 q72 (founder 21.11: вариант А): the estimate's «Итого» folds into a capsule on the right after scrolling down `down`
   *  24 pt; it opens again after scrolling up `up` 8 pt, at the very top, or by a tap */
  totalFold: { down: 24, up: 8 },
  /** round buttons (visual v2): 40 in the header (on a `surf` card), `card` 32 inside a card, `quick` 44 in the quick-actions row with a 12 caption */
  roundButton: { header: 40, card: 32, quick: 44 },
  /** the phone's tab bar (visual v2): 56 (`size.tabbarH`) + the bottom zone; the icon `icon` 22 over the word 12; the top `fade` 18 fades into `tab` */
  /** `badge` 18 — the red count on «Лиды» (founder 21.11, #2363 q78), its number `badgeText` 11 */
  tabBar: { icon: 26, fade: 18, badge: 18, badgeText: 11 },
  /** app-only (#2214, DS §15.3б): the offline queue's thin line over the tab bar — its height (the hit area grows to 44 by Press) */
  queueLine: { h: 28 },
  /** QuickActions / IconRow: `row` — a circle 44 with a 12 label under it, the cell `labelW` 64, between cells `gap` 8; `inline` — a circle 36 (zone 44) in the address line */
  quickAction: { row: 44, inline: 36, labelW: 64, gap: 8 },
  /** IconRow (BUILD-PLAN поток Б): between the icon buttons */
  iconRow: { gap: 8 },
  /** MainStep: the reason line stands this far above (or under) its button */
  mainStep: { reasonGap: 4 },
  /** ObjectHeader: the folded header is not taller than `maxH` 104 (no status bar); after `collapseAt` 24 pt of scroll it shrinks to one line 44 */
  objectHeader: { maxH: 104, collapseAt: 24 },
  /** HeaderActions (search, «＋», bell, «⋯»): a circle 36 without a fill, the zone 44 (BUILD-SPEC §1 HeaderActions) */
  headerIcon: 36,
  /** the main button pinned at the bottom of an object / editor (MainStepBar, ActionBar): 44 full width (founder 21.11, #2350) */
  mainBar: 44,
  /**
   * The one header (docs/design/visual-v2.html «Единая шапка», «Сворачивающаяся шапка»; app-only, not in the DS css yet).
   * `row` — the icons row 48 under the status bar; `big` — the big block 64 (a 13 line + the 30 title, or «Имя | две строки»);
   * `bar` — the folded header, one line 52 (the editor's one line too); `circle` — the round header button 40 (`icon` 20, zone 44);
   * `sheetClose` — a sheet's «×» 32; `chevron` — the «⌄» 24 after a client's name; `avatarRing` — the root avatar's ring 1,5 (gap 2);
   * `rule` — the line 1 × 40 between the name and its two lines; `demo` — the «Демо» plate 20 (dot 6) and the folded dot 6;
   * `titleTrack` — the 30 title's tracking (−0,02 em); `plate` — the folded row's ground is `ov` with the hairline.
   * `root` / `object` — the scroll points (pt) of the storyboard: what fades and moves between which, `end` — folded from here;
   * `settle` — let go between the ends, the header goes to the nearer one (the half: 32 / 56) in `motion.durBase` with `easeOut`;
   * `flick` — a fling down this fast (pt/ms) folds it at once; Reduce Motion — the big block and the small title swap by a fade
   * `motion.durFast` at the half, no shift, no scale.
   */
  header: {
    row: 48,
    big: 64,
    bar: 52,
    circle: 40,
    sheetClose: 32,
    sheetRow: 52,
    chevron: 24,
    avatarRing: 1.5,
    ringGap: 2,
    rule: 40,
    demo: { h: 20, dot: 6, px: 8 },
    titleTrack: -0.6,
    /** the folded title is this part of the big one (30 → 17) */
    foldScale: 0.57,
    /** the root avatar folded: 40 → 36 */
    avatarFold: 0.9,
    /** the folded row's ground: the screen's `bg` at 92 % over a blur, and the hairline (v2 «свёрнутая строка» rgba … .92) */
    plateAlpha: 0.92,
    /** the bell's dot 8 (v2 «колокольчик (точка 8)»; the count is in its VoiceOver label) */
    bellDot: 8,
    /**
     * `hold` — the big block stands still for the first pt of the scroll (root: 16 — «уезжает вверх на 48» over 16–64; object: 56 —
     * the name waits while the quick actions and the two lines go, then goes into the row on 56–112); `shiftX` — the name slides right
     * to the row's title place, right of «←» (40 + 8). The block never shows above the row's bottom (`bigClip`).
     */
    root: { end: 64, kickEnd: 24, titleFrom: 16, titleFadeFrom: 40, miniFrom: 40, miniShift: 8, plateFrom: 48, hold: 16 },
    object: { end: 112, actionsEnd: 48, actionsShift: 12, subFrom: 32, subEnd: 72, titleFrom: 56, titleFadeFrom: 80, parentFrom: 56, parentEnd: 80, miniFrom: 80, miniShift: 8, plateFrom: 96, plusFrom: 96, hold: 56, shiftX: 48 },
    flick: 1,
    slow: 0.25,
    /** the web has no finger lifting: the scroll that stops this long (ms) between the ends is let go (v2 «Отпустил посередине») */
    pauseMs: 120,
    /** the open contacts panel over a folded header closes when the page goes this far (pt) */
    panelCloseScroll: 8,
  },
} as const;

/* ---------- breakpoints (HANDOFF: 390 / 820 / 1280) ---------- */
export const breakpoint = { phone: 0, tablet: 820, desktop: 1280 } as const;
export const layout = { contentMax: 1200, formMax: 560, gridCols: { phone: 1, tablet: 2, desktop: 3 } } as const;

/* ---------- theme.css + status.css ---------- */
export type ThemeName = "dark" | "light";
export type StatusName = "ok" | "info" | "warn" | "bad" | "neutral";

export interface GlowSpot {
  /** position as fraction of the screen */
  cx: number;
  cy: number;
  /** radius in px (ellipse rx/ry) */
  rx: number;
  ry: number;
  color: string;
  opacity: number;
}

/** the screen ground as a linear gradient (founder 21.11: «тёплый 100 %» in the accent picker); points are fractions of the screen */
export interface GroundGradient {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: { offset: number; color: string }[];
}

export interface ThemeColors {
  page: string;
  bg: string;
  ink: string;
  mut: string;
  surf: string;
  surf2: string;
  /** `surf` laid over `bg`, opaque: the tone a card shows to the eye, for a thing that must hide what is under it (a swiped row) */
  surfSolid: string;
  in: string;
  bd: string;
  /** the frame of an input field (DS §8.1, #1594): ≥ 3:1 to the screen `bg` (WCAG 1.4.11); `bd` stays for cards and quiet lines */
  bdField: string;
  track: string;
  ov: string;
  /** `ov` without the transparency: the glass of a floating layer where the glass must not show the content (the tab bar's fallback panel, DS §6.4; «Reduce transparency», #1467) */
  ovSolid: string;
  acc: string;
  onAcc: string;
  /** palette A: the frame of an accent fill without text (a chosen day, a chip) where the fill alone is < 3:1 to the ground — light theme */
  accEdge: string;
  /** palette A: the accent as text or a link on a card (the fill colour is too light for text on the light theme) */
  accText: string;
  /** visual v2: the accent as a quiet tone (16 % / 30 %) — a chosen day, the nearest interval, a not-main yellow: never a second fill */
  tint: string;
  /** a stronger tone (the first half of the nearest interval) */
  tint2: string;
  /** visual v2 layers: the chosen cell, one step over `surf2` (the cell) */
  surf3: string;
  /** visual v2: the 1-pt highlight along the top of a card (no frames) */
  hl: string;
  /** a quiet line drawn inside a card (the checklist's line, the vertical bar of a header) */
  off: string;
  /** the dashed ring of an open checklist item (≥ 3:1 to the cell) */
  dash: string;
  /** the phone's tab bar ground (the bar fades into it from the top) */
  tab: string;
  /** DS Б8 (v2, #2214): the toast plate — the inverse of the screen (light theme: dark plate; dark theme: a lifted plate), its words and its «Вернуть» */
  toast: string;
  onToast: string;
  toastAction: string;
  /** on the yellow fill (the one yellow tile): the icon's circle and the paler words (≥ 4.5:1 on `acc`) */
  onAccTint: string;
  onAccMut: string;
  scrim: string;
  shadow: { color: string; opacity: number; radius: number; offsetY: number };
  blur: number;
  blurOverlay: number;
  blurTint: "dark" | "light";
  glow: GlowSpot[];
  /** null — a flat `bg` */
  ground: GroundGradient | null;
  status: Record<StatusName, { fill: string; text: string; on: string }>;
  /** the drawing canvas only (founder О3, 07.11.2026 — the one exception to «colour only for status»): a node, and the
   *  storeys 1..4 of a drawn line, always with the label «эт N»; ≥ 3:1 to the canvas (bg) in both themes */
  drawing: { node: string; story: readonly [string, string, string, string] };
  /** a module's tape measure only (founder 09.11.2026, issue #674 — an exception to rule 2): the number
   *  or fraction under the tape's fixed mark stands on a pill of the main button's colours («как у нас кнопки»):
   *  fill = acc, text = onAcc (≥ 4.5:1); nowhere else. `needle` — the red line the length is read at, full height with a notch
   *  at both edges (founder 23.11.2026 «просто хочу красную», the 5th exception of rule 2, #2436/#2412); ≥ 3:1 to the tape */
  tape: { markFill: string; markText: string; needle: string };
}

/** redesign #2348 (docs/design/2026-11-20-direction/06-decision.md): calm opaque surfaces, one cobalt accent,
 *  tonal status plates (fill = the plate, text = word and icon, on = text on the plate); the screen ground is a warm gradient (`ground`, founder 21.11) */
export type AccentName = "yellow";
/** founder 21.11.2026 (#2350, palette A, docs/design/palette.html): one muted yellow, the same in both themes */
export const ACCENT_ORDER: readonly AccentName[] = ["yellow"];
export const accents: Record<AccentName, Record<ThemeName, { acc: string; onAcc: string }>> = {
  yellow: { dark: { acc: "#E2C15E", onAcc: "#1C1A12" }, light: { acc: "#E2C15E", onAcc: "#1C1A12" } },
};
/** palette A pastels (#2350): stat tiles, categories and progress bars only — always with a word (rule 2, 4th exception);
 *  fill = the tile, text = words on it (≥ 7:1), bar = a progress bar on a card (≥ 3:1) */
export type PastelName = "lav" | "mint" | "butter" | "peach";
export const pastels: Record<ThemeName, Record<PastelName, { fill: string; text: string; bar: string }>> = {
  dark: {
    lav: { fill: "#C9C1EC", text: "#2A2452", bar: "#C9C1EC" },
    mint: { fill: "#B6DCC6", text: "#173A28", bar: "#B6DCC6" },
    butter: { fill: "#E8DCA0", text: "#3A300E", bar: "#E8DCA0" },
    peach: { fill: "#EDC6AC", text: "#4A2512", bar: "#EDC6AC" },
  },
  light: {
    lav: { fill: "#DDD7F4", text: "#3A2F78", bar: "#6E61B8" },
    mint: { fill: "#CFE8D9", text: "#1E5236", bar: "#3E8A60" },
    butter: { fill: "#F1E7B8", text: "#5A4708", bar: "#8F7514" },
    peach: { fill: "#F5D9C6", text: "#6E3416", bar: "#B0623A" },
  },
};

export const themes: Record<ThemeName, ThemeColors> = {
  dark: {
    /** 60/30/10 (founder 21.11): graphite ground 60, a tone lighter surfaces + text 30, the accent 10; never pure black; «сильно чёрная» → lighter graphite */
    page: "#1F2024",
    bg: "#26282C",
    ink: "#EEEFF1",
    mut: "#B3B6BE",
    surf: "#303237",
    surf2: "#3A3C42",
    surfSolid: "#303237",
    in: "#3A3C42",
    bd: "rgba(255,255,255,0.07)",
    bdField: "#80838C",
    track: "rgba(255,255,255,0.10)",
    ov: "rgba(44,46,51,0.86)",
    ovSolid: "#2C2E33",
    acc: "#E2C15E",
    onAcc: "#1C1A12",
    accEdge: "transparent",
    accText: "#E2C15E",
    tint: "rgba(226,193,94,0.16)",
    tint2: "rgba(226,193,94,0.20)",
    surf3: "#44464D",
    hl: "rgba(255,255,255,0.05)",
    off: "#4A4D54",
    dash: "#8C9098",
    tab: "#1F2024",
    toast: "#44464D",
    onToast: "#EEEFF1",
    toastAction: "#E2C15E",
    onAccTint: "rgba(28,26,18,0.12)",
    onAccMut: "rgba(28,26,18,0.78)",
    scrim: "rgba(0,0,0,0.5)",
    shadow: { color: "#000000", opacity: 0.35, radius: 24, offsetY: 8 },
    blur: 20,
    blurOverlay: 24,
    blurTint: "dark",
    glow: [],
    // founder 21.11: «задний фон — градиент» → in the picker «Тёплый» 100 %: warm graphite at the top, deeper at the bottom (CSS 170°)
    ground: { x1: 0.41, y1: 0, x2: 0.59, y2: 1, stops: [{ offset: 0, color: "#43392F" }, { offset: 0.55, color: "#26282C" }, { offset: 1, color: "#191A1D" }] },
    status: {
      ok: { fill: "#1C2E23", text: "#86D3A0", on: "#86D3A0" },
      info: { fill: "#182A2E", text: "#86C9D4", on: "#86C9D4" },
      warn: { fill: "#33281C", text: "#E8B67F", on: "#E8B67F" },
      bad: { fill: "#3A2122", text: "#F09A90", on: "#F09A90" },
      neutral: { fill: "#3A3C42", text: "#B9BCC4", on: "#EEEFF1" },
    },
    drawing: { node: "#F4F5F7", story: ["#7FD4FF", "#FF8FD0", "#D59BFF", "#7CEBC6"] },
    tape: { markFill: "#E2C15E", markText: "#1C1A12", needle: "#FF453A" },
  },
  light: {
    /** 60/30/10, soft grey — never pure white; founder 21.11: «очень белая, режет глаза» → toned down (bg lum 0.81 → 0.68), contrast checked */
    page: "#CBCCC6",
    bg: "#D6D7D1",
    ink: "#17181B",
    mut: "#42454B",
    surf: "#E3E4DE",
    surf2: "#CDCEC8",
    surfSolid: "#E3E4DE",
    in: "#DBDCD6",
    bd: "rgba(20,21,24,0.08)",
    bdField: "#6F7279",
    track: "rgba(20,21,24,0.09)",
    ov: "rgba(222,223,217,0.88)",
    ovSolid: "#DEDFD9",
    acc: "#E2C15E",
    onAcc: "#1C1A12",
    accEdge: "#7A6418",
    // v2 #6E5A12 → darker: the secondary button's yellow words on the cell `surf2` and the tab's word need ≥ 4.5:1 (was 4.2)
    accText: "#5E4C0C",
    tint: "rgba(226,193,94,0.30)",
    tint2: "rgba(226,193,94,0.50)",
    surf3: "#C4C5BF",
    hl: "rgba(255,255,255,0.50)",
    off: "#B7B8B2",
    dash: "#6F7279",
    tab: "#E3E4DE",
    toast: "#26282C",
    onToast: "#EEEFF1",
    toastAction: "#E2C15E",
    onAccTint: "rgba(28,26,18,0.12)",
    onAccMut: "rgba(28,26,18,0.78)",
    scrim: "rgba(20,21,24,0.3)",
    shadow: { color: "#1B1C22", opacity: 0.08, radius: 20, offsetY: 6 },
    blur: 20,
    blurOverlay: 24,
    blurTint: "light",
    glow: [],
    ground: { x1: 0.41, y1: 0, x2: 0.59, y2: 1, stops: [{ offset: 0, color: "#E1D9CA" }, { offset: 0.55, color: "#D6D7D1" }, { offset: 1, color: "#BBBCB6" }] },
    status: {
      ok: { fill: "#DCEBDF", text: "#1B6034", on: "#1B6034" },
      info: { fill: "#D8EAED", text: "#0E5866", on: "#0E5866" },
      warn: { fill: "#F2E2CC", text: "#824306", on: "#824306" },
      bad: { fill: "#F4DAD6", text: "#9A2C22", on: "#9A2C22" },
      neutral: { fill: "#CDCEC8", text: "#3E4147", on: "#17181B" },
    },
    drawing: { node: "#111215", story: ["#0B6290", "#A0327A", "#7A3DB8", "#0B6E50"] },
    tape: { markFill: "#E2C15E", markText: "#1C1A12", needle: "#D70015" },
  },
};

/** Printed documents (estimate, invoice, receipt PDF): white paper, light-theme ink. Paper never follows the dark theme.
 *  Mirror of design/naryad-ds/tokens/print.css. Three document styles (docs/specs/07 §2.2 В, §3.4);
 *  the brand band colour is the company's setting (brand.color), tokens hold only sizes and positions. */
export type PrintStyleName = "classic" | "modern" | "compact";
export interface PrintStyle {
  fontPt: { title: number; heading: number; body: number; small: number };
  /** table row padding, pt */
  rowPadPt: number;
  /** line under the header, px (0 = none) */
  headRulePx: number;
  /** brand colour band under the header, pt (0 = none) */
  brandBandPt: number;
  /** logo box, pt */
  logoPt: number;
  logoSide: "left" | "right";
  /** space before a section heading, pt */
  sectionGapPt: number;
}
const printStyles: Record<PrintStyleName, PrintStyle> = {
  classic: { fontPt: { title: 18, heading: 11, body: 9.5, small: 8 }, rowPadPt: 4, headRulePx: 1, brandBandPt: 2, logoPt: 48, logoSide: "left", sectionGapPt: 14 },
  modern: { fontPt: { title: 20, heading: 12, body: 10, small: 8 }, rowPadPt: 6, headRulePx: 0, brandBandPt: 6, logoPt: 56, logoSide: "left", sectionGapPt: 18 },
  compact: { fontPt: { title: 14, heading: 10, body: 8.5, small: 7.5 }, rowPadPt: 2, headRulePx: 1, brandBandPt: 0, logoPt: 32, logoSide: "right", sectionGapPt: 8 },
};
export const print = {
  paper: "#FFFFFF",
  ink: "#15161A",
  mut: "#575C68",
  rule: "rgba(20,22,30,0.14)",
  okText: "#176428",
  pagePadMm: 14,
  fontPt: { title: 18, heading: 11, body: 9.5, small: 8 },
  styles: printStyles,
  /** #1324 (docs/specs/41): an estimate's PDF is a CA home-improvement contract — no text below minPt, a section heading at
   *  least headingPt bold, a statutory phrase (the right to cancel, next to the signatures) noticePt bold
   *  (B&P §7159, docs/legal/legal-research.md §1.2). The document's style keeps its own sizes above the floor. */
  contract: { minPt: 10, headingPt: 10, noticePt: 12 },
} as const;

/** Status glyph (DS: always icon + word): its own glyph in a circle (ok ✓, info i, warn △, bad ×, neutral — an empty circle; #2350). */
/** sizes on the drawing canvas (design/naryad-ds/tokens/foundation.css --draw-*): line widths, a downspout, a node,
 *  the gap between a length label and its line; colours are themes[t].drawing */
export const drawing = { runW: 4, runWSel: 6, dsR: 7, nodeR: 5, labelGap: 4, liftScale: 1.5 } as const;
/** the drawing on paper (foundation.css --draw-print-*; a module's measurement sheet, its PDFs, the estimate's page, #739):
 *  sizes in sheet units — the sheet is `sheetW` wide and scales to the screen or the page; colours are `print`;
 *  `pageW`: the estimate's page — one sheet for the phone (/p/) and the paper, so built for the narrow one;
 *  `panelMin`: a contour drawn smaller than this on the shared scale gets its own panel and scale (#1091), `panelGap`: between panels; `insetFrac`: a section drawn shorter than this part of the panel's width gets an enlarged inset (#1190), `insetW` × `insetH`: its frame, `insetSheetFrac`: at most this part of a narrow sheet's width (wider only for long words) */
export const drawingPrint = {
  sheetW: 800, pageW: 420, margin: 24, runW: 2.5, thinW: 1, dimOff: 30, dimStep: 18, extGap: 4, tick: 5, numR: 10, dsR: 6, font: 13, fontSm: 11, stampH: 76, scalePx: 120, panelMin: 120, panelGap: 28, insetFrac: 0.1, insetW: 190, insetH: 96, insetSheetFrac: 0.5,
} as const;

/**
 * The shop drawings of a module's measurement (#1349): an ANSI B sheet drawn in inches, printed 11 × 17 or reduced whole to
 * Letter. Text heights are cap heights in inches: the smallest (textSm) is 11 pt on the sheet — 7 pt on Letter;
 * lineweights are millimetres (by AIA layer); `band` is the one gray — the fill of the run's band.
 */
export const shopSheet = {
  wIn: 11, hIn: 17, letterWIn: 8.5, letterHIn: 11, borderIn: 0.375, minPt: 11, letterMinPt: 7, capEm: 0.716,
  textSm: 0.11, text: 0.125, textTitle: 0.19, textSheet: 0.42,
  lwBorder: 0.7, lwRun: 0.6, lwHeavy: 0.5, lwBlock: 0.35, lwMed: 0.25, lwThin: 0.2, lwHair: 0.13,
  band: "#AFAFAF",
} as const;

export const statusIcon: Record<StatusName, "ok" | "info" | "warn" | "bad" | "neutral"> = {
  ok: "ok",
  info: "info",
  warn: "warn",
  bad: "bad",
  neutral: "neutral",
};

/**
 * The glyph of a status (DS §3.3): grey `neutral` means two things — «draft» (not finished, dashed ring) and «none / cancelled»
 * (ring with a dash). Only a caller that knows it is a draft says so; the status itself stays the same five.
 */
export function statusGlyph(status: StatusName, draft?: boolean): "ok" | "info" | "warn" | "bad" | "neutral" | "draft" {
  return draft && status === "neutral" ? "draft" : statusIcon[status];
}

/** Business timing rules from HANDOFF: estimate without reply 2–4 days → warn, 5+ → bad. */
/** Estimate follow-up thresholds. Lead thresholds are company settings (apps/mobile/src/features/leadSettings.ts), not tokens. */
export const timing = { estimateWarnDays: 2, estimateBadDays: 5 } as const;

export const tokens = { font, space, spaceHalf, rhythm, radius, size, motion, z, component, breakpoint, layout, themes, statusIcon, timing, print, drawing, drawingPrint, shopSheet } as const;
export type Tokens = typeof tokens;
