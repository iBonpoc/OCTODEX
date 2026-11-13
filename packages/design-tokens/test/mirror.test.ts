import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { component, drawing, drawingPrint, font, icons, motion, print, radius, size, space, spaceHalf, themes } from "../src/index";

/**
 * The founder's design system (design/naryad-ds/tokens/*.css, icons.json) is the source of truth.
 * This test fails as soon as a value in the app tokens differs from it — e.g. after a new DS export is dropped in.
 */
const DS = join(__dirname, "../../../design/naryad-ds/tokens");
const css = ["foundation.css", "components.css", "theme.css", "status.css", "print.css"].map((f) => readFileSync(join(DS, f), "utf8")).join("\n");

/** var value in a block: ":root" or [data-theme="dark|light"] (theme blocks fall back to :root) */
function block(sel: string): string {
  const out: string[] = [];
  const re = sel === ":root" ? /:root\{([^}]*)\}/g : new RegExp(`\\[data-theme="${sel}"\\]\\{([^}]*)\\}`, "g");
  for (const m of css.matchAll(re)) out.push(m[1]!);
  return out.join(";");
}
function v(name: string, sel = ":root"): string {
  const find = (b: string) => b.match(new RegExp(`--${name}:([^;]+)`))?.[1]?.trim();
  const r = find(block(sel)) ?? find(block(":root"));
  if (r === undefined) throw new Error(`--${name} not in DS css`);
  const ref = r.match(/^var\(--([\w-]+)\)$/);
  return ref ? v(ref[1]!, sel) : r;
}
const px = (name: string) => parseFloat(v(name));
const norm = (c: string) => c.replace(/\s+/g, "").replace(/(\d)\.0+\b/g, "$1").replace(/,0\./g, ",.").toLowerCase();

describe("app tokens mirror the founder's DS css", () => {
  it("type scale and weights", () => {
    expect(font.size).toMatchObject({ display: px("fs-display"), title: px("fs-title"), heading: px("fs-heading"), body: px("fs-body"), caption: px("fs-caption"), micro: px("fs-micro") });
    expect(font.lineHeight).toEqual({ tight: px("lh-tight"), body: px("lh-body"), snug: px("lh-snug") });
    expect(font.size.button).toBe(px("fs-btn"));
  });
  it("spacing scale", () => {
    for (const k of [1, 2, 3, 4, 5, 6, 8] as const) expect(space[k], `space-${k}`).toBe(px(`space-${k}`));
    expect(spaceHalf).toEqual({ hair: px("space-hair"), tight: px("space-tight") });
  });
  it("radii", () => {
    expect(radius.pill).toBe(px("radius-pill"));
    expect(radius.field).toBe(px("radius-field"));
    expect(radius.card).toBe(px("r"));
    expect(radius.inner).toBe(px("ri"));
    expect(radius.sheet).toBe(px("sheet-radius"));
  });
  it("controls and hit area (no button above 36, hit 44)", () => {
    expect(size.controlSm).toBe(px("control-sm"));
    expect(size.controlMd).toBe(px("control-md"));
    expect(size.controlLg).toBe(px("control-lg"));
    expect(size.controlMdPhone).toBe(px("control-md-phone"));
    expect(size.field).toBe(px("field"));
    expect(size.fieldPhone).toBe(px("field-phone"));
    expect(size.hitMin).toBe(px("hit-min"));
    expect(size.hitMinAndroid).toBe(px("hit-min-android"));
    expect([component.rowOption, component.tileMin]).toEqual([px("row-option"), px("tile-min")]);
    expect(component.button).toEqual({ sm: px("btn-sm"), md: px("btn-md"), phone: px("btn-phone-visible"), hit: px("hit-min") });
    expect(component.field).toEqual({ h: px("field-h"), phone: px("field-phone") });
    expect(component.chip).toEqual({ h: px("chip-h"), px: px("chip-px") });
    expect(component.segmented).toEqual({ h: px("seg-h"), pad: px("seg-pad") });
    expect(component.tab.h).toBe(px("tab-h"));
    expect(component.switch).toEqual({ w: px("switch-w"), h: px("switch-h"), knob: px("switch-knob") });
    expect(component.help).toEqual({ visible: px("help-visible"), icon: px("help-icon") });
    expect(component.tip).toEqual({ fs: px("tip-fs"), px: px("tip-px"), py: px("tip-py"), radius: px("tip-radius"), max: px("tip-max"), gap: px("tip-gap") });
    expect(component.fab).toBe(px("fab"));
    expect(component.dockBtn).toBe(px("dock-btn"));
    expect([component.modalW, component.panelW, component.paletteW]).toEqual([px("modal-w"), px("panel-w"), px("palette-w")]);
    for (const k of Object.values(component.button)) expect(k === px("hit-min") || k <= 36).toBe(true);
  });
  it("icon sizes, bars and safe areas", () => {
    expect([size.iconXs, size.iconSm, size.iconMd, size.iconLg, size.iconStroke]).toEqual([px("icon-xs"), px("icon-sm"), px("icon-md"), px("icon-lg"), px("icon-stroke")]);
    expect([size.statusbarH, size.tabbarH, size.safeBottom, size.fab]).toEqual([px("statusbar-h"), px("tabbar-h"), px("safe-bottom"), px("fab")]);
  });
  it("the drawing on paper (#739)", () => {
    expect(drawingPrint).toEqual({
      sheetW: px("draw-print-sheet-w"), pageW: px("draw-print-page-w"), margin: px("draw-print-margin"), runW: px("draw-print-run-w"), thinW: px("draw-print-thin-w"),
      dimOff: px("draw-print-dim-off"), dimStep: px("draw-print-dim-step"), extGap: px("draw-print-ext-gap"), tick: px("draw-print-tick"),
      numR: px("draw-print-num-r"), dsR: px("draw-print-ds-r"), font: px("draw-print-font"), fontSm: px("draw-print-font-sm"),
      stampH: px("draw-print-stamp-h"), scalePx: px("draw-print-scale-px"), panelMin: px("draw-print-panel-min"), panelGap: px("draw-print-panel-gap"), insetFrac: px("draw-print-inset-frac"), insetW: px("draw-print-inset-w"), insetH: px("draw-print-inset-h"), insetSheetFrac: px("draw-print-inset-sheet-frac"),
    });
  });
  it("drawing canvas sizes", () => {
    expect(drawing).toEqual({ runW: px("draw-run-w"), runWSel: px("draw-run-w-sel"), dsR: px("draw-ds-r"), nodeR: px("draw-node-r"), labelGap: px("draw-label-gap"), liftScale: parseFloat(v("draw-lift-scale")) });
  });
  it("dialog, sheet and popover sizes, the brand splash", () => {
    expect([component.alertMaxW, component.sheetMediumRatio, component.popoverW]).toEqual([px("alert-max-w"), parseFloat(v("sheet-medium-ratio")), px("popover-w")]);
    expect(motion.durBrand).toBe(px("dur-brand"));
  });
  it("small shadow of the raised «Заливка»", () => {
    const m = v("shadow-sm").match(/^0 (\d+)px (\d+)px rgba\(0,\s*0,\s*0,\s*([.\d]+)\)$/)!;
    expect(component.shadowSm).toMatchObject({ offsetY: Number(m[1]), radius: Number(m[2]), opacity: Number(m[3]) }); // elevation — Android only, app-only
  });
  it("motion", () => {
    expect([motion.durFast, motion.durBase, motion.durSlow, motion.durChart, motion.longPressMs]).toEqual([px("dur-fast"), px("dur-base"), px("dur-slow"), px("dur-chart"), px("long-press-ms")]);
    const bez = (n: string) => v(n).match(/cubic-bezier\(([^)]+)\)/)![1]!.split(",").map(Number);
    expect([...motion.easeOut]).toEqual(bez("ease-out"));
    expect([...motion.easeSpring]).toEqual(bez("ease-spring"));
    expect([...motion.easeLiquid]).toEqual(bez("ease-liquid"));
    expect([motion.toastInfoMs, motion.toastUndoA11yMs, motion.spinnerDelayMs, motion.actionTimeoutMs]).toEqual([px("toast-info-ms"), px("toast-undo-a11y-ms"), px("spinner-delay-ms"), px("action-timeout-ms")]);
    expect([motion.menuScale, motion.alertScale, motion.skeletonCycle]).toEqual([parseFloat(v("menu-scale")), parseFloat(v("alert-scale")), px("skeleton-cycle")]);
    expect([motion.liquidStretch, motion.liquidSettle]).toEqual([px("liquid-stretch"), px("liquid-settle")]);
  });
  describe.each(["dark", "light"] as const)("%s theme colours", (t) => {
    const c = themes[t];
    it("surfSolid mirrors the css and is `surf` laid over `bg`", () => {
      expect(norm(c.surfSolid)).toBe(norm(v("surf-solid", t)));
      const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const m = c.surf.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)!;
      const a = Number(m[4]);
      const over = rgb(c.bg).map((b, i) => Math.round(b + (Number(m[i + 1]) - b) * a));
      expect(rgb(c.surfSolid)).toEqual(over);
    });
    it("surfaces, ink, accent", () => {
      for (const k of ["page", "bg", "ink", "mut", "surf", "surf2", "in", "bd", "track", "ov"] as const) expect(norm(c[k]), k).toBe(norm(v(k, t)));
      expect(norm(c.acc)).toBe(norm(v("acc", t)));
      expect(norm(c.onAcc)).toBe(norm(v("on-acc", t)));
      expect(radius.card).toBe(px("r"));
      expect([c.blur, c.blurOverlay]).toEqual([px("blur"), px("blurov")]);
    });
    it("status fill and text colours", () => {
      for (const k of ["ok", "info", "warn", "bad"] as const) {
        expect(norm(c.status[k].fill), `${k} fill`).toBe(norm(v(`st-${k}`, t)));
        expect(norm(c.status[k].text), `${k} text`).toBe(norm(v(`st-${k}-text`, t)));
        expect(norm(c.status[k].on)).toBe(norm(v("st-on", t)));
      }
    });
    it("drawing canvas: node and storeys (founder О3)", () => {
      expect(norm(c.drawing.node)).toBe(norm(v("draw-node", t)));
      c.drawing.story.forEach((s, i) => expect(norm(s), `story${i + 1}`).toBe(norm(v(`draw-story${i + 1}`, t))));
    });
    it("tape measure: the number under the mark (founder 09.11, #674)", () => {
      expect(norm(c.tape.markFill)).toBe(norm(v("tape-mark-fill", t)));
      expect(norm(c.tape.markText)).toBe(norm(v("tape-mark-text", t)));
    });
    it("background glow spots (opacity per theme)", () => {
      const ops = [...v("glow", t).matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map((m) => Number(m[1]));
      expect(c.glow.map((g) => g.opacity)).toEqual(ops);
    });
  });
  it("icons are exactly the DS icon set", () => {
    const ds = JSON.parse(readFileSync(join(DS, "icons.json"), "utf8")).icons as Record<string, string>;
    expect(icons).toEqual(ds);
  });
});

describe("print tokens mirror print.css (docs/specs/07 §2.2 В, §3.4)", () => {
  it("paper, ink, page and base type", () => {
    expect(norm(print.paper)).toBe(norm(v("print-paper")));
    expect(norm(print.ink)).toBe(norm(v("print-ink")));
    expect(norm(print.mut)).toBe(norm(v("print-mut")));
    expect(norm(print.rule)).toBe(norm(v("print-rule")));
    expect(norm(print.okText)).toBe(norm(v("print-ok-text")));
    expect(print.pagePadMm).toBe(px("print-page-pad-mm"));
    expect(print.fontPt).toEqual({ title: px("print-fs-title"), heading: px("print-fs-heading"), body: px("print-fs-body"), small: px("print-fs-small") });
  });
  it.each(["classic", "modern", "compact"] as const)("%s style", (name) => {
    const s = print.styles[name];
    const k = (x: string) => `print-${name}-${x}`;
    expect(s.fontPt).toEqual({ title: px(k("fs-title")), heading: px(k("fs-heading")), body: px(k("fs-body")), small: px(k("fs-small")) });
    expect(s.rowPadPt).toBe(px(k("row-pad")));
    expect(s.headRulePx).toBe(px(k("head-rule")));
    expect(s.brandBandPt).toBe(px(k("brand-band")));
    expect(s.logoPt).toBe(px(k("logo")));
    expect(s.logoSide).toBe(v(k("logo-side")));
    expect(s.sectionGapPt).toBe(px(k("section-gap")));
  });
  it("the default style is the base print type (classic)", () => expect(print.styles.classic.fontPt).toEqual(print.fontPt));
  it("no colours in the styles: the brand band colour is a company setting", () => {
    expect(JSON.stringify(print.styles)).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
  });
});
