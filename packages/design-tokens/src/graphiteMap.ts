/**
 * «Графит» → keys of `ThemeColors` (#2292, Ш2): one pure function, so `ThemeProvider` can hand the whole app the
 * «Графит» colours through the same `c` it hands «Наряд» today. Read only by the theme provider (guard: designSystem.test.ts).
 *
 * Not mapped — stay as in «Наряд» (taken from `base`): `shadow` (Графит has no shadows: depth is glass + edge), `blur`,
 * `blurOverlay`, `blurTint` (glass is its own number set), `drawing`
 * (the drawing canvas keeps its storey colours, rule 2 exception). `status.neutral` has no «Графит» colour:
 * derived from `tile2` / `text2` / `text`. `glow` is switched OFF (no spots) and the scene gets the «Графит» gradient (`scene`: bg → bgMid → bgLow, the pilot's «Светлее»); the «Рельеф» picture is not drawn. Fonts, radii, sizes, motion are not colours: not touched here.
 */
import type { GraphiteColors } from "./graphite";
import type { StatusName, ThemeColors } from "./index";

/** relative luminance of an opaque `#rrggbb` (WCAG 2.x) */
function lum(hex: string): number {
  const f = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(0) + 0.7152 * f(1) + 0.0722 * f(2);
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
/** the text on a status fill: of the two inks of the set (`onAcc` the dark one, `onDan` the one made for the dark red) the one that reads better */
const status = (g: GraphiteColors, fill: string, text: string) => ({ fill, text, on: ratio(g.onAcc, fill) >= ratio(g.onDan, fill) ? g.onAcc : g.onDan });

export function graphiteToTheme(base: ThemeColors, g: GraphiteColors): ThemeColors {
  const st: Record<StatusName, { fill: string; text: string; on: string }> = {
    ok: status(g, g.okIc, g.ok),
    info: status(g, g.infoIc, g.info),
    warn: status(g, g.warnIc, g.warn),
    bad: status(g, g.badIc, g.bad),
    neutral: { fill: g.tile2, text: g.text2, on: g.text },
  };
  return {
    ...base,
    page: g.bgLow,
    bg: g.bg,
    ink: g.text,
    mut: g.text2,
    surf: g.panel,
    surf2: g.tile2,
    surfSolid: g.panelSolid,
    in: g.fieldBg,
    bd: g.border,
    bdField: g.fieldEdge,
    track: g.div,
    ov: g.sheetBg,
    ovSolid: g.panelSolid,
    acc: g.acc,
    onAcc: g.onAcc,
    scrim: g.scrim,
    glow: [],
    scene: { mid: g.bgMid, low: g.bgLow },
    status: st,
    tape: { markFill: g.acc, markText: g.onAcc },
  };
}
