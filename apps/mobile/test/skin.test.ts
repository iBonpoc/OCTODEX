/**
 * #2292 Ш2 — the colour set: «Наряд» by default and for any junk, «Графит» only on the exact value; «Наряд» is the very
 * same `themes[name]` object (so the app is as before), «Графит» keeps every key of `ThemeColors`.
 */
import { describe, expect, it } from "vitest";
import { graphiteThemes, themes, type ThemeName } from "@octo/design-tokens";
import { colorsFor, DEFAULT_SKIN, parseSkin } from "../src/theme/skin";

const names: ThemeName[] = ["dark", "light"];

describe("unit:skin — the choice", () => {
  it("С1 default is «Наряд»; junk and old values are «Наряд»", () => {
    expect(DEFAULT_SKIN).toBe("naryad");
    for (const v of [undefined, null, "", "Graphite", "1", 1, true, {}]) expect(parseSkin(v)).toBe("naryad");
    expect(parseSkin("naryad")).toBe("naryad");
  });
  it("С2 only the exact value turns «Графит» on", () => expect(parseSkin("graphite")).toBe("graphite"));
  it("С3 «Наряд» is the same object as before, in both themes", () => {
    for (const n of names) expect(colorsFor("naryad", n)).toBe(themes[n]);
  });
});

describe("unit:skin — «Графит» mapped to ThemeColors", () => {
  for (const n of names) {
    it(`С4 ${n}: every key of «Наряд» stays, the colours come from «Графит»`, () => {
      const c = colorsFor("graphite", n);
      const g = graphiteThemes[n];
      expect(Object.keys(c).sort()).toEqual(Object.keys(themes[n]).sort());
      expect(c.bg).toBe(g.bg);
      expect(c.ink).toBe(g.text);
      expect(c.mut).toBe(g.text2);
      expect(c.surf).toBe(g.panel);
      expect(c.bdField).toBe(g.fieldEdge);
      expect(c.acc).toBe(g.acc);
      expect(c.status.bad).toEqual({ fill: g.badIc, text: g.bad, on: g.onDan });
      expect(c.status.neutral.text).toBe(g.text2);
      // not mapped: as in «Наряд»
      expect(c.shadow).toBe(themes[n].shadow);
      expect(c.drawing).toBe(themes[n].drawing);
      expect(c.glow).toBe(themes[n].glow);
    });
  }
  it("С5 the mapped set is made once", () => expect(colorsFor("graphite", "dark")).toBe(colorsFor("graphite", "dark")));
});
