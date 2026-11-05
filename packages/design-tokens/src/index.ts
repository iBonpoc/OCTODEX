/**
 * OCTODEX design tokens (from the founder's "Naryad" design system) — single source of truth for the app (iOS, Android, tablet, web).
 * Mirrors design/naryad-ds/tokens/{foundation,components,theme,status}.css one to one.
 * Rule: no component may use a value that is not here. Change a token → it changes everywhere.
 */
export * from "./icons";
export { extraIcons } from "./extraIcons";

/* ---------- foundation.css ---------- */
export const font = {
  family: "Onest",
  /** RN needs one family per weight (custom fonts ignore fontWeight on Android). */
  families: {
    regular: "Onest_400Regular",
    medium: "Onest_500Medium",
    semibold: "Onest_600SemiBold",
    bold: "Onest_700Bold",
  },
  size: { display: 28, title: 20, heading: 15, body: 13, button: 12.5, caption: 11.5, micro: 10.5 },
  lineHeight: { tight: 1.15, body: 1.45 },
  weight: { regular: "400", medium: "500", semibold: "600", bold: "700" },
  /** Minimum readable text size (DS rule 6). */
  minSize: 11,
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;

export const radius = {
  pill: 999,
  field: 12,
  chip: 999,
  /** theme.css --r / --ri (style "Glass") */
  card: 24,
  inner: 18,
  sheet: 24,
  tip: 8,
} as const;

export const size = {
  controlSm: 28,
  controlMd: 32,
  field: 34,
  hitMin: 44,
  /** visible button on a phone (--control-lg / --control-md-phone) */
  controlLg: 36,
  controlMdPhone: 36,
  fieldPhone: 44,
  iconSm: 16,
  iconMd: 20,
  iconLg: 24,
  iconStroke: 1.75,
  statusbarH: 44,
  tabbarH: 56,
  safeBottom: 34,
  fab: 36,
  /** list rows (clients, dropdown items, price list) — not buttons */
  rowMin: 44,
  rowMax: 52,
} as const;

export const motion = {
  durFast: 160,
  durBase: 220,
  durSlow: 350,
  durChart: 900,
  easeOut: [0.2, 0.8, 0.2, 1] as const,
  /** components.css --ease-spring (overrides foundation's .3,1.4,.5,1) */
  easeSpring: [0.3, 1.25, 0.5, 1] as const,
  easeLiquid: [0.3, 1.35, 0.5, 1] as const,
  liquidStretch: 160,
  liquidSettle: 420,
  pressScale: 0.95,
  /** Reanimated spring roughly equal to the CSS spring curve above. */
  spring: { damping: 16, stiffness: 220, mass: 0.9 },
  toastUndoMs: 5000,
} as const;

export const z = { nav: 2, fab: 4, scrim: 5, sheet: 6, modal: 7, toast: 8 } as const;

/* ---------- components.css ---------- */
export const component = {
  button: { sm: 28, md: 32, phone: 36, hit: 44 },
  field: { h: 34, phone: 44 },
  chip: { h: 24, px: 10 },
  segmented: { h: 32, pad: 4 },
  tab: { h: 30 },
  switch: { w: 42, h: 24, knob: 16 },
  help: { visible: 18, icon: 11 },
  tip: { fs: 11.5, px: 8, py: 4, radius: 8, max: 220, gap: 6 },
  fab: 36,
  dockBtn: 36,
  sheetRadius: 24,
  modalW: 380,
  panelW: 360,
  paletteW: 560,
  avatar: { sm: 28, md: 36 },
  /** company logo preview (settings, client page, PDF) */
  logo: 96,
  stepDot: 10,
  /* ---- app-only tokens (not in the DS css yet; same style, keep here so components never use raw numbers) ---- */
  /** company logo stored size, px (image processing) */
  logoPx: 256,
  /** compact row (lines of an estimate, small lists) */
  rowCompact: 32,
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
  /** hairline border */
  hairline: 1,
  /** drag preview handle */
  dragHandle: 16,
  /** checklist checkbox */
  checkbox: { size: 22, radius: 7, border: 1.5 },
  /** gap between photo thumbnails */
  photoGap: 2,
  /** photo thumbnail side */
  photoThumb: 72,
  /** bottom sheet: share of the screen height before it is pulled up to full height */
  sheetHeightRatio: 0.88,
  /** bottom sheet: drag down this far (pt) or this fast (pt/ms) to close */
  sheetDismissDrag: 120,
  sheetDismissVelocity: 0.8,
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
} as const;

/* ---------- breakpoints (HANDOFF: 390 / 820 / 1280) ---------- */
export const breakpoint = { phone: 0, tablet: 820, desktop: 1280 } as const;
export const layout = { contentMax: 1200, gridCols: { phone: 1, tablet: 2, desktop: 3 } } as const;

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
  in: string;
  bd: string;
  track: string;
  ov: string;
  acc: string;
  onAcc: string;
  scrim: string;
  shadow: { color: string; opacity: number; radius: number; offsetY: number };
  blur: number;
  blurOverlay: number;
  blurTint: "dark" | "light";
  glow: GlowSpot[];
  status: Record<StatusName, { fill: string; text: string; on: string }>;
}

const statusFill = { ok: "#7CE08A", info: "#8FA2FF", warn: "#FF8A3D", bad: "#FF6B6B" } as const;
const statusOn = "#0B0C0F";

export const themes: Record<ThemeName, ThemeColors> = {
  dark: {
    page: "#181A1E",
    bg: "#24272D",
    ink: "#F2F3F5",
    mut: "#CDD1DA",
    surf: "rgba(255,255,255,0.07)",
    surf2: "rgba(255,255,255,0.11)",
    in: "rgba(255,255,255,0.05)",
    bd: "rgba(255,255,255,0.14)",
    track: "rgba(255,255,255,0.12)",
    ov: "rgba(38,41,48,0.72)",
    acc: "#FBFF00",
    onAcc: "#0B0C0F",
    scrim: "rgba(0,0,0,0.42)",
    shadow: { color: "#000000", opacity: 0.3, radius: 30, offsetY: 10 },
    blur: 20,
    blurOverlay: 24,
    blurTint: "dark",
    glow: [
      { cx: 0.06, cy: 0, rx: 600, ry: 420, color: "#7CE08A", opacity: 0.08 },
      { cx: 1, cy: 1, rx: 700, ry: 500, color: "#FFA03C", opacity: 0.07 },
      { cx: 0.6, cy: 0.35, rx: 520, ry: 420, color: "#8FA2FF", opacity: 0.06 },
    ],
    status: {
      ok: { fill: statusFill.ok, text: "#9CF0A8", on: statusOn },
      info: { fill: statusFill.info, text: "#C2CCFF", on: statusOn },
      warn: { fill: statusFill.warn, text: "#FFB47E", on: statusOn },
      bad: { fill: statusFill.bad, text: "#FFAAAA", on: statusOn },
      neutral: { fill: "rgba(255,255,255,0.11)", text: "#CDD1DA", on: "#F2F3F5" },
    },
  },
  light: {
    page: "#DDD9D2",
    bg: "#EFEBE5",
    ink: "#15161A",
    mut: "#575C68",
    surf: "rgba(255,255,255,0.62)",
    surf2: "rgba(255,255,255,0.85)",
    in: "rgba(255,255,255,0.55)",
    bd: "rgba(20,22,30,0.1)",
    track: "rgba(20,22,30,0.09)",
    ov: "rgba(250,248,244,0.78)",
    acc: "#FBFF00",
    onAcc: "#0B0C0F",
    scrim: "rgba(20,22,30,0.25)",
    shadow: { color: "#3C3228", opacity: 0.12, radius: 28, offsetY: 10 },
    blur: 20,
    blurOverlay: 24,
    blurTint: "light",
    glow: [
      { cx: 0.06, cy: 0, rx: 600, ry: 420, color: "#7CE08A", opacity: 0.3 },
      { cx: 1, cy: 1, rx: 700, ry: 500, color: "#FFA03C", opacity: 0.24 },
      { cx: 0.6, cy: 0.35, rx: 520, ry: 420, color: "#8FA2FF", opacity: 0.2 },
    ],
    status: {
      ok: { fill: statusFill.ok, text: "#176428", on: statusOn },
      info: { fill: statusFill.info, text: "#3647C4", on: statusOn },
      warn: { fill: statusFill.warn, text: "#944600", on: statusOn },
      bad: { fill: statusFill.bad, text: "#B4232A", on: statusOn },
      neutral: { fill: "rgba(20,22,30,0.09)", text: "#575C68", on: "#15161A" },
    },
  },
};

/** Printed documents (estimate PDF): white paper, light-theme ink. Paper never follows the dark theme. */
export const print = {
  paper: "#FFFFFF",
  ink: "#15161A",
  mut: "#575C68",
  rule: "rgba(20,22,30,0.14)",
  okText: "#176428",
  pagePadMm: 14,
  fontPt: { title: 18, heading: 11, body: 9.5, small: 8 },
} as const;

/** Status glyph (DS: always icon + word). Maps to icons.ts names. */
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

export const tokens = { font, space, radius, size, motion, z, component, breakpoint, layout, themes, statusIcon, timing, print } as const;
export type Tokens = typeof tokens;
