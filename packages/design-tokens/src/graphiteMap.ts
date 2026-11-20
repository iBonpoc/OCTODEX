/**
 * «Графит» → keys of `ThemeColors` (#2292, Ш2): one pure function, so `ThemeProvider` can hand the whole app the
 * «Графит» colours through the same `c` it hands «Наряд» today. Read only by the theme provider (guard: designSystem.test.ts).
 *
 * Not mapped — stay as in «Наряд» (taken from `base`): `shadow` (Графит has no shadows: depth is glass + edge), `blur`,
 * `blurOverlay`, `blurTint` (glass is its own number set), `glow` (the «Рельеф» picture replaces it), `drawing`
 * (the drawing canvas keeps its storey colours, rule 2 exception). `status.neutral` has no «Графит» colour:
 * derived from `tile2` / `text2` / `text`. Fonts, radii, sizes, motion are not colours: not touched here.
 */
import type { GraphiteColors } from "./graphite";
import type { StatusName, ThemeColors } from "./index";

const status = (g: GraphiteColors, fill: string, text: string) => ({ fill, text, on: g.onDan });

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
    status: st,
    tape: { markFill: g.acc, markText: g.onAcc },
  };
}
