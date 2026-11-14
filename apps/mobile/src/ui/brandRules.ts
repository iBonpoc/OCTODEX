/**
 * The GoRix brand's rules without React (DS §18.2, #1156): the geometry of the mark (from
 * design/brand-gorix-draft/v4/gr-*.svg), the path the yellow dot drives along the G (v3/quick-calm.svg,
 * v3/loading-calm.svg), which launch shows what, and when the dot is yellow. One place for all of it: the
 * brand is to be redrawn after 1.0 (the founder, 12.11), so a new mark is one change here and in `brand.tsx`.
 */
import { motion } from "@octo/design-tokens";

/** the mark GR, its own box (svg units): the G and the R from the logo's font, the gap as in the word */
export const GR_VIEW = { x: 16, y: -736, w: 1403, h: 764 } as const;
/** the G is drawn in its own units and placed by this (svg `translate(-143.9 -895.9) scale(1.05848)`) */
export const G_PLACE = { dx: -143.9, dy: -895.9, k: 1.05848 } as const;
export const G_PATH =
  "M660 170 H442 A272 272 0 0 0 170 442 V582 A272 272 0 0 0 442 854 H582 A272 272 0 0 0 854 582 V450 H640 V574 H730 V582 A148 148 0 0 1 582 730 H442 A148 148 0 0 1 294 582 V442 A148 148 0 0 1 442 294 H660 Z";
/** the R, already in the mark's units (svg `translate(-564 0)`) */
export const R_DX = -564;
export const R_PATH =
  "M1394 0V-708H1679Q1732 -708 1780.5 -697.5Q1829 -687 1868.0 -662.0Q1907 -637 1929.5 -592.5Q1952 -548 1952 -479Q1952 -428 1935.0 -387.0Q1918 -346 1885.0 -317.0Q1852 -288 1806 -272L1963 0H1802L1664 -249H1537V0ZM1537 -376H1669Q1700 -376 1725.5 -381.5Q1751 -387 1769.5 -399.0Q1788 -411 1798.5 -431.0Q1809 -451 1809 -480Q1810 -517 1793.5 -537.5Q1777 -558 1747.5 -566.5Q1718 -575 1678 -575H1537Z";
/** the dot at rest, in the G's units: its centre, its radius and the ink ring on a light ground */
export const DOT = { cx: 515, cy: 512, r: 85, ring: 106 } as const;

/** the logo «GoRix» (v3/logo-calm-*.svg): its box, where the G sits, the other letters and the dot over the «i» */
export const LOGO_VIEW = { x: 0, y: 0, w: 2834, h: 784 } as const;
export const LOGO_SHIFT = { dx: -36, dy: 768 } as const;
export const LOGO_LETTERS_DX = 69;
export const LOGO_LETTERS = [
  "M1027 7Q947 7 887.0 -25.5Q827 -58 794.0 -118.5Q761 -179 761 -262Q761 -347 794.5 -408.5Q828 -470 888.0 -503.0Q948 -536 1026 -536Q1106 -536 1165.0 -502.0Q1224 -468 1257.0 -407.0Q1290 -346 1290 -261Q1290 -178 1257.5 -117.5Q1225 -57 1166.5 -25.0Q1108 7 1027 7ZM1025 -121Q1071 -121 1099.0 -141.0Q1127 -161 1139.5 -193.5Q1152 -226 1152 -262Q1152 -298 1139.5 -331.5Q1127 -365 1099.5 -386.0Q1072 -407 1025 -407Q980 -407 952.0 -386.0Q924 -365 911.5 -331.5Q899 -298 899 -262Q899 -225 911.5 -193.0Q924 -161 952.0 -141.0Q980 -121 1025 -121Z",
  R_PATH,
  "M2057 0V-527H2197V0Z",
  "M2253 0 2437 -269 2262 -527H2425L2529 -361L2631 -527H2789L2613 -266L2801 0H2638L2523 -173L2409 0Z",
] as const;
/** the dot over the «i», in the logo's shifted units */
export const LOGO_DOT = { cx: 2196, cy: -640, r: 78, ring: 98 } as const;

type Seg = { kind: "line"; x0: number; y0: number; x1: number; y1: number; len: number } | { kind: "arc"; cx: number; cy: number; r: number; a0: number; a1: number; len: number };

/**
 * The dot's way along the G (v3/quick-calm.svg `animateMotion`, in the G's units): from the top end of the G down
 * the inside of its bowl, round to the bar and in to the centre. `fromX` — 700 for the short launch, 600 for the wait.
 */
export function dotWay(fromX: number): Seg[] {
  const r = 210;
  const line = (x0: number, y0: number, x1: number, y1: number): Seg => ({ kind: "line", x0, y0, x1, y1, len: Math.hypot(x1 - x0, y1 - y0) });
  const arc = (cx: number, cy: number, a0: number, a1: number): Seg => ({ kind: "arc", cx, cy, r, a0, a1, len: Math.abs(a1 - a0) * r });
  const H = Math.PI / 2;
  return [
    line(fromX, 232, 442, 232),
    arc(442, 442, -H, -2 * H), // to (232, 442)
    line(232, 442, 232, 582),
    arc(442, 582, Math.PI, H), // to (442, 792)
    line(442, 792, 582, 792),
    arc(582, 582, H, 0), // to (792, 582)
    line(792, 582, 792, 512),
    line(792, 512, DOT.cx, DOT.cy),
  ];
}

/** where the dot is at `t` (0…1 of the way's length), in the G's units */
export function pointOnWay(way: readonly Seg[], t: number): { x: number; y: number } {
  "worklet";
  let total = 0;
  for (const s of way) total += s.len;
  let d = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 0; i < way.length; i++) {
    const s = way[i];
    if (d <= s.len || i === way.length - 1) {
      const f = s.len === 0 ? 1 : Math.min(d / s.len, 1);
      if (s.kind === "line") return { x: s.x0 + (s.x1 - s.x0) * f, y: s.y0 + (s.y1 - s.y0) * f };
      const a = s.a0 + (s.a1 - s.a0) * f;
      return { x: s.cx + s.r * Math.cos(a), y: s.cy + s.r * Math.sin(a) };
    }
    d -= s.len;
  }
  return { x: DOT.cx, y: DOT.cy };
}

/** a point in the G's units → the mark's box (0…1 of its width and height) */
export function gToMark(p: { x: number; y: number }): { x: number; y: number } {
  "worklet";
  return { x: (p.x * G_PLACE.k + G_PLACE.dx - GR_VIEW.x) / GR_VIEW.w, y: (p.y * G_PLACE.k + G_PLACE.dy - GR_VIEW.y) / GR_VIEW.h };
}

/** the dot's colour (DS §18.2 «Цвет»): yellow — only on a mark bigger than 24 and on a screen without a yellow main
 *  button; ink otherwise. On a light ground the yellow dot sits in an ink ring */
export function dotTone(o: { size: number; theme: "dark" | "light"; screenHasPrimary: boolean }): { dot: "acc" | "ink"; ring: boolean } {
  if (o.screenHasPrimary) return { dot: "ink", ring: false };
  if (o.size <= 24 && o.theme === "light") return { dot: "ink", ring: false };
  return { dot: "acc", ring: o.theme === "light" };
}

/** the launch layer (DS §18.2 «Запуск» v4.3, #1394): the mark stands still for `durBrandHold` (a fast start shows
 *  nothing moving); a longer load — the wait with its word; after `actionTimeoutMs` «Повторить» */
export function bootStage(elapsedMs: number): "still" | "wait" | "failed" {
  if (elapsedMs < motion.durBrandHold) return "still";
  return elapsedMs < motion.actionTimeoutMs ? "wait" : "failed";
}

/** the device's mark that the app has started here before (DS §18.2 v4.4: the first launch after install shows the
 *  dot's drive along the G). Any stored value counts — older builds stored the version in it */
export const BRAND_SEEN_KEY = "octo.brand.seen.v1";
export type Launch = "first" | "normal";
export function launchKind(seen: string | null): Launch {
  return seen === null ? "first" : "normal";
}

/** the dot's bounce (DS §18.2 п.2а), shares of `durBrandBounce`: up (easeOut), down (easeIn), the squash on landing */
export const BOUNCE = { up: 0.45, down: 0.35, squash: 0.2 } as const;
