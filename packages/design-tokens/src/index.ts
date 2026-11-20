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
  size: { display: 30, title: 22, heading: 17, body: 15, button: 15, caption: 13, micro: 12, input: 16 },
  lineHeight: { tight: 1.15, body: 1.45, snug: 1.35 },
  weight: { regular: "400", medium: "500", semibold: "600", bold: "700" },
  /** Minimum readable text size (DS rule 6). */
  minSize: 12,
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;
/** half steps (foundation.css --space-hair / --space-tight): label↔value inside a tile, gap in a chip */
export const spaceHalf = { hair: 2, tight: 6 } as const;

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
  iconXs: 12,
  iconSm: 16,
  iconMd: 20,
  iconLg: 24,
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
} as const;

/* ---------- components.css ---------- */
export const component = {
  button: { sm: 32, md: 36, phone: 40, hit: 44 },
  field: { h: 40, phone: 44 },
  chip: { h: 24, px: 10 },
  segmented: { h: 32, pad: 4 },
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
  /** list cards (docs/specs/06-list-cards.md): option row in a picker sheet; narrowest figure tile */
  rowOption: 48,
  tileMin: 78,
  /** choice controls (DS §9, spec 56 wave 1а): a tile of `OptionTile` (≈ 100 × 76, not wider than 120 — the row stays left on 1280, А2б); the «⊖» of a repeated value — visible 22,
   *  the zone 44 (А14а); its label button — not wider than 110 (the row on 390: ⊖ 36 + label 110 + 8 + field 204) */
  optionTile: { h: 76, maxW: 120 },
  valueIcon: 22,
  valueLabelMax: 110,
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
  scrim: string;
  shadow: { color: string; opacity: number; radius: number; offsetY: number };
  blur: number;
  blurOverlay: number;
  blurTint: "dark" | "light";
  glow: GlowSpot[];
  status: Record<StatusName, { fill: string; text: string; on: string }>;
  /** the drawing canvas only (founder О3, 07.11.2026 — the one exception to «colour only for status»): a node, and the
   *  storeys 1..4 of a drawn line, always with the label «эт N»; ≥ 3:1 to the canvas (bg) in both themes */
  drawing: { node: string; story: readonly [string, string, string, string] };
  /** a module's tape measure only (founder 09.11.2026, issue #674 — an exception to rule 2): the number
   *  or fraction under the tape's fixed mark stands on a pill of the main button's colours («как у нас кнопки»):
   *  fill = acc, text = onAcc (≥ 4.5:1); nowhere else */
  tape: { markFill: string; markText: string };
}

/** redesign #2348 (docs/design/2026-11-20-direction/06-decision.md): calm opaque surfaces, one cobalt accent,
 *  tonal status plates (fill = the plate, text = word and icon, on = text on the plate); no background glow */
export type AccentName = "lime" | "yellow" | "orange" | "emerald" | "cobalt";
/** founder 21.11 (#2350): one accent, the same in both themes; lime by default (his references), the others to compare */
export const accents: Record<AccentName, Record<ThemeName, { acc: string; onAcc: string }>> = {
  lime: { dark: { acc: "#D4F06A", onAcc: "#15161A" }, light: { acc: "#D4F06A", onAcc: "#15161A" } },
  yellow: { dark: { acc: "#F5D04A", onAcc: "#15161A" }, light: { acc: "#F5D04A", onAcc: "#15161A" } },
  orange: { dark: { acc: "#FF7A2F", onAcc: "#15161A" }, light: { acc: "#FF7A2F", onAcc: "#15161A" } },
  emerald: { dark: { acc: "#3DDC97", onAcc: "#15161A" }, light: { acc: "#3DDC97", onAcc: "#15161A" } },
  cobalt: { dark: { acc: "#6F86FF", onAcc: "#FFFFFF" }, light: { acc: "#2747E8", onAcc: "#FFFFFF" } },
};

export const themes: Record<ThemeName, ThemeColors> = {
  dark: {
    /** 60/30/10 (founder 21.11): graphite ground 60, a tone lighter surfaces + text 30, the accent 10; never pure black */
    page: "#141518",
    bg: "#1B1C1F",
    ink: "#EDEEF0",
    mut: "#A9ACB4",
    surf: "#25262A",
    surf2: "#2E2F34",
    surfSolid: "#25262A",
    in: "#2E2F34",
    bd: "rgba(255,255,255,0.07)",
    bdField: "#5E6169",
    track: "rgba(255,255,255,0.10)",
    ov: "rgba(32,33,37,0.84)",
    ovSolid: "#202125",
    acc: "#D4F06A",
    onAcc: "#15161A",
    scrim: "rgba(0,0,0,0.5)",
    shadow: { color: "#000000", opacity: 0.35, radius: 24, offsetY: 8 },
    blur: 20,
    blurOverlay: 24,
    blurTint: "dark",
    glow: [],
    status: {
      ok: { fill: "#183022", text: "#5BD88A", on: "#5BD88A" },
      info: { fill: "#122A2F", text: "#6ED3E6", on: "#6ED3E6" },
      warn: { fill: "#33251A", text: "#FFB061", on: "#FFB061" },
      bad: { fill: "#3A1C1C", text: "#FF8A80", on: "#FF8A80" },
      neutral: { fill: "#2E2F34", text: "#A9ACB4", on: "#EDEEF0" },
    },
    drawing: { node: "#F4F5F7", story: ["#7FD4FF", "#FF8FD0", "#D59BFF", "#7CEBC6"] },
    tape: { markFill: "#FBFF00", markText: "#0B0C0F" },
  },
  light: {
    /** 60/30/10, soft grey — never pure white */
    page: "#DCDDD9",
    bg: "#E9EAE6",
    ink: "#18191C",
    mut: "#4A4D54",
    surf: "#F6F6F3",
    surf2: "#E0E1DC",
    surfSolid: "#F6F6F3",
    in: "#EFEFEB",
    bd: "rgba(20,21,24,0.08)",
    bdField: "#8A8D93",
    track: "rgba(20,21,24,0.09)",
    ov: "rgba(244,244,241,0.86)",
    ovSolid: "#F4F4F1",
    acc: "#D4F06A",
    onAcc: "#15161A",
    scrim: "rgba(20,21,24,0.3)",
    shadow: { color: "#1B1C22", opacity: 0.08, radius: 20, offsetY: 6 },
    blur: 20,
    blurOverlay: 24,
    blurTint: "light",
    glow: [],
    status: {
      ok: { fill: "#DCEFE2", text: "#1C7A3E", on: "#1C7A3E" },
      info: { fill: "#DAEEF2", text: "#0B6478", on: "#0B6478" },
      warn: { fill: "#F8E6D2", text: "#8F4A00", on: "#8F4A00" },
      bad: { fill: "#F7DEDC", text: "#B3261E", on: "#B3261E" },
      neutral: { fill: "#E0E1DC", text: "#4A4D54", on: "#18191C" },
    },
    drawing: { node: "#111215", story: ["#0B6290", "#A0327A", "#7A3DB8", "#0B6E50"] },
    tape: { markFill: "#FBFF00", markText: "#0B0C0F" },
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

/** Status glyph (DS: always icon + word). Maps to icons.ts names. */
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

export const statusIcon: Record<StatusName, "check" | "clock" | "alert" | "close" | "note"> = {
  ok: "check",
  info: "clock",
  warn: "alert",
  bad: "close",
  neutral: "note",
};

/** Business timing rules from HANDOFF: estimate without reply 2–4 days → warn, 5+ → bad. */
/** Estimate follow-up thresholds. Lead thresholds are company settings (apps/mobile/src/features/leadSettings.ts), not tokens. */
export const timing = { estimateWarnDays: 2, estimateBadDays: 5 } as const;

export const tokens = { font, space, spaceHalf, radius, size, motion, z, component, breakpoint, layout, themes, statusIcon, timing, print, drawing, drawingPrint, shopSheet } as const;
export type Tokens = typeof tokens;
