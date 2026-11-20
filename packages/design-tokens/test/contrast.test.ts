import { describe, expect, it } from "vitest";
import { component, graphite, print, themes, type ThemeName } from "../src/index";

/** WCAG 2.x contrast. Translucent colours are composited over the solid background first. */
type RGBA = [number, number, number, number];
function parse(c: string): RGBA {
  if (c.startsWith("#")) {
    const h = c.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`bad colour ${c}`);
  const [r, g, b, a = "1"] = m[1]!.split(",").map((x) => x.trim());
  return [Number(r), Number(g), Number(b), Number(a)];
}
function over(top: string, bottom: string): RGBA {
  const [r, g, b, a] = parse(top);
  const [R, G, B] = parse(bottom);
  return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
}
function lum([r, g, b]: RGBA) {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(fg: RGBA, bg: RGBA) {
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a! + 0.05) / (b! + 0.05);
}

const names: ThemeName[] = ["dark", "light"];
/** colour difference ΔE in OKLab × 100 (Björn Ottosson's matrices): ~2 is a just-noticeable step, ≥ 8 reads as another colour */
function deltaE(a: string, b: string): number {
  const ok = (c: string) => {
    const [r, g, bl] = parse(c).slice(0, 3).map((v) => {
      const x = v / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const [x, y] = [ok(a), ok(b)];
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

describe.each(names)("%s theme contrast (DS rule: text ≥ 4.5:1)", (name) => {
  const c = themes[name];
  const surfaces = { bg: parse(c.bg), card: over(c.surf, c.bg), raised: over(c.surf2, c.bg), field: over(c.in, c.bg) };
  for (const [sname, s] of Object.entries(surfaces)) {
    it(`ink and mut on ${sname}`, () => {
      expect(ratio(parse(c.ink), s)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(parse(c.mut), s)).toBeGreaterThanOrEqual(4.5);
    });
    it(`status text on ${sname}`, () => {
      for (const st of ["ok", "info", "warn", "bad"] as const) {
        expect(ratio(parse(c.status[st].text), s), st).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
  it("text on accent and on status fills", () => {
    expect(ratio(parse(c.onAcc), parse(c.acc))).toBeGreaterThanOrEqual(4.5);
    for (const st of ["ok", "info", "warn", "bad"] as const) {
      expect(ratio(parse(c.status[st].on), parse(c.status[st].fill)), st).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe.each(names)("%s input frame (DS §8.1, #1594: ≥ 3:1 to the screen, WCAG 1.4.11)", (name) => {
  const c = themes[name];
  it("the field frame stands out from the screen and from the field's own fill", () => {
    expect(ratio(over(c.bdField, c.bg), parse(c.bg))).toBeGreaterThanOrEqual(3);
    expect(ratio(over(c.bdField, c.bg), over(c.in, c.bg))).toBeGreaterThanOrEqual(2.5);
  });
});

describe.each(names)("%s solid glass (DS §6.4, #1467: the tab bar's fallback panel hides the content)", (name) => {
  const c = themes[name];
  it("ovSolid is opaque; ink and mut on it ≥ 4.5:1", () => {
    expect(parse(c.ovSolid)[3]).toBe(1);
    expect(ratio(parse(c.ink), parse(c.ovSolid))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(parse(c.mut), parse(c.ovSolid))).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each(names)("%s drawing canvas (founder О3: storeys by colour + «эт N», ≥ 3:1 to the canvas)", (name) => {
  const c = themes[name];
  const canvas = { bg: parse(c.bg), card: over(c.surf, c.bg) };
  for (const [sname, s] of Object.entries(canvas)) {
    it(`storeys and node on ${sname}`, () => {
      c.drawing.story.forEach((st, i) => expect(ratio(parse(st), s), `story${i + 1}`).toBeGreaterThanOrEqual(3));
      expect(ratio(parse(c.drawing.node), s)).toBeGreaterThanOrEqual(3);
    });
  }
  it("four different storeys", () => expect(new Set(c.drawing.story.map((x) => x.toLowerCase())).size).toBe(4));
  // #1628: a storey is told from the alarms on the same canvas (the «Нет водостока» sign is warn) and from the other
  // storeys by colour — ΔE (OKLab × 100) ≥ 8; storey 2 was #8A4F00 against warn text #944600: ΔE 2.7, one colour to the eye
  it("storeys stand apart from warn and bad and from each other (ΔE OKLab ≥ 8)", () => {
    for (const [i, st] of c.drawing.story.entries()) {
      for (const sn of ["warn", "bad"] as const) {
        for (const part of ["fill", "text"] as const) expect(deltaE(st, c.status[sn][part]), `story${i + 1} vs ${sn}.${part}`).toBeGreaterThanOrEqual(8);
      }
      c.drawing.story.forEach((o, j) => j > i && expect(deltaE(st, o), `story${i + 1} vs story${j + 1}`).toBeGreaterThanOrEqual(8));
    }
  });
});

describe.each(names)("%s tape measure (founder 09.11, #674: the number under the mark on a pill like the main button)", (name) => {
  const c = themes[name];
  it("the number on its pill ≥ 4.5:1", () => expect(ratio(parse(c.tape.markText), parse(c.tape.markFill))).toBeGreaterThanOrEqual(4.5));
  it("the pill is the main button's colours", () => {
    expect(c.tape.markFill.toLowerCase()).toBe(c.acc.toLowerCase());
    expect(c.tape.markText.toLowerCase()).toBe(c.onAcc.toLowerCase());
  });
});

describe("print contrast on paper (documents for the client: text ≥ 4.5:1)", () => {
  const paper = parse(print.paper);
  it.each([["ink", print.ink], ["mut", print.mut], ["okText", print.okText]])("%s on paper", (_n, c) => {
    expect(ratio(parse(c), paper)).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * The switch (DS §9 А5, §21.2 п.27.13, spec 56 §3.3): the knob stands out from its track ≥ 3:1 (WCAG 1.4.11) — off (`track` +
 * knob `ink`) on a card (`surf`) and on a raised settings group (`surf2`, §11 п.17), on (`acc` + knob `onAcc`), and switched off
 * (`dimOpacity` over the whole switch). The track is translucent: it is laid over the surface, the surface over the screen.
 * Switched off falls under 3:1 (measured 16.11.2026, knob 18: dark 3.00 / 2.81 off on surf / surf2, light 2.69 / 2.71 off and
 * 3.01 / 2.98 on): WCAG 1.4.11 does not ask it of an inactive control, so the floor there is `DISABLED_MIN` until the DS decides
 * (a reported question of wave 1а, not a passed 3:1). The live pairs — off and on — hold 3:1.
 */
const DISABLED_MIN = 2.5;
describe.each(names)("%s switch (DS §9 А5: knob ≥ 3:1 to its track, off / on ≥ 3, disabled ≥ DISABLED_MIN)", (name) => {
  const c = themes[name];
  const dim = component.dimOpacity;
  /** a colour of the switch seen through `dimOpacity` over what is under the switch */
  const dimmed = (fg: RGBA, under: RGBA): RGBA => [fg[0] * dim + under[0] * (1 - dim), fg[1] * dim + under[1] * (1 - dim), fg[2] * dim + under[2] * (1 - dim), 1];
  const grounds = { surf: over(c.surf, c.bg), surf2: over(c.surf2, c.bg) };
  for (const [gname, g] of Object.entries(grounds)) {
    const toRgb = (x: RGBA) => `rgb(${x[0]},${x[1]},${x[2]})`;
    const offTrack = over(c.track, toRgb(g));
    it(`off on ${gname}: knob ink to the track`, () => expect(ratio(parse(c.ink), offTrack)).toBeGreaterThanOrEqual(3));
    it(`disabled off on ${gname}: the dimmed knob to the dimmed track`, () => expect(ratio(dimmed(parse(c.ink), g), dimmed(offTrack, g))).toBeGreaterThanOrEqual(DISABLED_MIN));
    it(`disabled on on ${gname}: the dimmed knob to the dimmed yellow track`, () => expect(ratio(dimmed(parse(c.onAcc), g), dimmed(parse(c.acc), g))).toBeGreaterThanOrEqual(DISABLED_MIN));
  }
  it("on: knob onAcc to the yellow track", () => expect(ratio(parse(c.onAcc), parse(c.acc))).toBeGreaterThanOrEqual(3));
});

/**
 * «Графит» — пилот #2254 (handoff §2.1, §3 п.5): text ≥ 7, second text ≥ 4.5, UI parts ≥ 3 — measured on every stop of
 * the scene (top / middle / bottom), with the panel, the sheet and the liquid-glass fallback laid over it. Native iOS 26
 * glass is not computable here: its caption sits on `glDim` over the fallback fill (the floor below holds for it).
 */
describe.each(names)("«Графит» %s contrast (#2254)", (name) => {
  const g = graphite.themes[name];
  const rgb = (x: RGBA) => `rgb(${x[0]},${x[1]},${x[2]})`;
  const scene = [g.bg, g.bgMid, g.bgLow];
  const on = (layer: string) => scene.map((s) => over(layer, s));
  const grounds = { panel: on(g.panel), sheet: on(g.sheetBg), solid: [parse(g.panelSolid)] };
  for (const [gname, list] of Object.entries(grounds)) {
    it(`text ≥ 7, text2 ≥ 4.5, statuses ≥ 4.5 on ${gname}`, () => {
      for (const s of list) {
        expect(ratio(parse(g.text), s)).toBeGreaterThanOrEqual(7);
        expect(ratio(parse(g.text2), s)).toBeGreaterThanOrEqual(4.5);
        for (const st of ["ok", "info", "warn", "bad"] as const) expect(ratio(parse(g[st]), s), st).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
  it("text2 on the glass nav (fallback fill + dim under the caption) ≥ 4.5", () => {
    for (const s of scene) expect(ratio(parse(g.text2), over(g.glDim, rgb(over(g.gl, s))))).toBeGreaterThanOrEqual(4.5);
  });
  it("the field edge stands out from the panel ≥ 3", () => {
    for (const p of grounds.panel) expect(ratio(over(g.fieldEdge, rgb(p)), p)).toBeGreaterThanOrEqual(3);
  });
  it("text on yellow, on the toast, on the selected pill, on the badge, on danger ≥ 7 / 4.5", () => {
    expect(ratio(parse(g.onAcc), parse(g.acc))).toBeGreaterThanOrEqual(7);
    expect(ratio(parse(g.onToast), parse(g.toast))).toBeGreaterThanOrEqual(7);
    expect(ratio(parse(g.onSel), parse(g.sel))).toBeGreaterThanOrEqual(7);
    expect(ratio(parse(g.onBadge), parse(g.badge))).toBeGreaterThanOrEqual(7);
    expect(ratio(parse(g.onDan), parse(g.danBg))).toBeGreaterThanOrEqual(4.5);
  });
  it("the round button, variant 2 (#2292): the glyph on the chip ≥ 7, on the selected plate ≥ 7; the inverse main button ≥ 7", () => {
    expect(ratio(parse(g.text), parse(g.chip))).toBeGreaterThanOrEqual(7);
    expect(ratio(parse(g.onSel), parse(g.sel))).toBeGreaterThanOrEqual(7);
    expect(ratio(parse(g.onBadge), parse(g.badge))).toBeGreaterThanOrEqual(7);
  });
  it("the hint in a field (`placeholder`) ≥ 4.5 on the field's solid base and paler than the typed text (#2292)", () => {
    expect(ratio(parse(g.placeholder), parse(g.panelSolid))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(parse(g.placeholder), parse(g.panelSolid))).toBeLessThan(ratio(parse(g.text), parse(g.panelSolid)));
    expect(ratio(parse(g.placeholder), parse(g.panelSolid))).toBeLessThan(ratio(parse(g.text2), parse(g.panelSolid)));
  });
  it("the yellow fill is one colour in both themes (only the main action and «＋»)", () => expect(g.acc).toBe("#FBFF00"));
  it("status icons (`ic`) on the panel ≥ 3 (UI), the word (`-w`) ≥ 4.5 — the word never in `ic`", () => {
    for (const s of on(g.panel))
      for (const st of ["ok", "info", "warn", "bad"] as const) expect(ratio(parse(g[`${st}Ic`]), s), `${st}Ic`).toBeGreaterThanOrEqual(3);
  });
  it("the solid fallbacks (Reduce Transparency, v2 §3 п.5): text ≥ 7, text2 ≥ 4.5 on panelSolid and glSolid", () => {
    for (const s of [g.panelSolid, g.glSolid]) {
      expect(ratio(parse(g.text), parse(s))).toBeGreaterThanOrEqual(7);
      expect(ratio(parse(g.text2), parse(s))).toBeGreaterThanOrEqual(4.5);
    }
  });
  /**
   * handoff v2 §2.9 — the design chat's measure on the founder's choice (worst pixel under each glyph, 20 screens × 2 themes):
   * text 8.27 / 7.80, text2 6.74 / 5.73, onAcc on yellow 18.86, the beam against the glass next to it 9.11 / 3.12 (light: thin
   * margin, check on the device), the selected nav label 8.27 / 16.33. Here: the same pairs on the flat fills, never under the floors.
   */
  it("§2.9: the beam against the glass of the nav ≥ 3 (light #5F6100: #A9AC00 gave 1.88)", () => {
    for (const s of scene) expect(ratio(parse(g.beam), over(g.gl, s))).toBeGreaterThanOrEqual(3);
  });
  it("§2.9: the selected nav label on the glass ≥ 7", () => {
    for (const s of scene) expect(ratio(parse(g.text), over(g.glDim, rgb(over(g.gl, s))))).toBeGreaterThanOrEqual(7);
  });
});
