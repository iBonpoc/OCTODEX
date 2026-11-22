import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { component, drawing, drawingPrint, extraIcons, font, graphite, iconLayers, iconMeta, icons, motion, print, radius, rhythm, shopSheet, size, space, spaceHalf, themes, tokens, z } from "../src/index";

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
    expect(font.size).toMatchObject({ display: px("fs-display"), title: px("fs-title"), heading: px("fs-heading"), body: px("fs-body"), caption: px("fs-caption"), micro: px("fs-micro"), input: px("fs-input") });
    expect(font.lineHeight).toEqual({ tight: px("lh-tight"), body: px("lh-body"), snug: px("lh-snug") });
    expect(font.size.button).toBe(px("fs-btn"));
  });
  it("visual v2: the figure sizes, the tracking and the rhythm of a screen", () => {
    expect([font.size.figure, font.size.figureSm]).toEqual([px("fs-figure"), px("fs-figure-sm")]);
    expect([font.tracking.display, font.tracking.figure]).toEqual([parseFloat(v("tracking-display")), parseFloat(v("tracking-figure"))]);
    expect(rhythm).toEqual({ screen: px("rhythm-screen"), cardGap: px("rhythm-card-gap"), cardPad: px("rhythm-card-pad"), rowGap: px("rhythm-row-gap"), blockGap: px("rhythm-block-gap"), headGap: px("rhythm-head-gap") });
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
  it("controls and hit area (no button above 40, hit 44)", () => {
    expect(size.controlSm).toBe(px("control-sm"));
    expect(size.controlMd).toBe(px("control-md"));
    expect(size.controlLg).toBe(px("control-lg"));
    expect(size.controlMdPhone).toBe(px("control-md-phone"));
    expect(size.field).toBe(px("field"));
    expect(size.fieldPhone).toBe(px("field-phone"));
    expect(size.hitMin).toBe(px("hit-min"));
    expect(size.hitMinAndroid).toBe(px("hit-min-android"));
    expect([component.rowOption, component.tileMin]).toEqual([px("row-option"), px("tile-min")]);
    expect(component.button).toEqual({ sm: px("btn-sm"), md: px("btn-md"), phone: px("btn-phone-visible"), hit: px("hit-min"), glyph: px("btn-glyph") });
    expect(component.field).toEqual({ h: px("field-h"), phone: px("field-phone") });
    expect(component.chip).toEqual({ h: px("chip-h"), px: px("chip-px") });
    expect(component.segmented).toEqual({ h: px("seg-h"), pad: px("seg-pad") });
    expect(component.tab).toEqual({ h: px("tab-h"), fadeW: px("tab-fade-w") });
    expect(component.switch).toEqual({ w: px("switch-w"), h: px("switch-h"), knob: px("switch-knob") });
    expect(component.help).toEqual({ visible: px("help-visible"), icon: px("help-icon") });
    expect(component.tip).toEqual({ fs: px("tip-fs"), px: px("tip-px"), py: px("tip-py"), radius: px("tip-radius"), max: px("tip-max"), gap: px("tip-gap") });
    expect(component.fab).toBe(px("fab"));
    expect(component.dockBtn).toBe(px("dock-btn"));
    expect(component.tapeTick).toBe(px("tape-tick"));
    expect(component.brand).toEqual({ mark: px("brand-mark"), wait: px("brand-wait"), about: px("brand-about"), splash: px("brand-splash"), intro: px("brand-intro") });
    expect(component.estRow).toEqual({ qty: px("est-qty-w"), unit: px("est-unit-w") });
    expect([component.modalW, component.panelW, component.paletteW]).toEqual([px("modal-w"), px("panel-w"), px("palette-w")]);
    // founder 21.11.2026 (#2350): the phone button is 40 (was ≤ 36, rule 3 — to be updated through the audit, #2337); the zone stays 44
    for (const k of Object.values(component.button)) expect(k === px("hit-min") || k <= 40).toBe(true);
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
  it("the shop drawings' sheet (#1349)", () => {
    const n = (k: string) => parseFloat(v(k));
    expect(shopSheet).toEqual({
      wIn: n("shop-w-in"), hIn: n("shop-h-in"), letterWIn: n("shop-letter-w-in"), letterHIn: n("shop-letter-h-in"), borderIn: n("shop-border-in"), minPt: n("shop-min-pt"), letterMinPt: n("shop-letter-min-pt"), capEm: n("shop-cap-em"),
      textSm: n("shop-text-sm"), text: n("shop-text"), textTitle: n("shop-text-title"), textSheet: n("shop-text-sheet"),
      lwBorder: n("shop-lw-border"), lwRun: n("shop-lw-run"), lwHeavy: n("shop-lw-heavy"), lwBlock: n("shop-lw-block"), lwMed: n("shop-lw-med"), lwThin: n("shop-lw-thin"), lwHair: n("shop-lw-hair"),
      band: v("shop-band"),
    });
    // 11 pt on the sheet is 7 pt when the sheet is reduced to Letter
    expect((shopSheet.textSm / shopSheet.capEm) * 72).toBeGreaterThanOrEqual(shopSheet.minPt);
    expect(shopSheet.minPt * Math.min(shopSheet.letterWIn / shopSheet.wIn, shopSheet.letterHIn / shopSheet.hIn)).toBeGreaterThanOrEqual(shopSheet.letterMinPt);
  });
  it("drawing canvas sizes", () => {
    expect(drawing).toEqual({ runW: px("draw-run-w"), runWSel: px("draw-run-w-sel"), dsR: px("draw-ds-r"), nodeR: px("draw-node-r"), labelGap: px("draw-label-gap"), liftScale: parseFloat(v("draw-lift-scale")) });
  });
  it("dialog, sheet and popover sizes, the brand splash", () => {
    expect([component.alertMaxW, component.sheetMediumRatio, component.popoverW]).toEqual([px("alert-max-w"), parseFloat(v("sheet-medium-ratio")), px("popover-w")]);
    expect(motion.durBrand).toBe(px("dur-brand"));
    expect([motion.durBrandQuick, motion.durBrandEdge, motion.durBrandPause, motion.durBrandFold]).toEqual([px("dur-brand-quick"), px("dur-brand-edge"), px("dur-brand-pause"), px("dur-brand-fold")]);
    expect([motion.durBrandHold, motion.brandExitScale]).toEqual([px("dur-brand-hold"), px("brand-exit-scale")]);
    expect([motion.brandExitFadeDelay, motion.durBrandBounce, motion.brandBounceLift, motion.brandBounceSquash, motion.durBrandFirstMax, motion.durBrandWaitMin]).toEqual(
      [px("brand-exit-fade-delay"), px("dur-brand-bounce"), px("brand-bounce-lift"), px("brand-bounce-squash"), px("dur-brand-first-max"), px("dur-brand-wait-min")],
    );
    // the first launch fits its budget: the fade at the dot's place overlaps the drive, then the bounce and the exit
    expect(motion.durBrandQuick + motion.durBrandBounce + motion.durBase).toBeLessThanOrEqual(motion.durBrandFirstMax);
    // the exit: the fade starts after its delay and ends with the growth
    expect(motion.brandExitFadeDelay + motion.durFast).toBe(motion.durBase);
  });
  it("small shadow of the raised «Заливка»", () => {
    const m = v("shadow-sm").match(/^0 (\d+)px (\d+)px rgba\(0,\s*0,\s*0,\s*([.\d]+)\)$/)!;
    expect(component.shadowSm).toMatchObject({ offsetY: Number(m[1]), radius: Number(m[2]), opacity: Number(m[3]) }); // elevation — Android only, app-only
  });
  it("motion", () => {
    expect([motion.durFast, motion.durBase, motion.durSlow, motion.durChart, motion.longPressMs]).toEqual([px("dur-fast"), px("dur-base"), px("dur-slow"), px("dur-chart"), px("long-press-ms")]);
    const bez = (n: string) => v(n).match(/cubic-bezier\(([^)]+)\)/)![1]!.split(",").map(Number);
    expect([...motion.easeOut]).toEqual(bez("ease-out"));
    expect([...motion.easeIn]).toEqual(bez("ease-in"));
    expect([...motion.easeSpring]).toEqual(bez("ease-spring"));
    expect([...motion.easeLiquid]).toEqual(bez("ease-liquid"));
    expect(motion.durPress).toBe(px("dur-press"));
    expect([[...motion.easeInOut], [...motion.easeBrandWay], [...motion.easeBrandFold]]).toEqual([bez("ease-in-out"), bez("ease-brand-way"), bez("ease-brand-fold")]);
    expect([z.under, z.over, z.dragged]).toEqual([px("z-under"), px("z-over"), px("z-dragged")]);
    expect([motion.toastInfoMs, motion.toastUndoA11yMs, motion.spinnerDelayMs, motion.actionTimeoutMs]).toEqual([px("toast-info-ms"), px("toast-undo-a11y-ms"), px("spinner-delay-ms"), px("action-timeout-ms")]);
    expect([motion.menuScale, motion.alertScale, motion.skeletonCycle]).toEqual([parseFloat(v("menu-scale")), parseFloat(v("alert-scale")), px("skeleton-cycle")]);
    expect([motion.liquidStretch, motion.liquidSettle]).toEqual([px("liquid-stretch"), px("liquid-settle")]);
  });
  describe.each(["dark", "light"] as const)("%s theme colours", (t) => {
    const c = themes[t];
    it("surfSolid mirrors the css and is `surf` laid over `bg`", () => {
      expect(norm(c.surfSolid)).toBe(norm(v("surf-solid", t)));
      const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      // palette A (#2350): the surface is opaque — what the eye sees is the surface itself
      if (c.surf.startsWith("#")) return expect(norm(c.surfSolid)).toBe(norm(c.surf));
      const m = c.surf.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)!;
      const a = Number(m[4]);
      const over = rgb(c.bg).map((b, i) => Math.round(b + (Number(m[i + 1]) - b) * a));
      expect(rgb(c.surfSolid)).toEqual(over);
    });
    it("surfaces, ink, accent", () => {
      for (const k of ["page", "bg", "ink", "mut", "surf", "surf2", "in", "bd", "track", "ov"] as const) expect(norm(c[k]), k).toBe(norm(v(k, t)));
      expect(norm(c.bdField)).toBe(norm(v("bd-field", t)));
      expect(norm(c.ovSolid)).toBe(norm(v("ov-solid", t)));
      expect(norm(c.acc)).toBe(norm(v("acc", t)));
      expect(norm(c.onAcc)).toBe(norm(v("on-acc", t)));
      expect(norm(c.accText)).toBe(norm(v("acc-text", t)));
      expect(norm(c.accEdge)).toBe(norm(v("acc-edge", t)));
      // visual v2 (21.11): the layers, the card's highlight, the accent's tone, the checklist's lines, the tab bar's ground
      for (const k of ["surf3", "hl", "tint", "tint2", "off", "dash", "tab"] as const) expect(norm(c[k]), k).toBe(norm(v(k, t)));
      expect(norm(c.onAccTint)).toBe(norm(v("on-acc-tint", t)));
      expect(norm(c.onAccMut)).toBe(norm(v("on-acc-mut", t)));
      // DS Б8 (v2, #2214): the toast plate, its words and its «Вернуть»
      expect([norm(c.toast), norm(c.onToast), norm(c.toastAction)]).toEqual([norm(v("toast", t)), norm(v("on-toast", t)), norm(v("toast-action", t))]);
      expect(radius.card).toBe(px("r"));
      expect([c.blur, c.blurOverlay]).toEqual([px("blur"), px("blurov")]);
    });
    it("status fill and text colours", () => {
      // palette A (#2350): tonal plates — the text on a plate is its own per status and theme (`st-x-on`)
      for (const k of ["ok", "info", "warn", "bad", "neutral"] as const) {
        expect(norm(c.status[k].fill), `${k} fill`).toBe(norm(v(`st-${k}`, t)));
        expect(norm(c.status[k].text), `${k} text`).toBe(norm(v(`st-${k}-text`, t)));
        expect(norm(c.status[k].on), `${k} on`).toBe(norm(v(`st-${k}-on`, t)));
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
  // набор «Тонкие острые» (#2350): слои выбранного состояния, толщина и концы — тоже из icons.json
  it("icon layers and the line are exactly the DS ones", () => {
    const ds = JSON.parse(readFileSync(join(DS, "icons.json"), "utf8"));
    expect(iconLayers).toEqual(ds.layers);
    expect(iconMeta).toEqual({ viewBox: ds.viewBox, stroke: ds.stroke, air: ds.air, thin: ds.thin, cap: ds.cap, join: ds.join, mask: ds.mask });
    for (const k of Object.keys(ds.layers)) expect(Object.keys(icons)).toContain(k);
    expect(extraIcons).toEqual({});
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
  it("#1324: the contract floor (an estimate's PDF) mirrors print.css", () =>
    expect(print.contract).toEqual({ minPt: px("print-contract-min"), headingPt: px("print-contract-heading"), noticePt: px("print-contract-notice") }));
  it("no colours in the styles: the brand band colour is a company setting", () => {
    expect(JSON.stringify(print.styles)).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
  });
});

/** «Графит» — пилот #2254, не правило: its own css (graphite.css), its own TS (src/graphite.ts), one to one both ways */
describe("«Графит» pilot tokens mirror graphite.css (#2254)", () => {
  const gcss = readFileSync(join(DS, "graphite.css"), "utf8");
  const vars = (sel: string): Record<string, string> => {
    const body = gcss.match(new RegExp(`${sel.replace(/[[\]"=]/g, "\\$&")}\\{([^}]*)\\}`))?.[1] ?? "";
    return Object.fromEntries([...body.matchAll(/--gr-([\w-]+):([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
  };
  const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
  const flat = (o: object, p: string[] = [], out: Record<string, string> = {}): Record<string, string> => {
    for (const [k, val] of Object.entries(o)) {
      if (k === "themes") continue;
      const key = [...p, k].map(kebab).join("-");
      if (Array.isArray(val)) out[key] = `cubic-bezier(${val.join(", ")})`;
      else if (typeof val === "object") flat(val as object, [...p, k], out);
      else out[key] = String(val);
    }
    return out;
  };
  it("numbers, font, motion", () => expect(flat(graphite)).toEqual(vars('[data-skin="graphite"]')));
  it.each(["dark", "light"] as const)("%s colours", (t) => {
    const ts = Object.fromEntries(Object.entries(graphite.themes[t]).map(([k, c]) => [kebab(k), norm(c)]));
    const ds = Object.fromEntries(Object.entries(vars(`[data-skin="graphite"][data-theme="${t}"]`)).map(([k, c]) => [k, norm(c)]));
    expect(ts).toEqual(ds);
  });
  it("only three control heights (44 / 52 / 56) and the type scale 34/22/17/15/13/12", () => {
    expect(new Set([graphite.size.control, graphite.size.button, graphite.size.row])).toEqual(new Set([44, 52, 56]));
    expect(Object.values(graphite.font.size)).toEqual([34, 22, 17, 15, 13, 12]);
  });
  it("is not part of «Наряд» tokens (the pilot does not leak into the app)", () => expect(Object.keys(tokens)).not.toContain("graphite"));
});
