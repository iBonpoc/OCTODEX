import { describe, expect, it } from "vitest";
import { print, themes, type ThemeName } from "../src/index";

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
});

describe("print contrast on paper (documents for the client: text ≥ 4.5:1)", () => {
  const paper = parse(print.paper);
  it.each([["ink", print.ink], ["mut", print.mut], ["okText", print.okText]])("%s on paper", (_n, c) => {
    expect(ratio(parse(c), paper)).toBeGreaterThanOrEqual(4.5);
  });
});
