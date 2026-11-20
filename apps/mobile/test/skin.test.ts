/**
 * #2292 Ш2 — the colour set: «Наряд» by default and for any junk, «Графит» only on the exact value; «Наряд» is the very
 * same `themes[name]` object (so the app is as before), «Графит» keeps every key of `ThemeColors`.
 */
import { describe, expect, it } from "vitest";
import { graphiteThemes, themes, type ThemeName } from "@octo/design-tokens";
import { colorsFor, DEFAULT_SKIN, parseSkin, SKIN_KEY } from "../src/theme/skin";
import { readSkin } from "../src/theme/skinRead";
import { DEVICE_KEYS, isDeviceKey } from "../src/features/deleteAccount";

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
    it(`С4 ${n}: every key of «Наряд» stays (and the scene is added), the colours come from «Графит»`, () => {
      const c = colorsFor("graphite", n);
      const g = graphiteThemes[n];
      expect(Object.keys(c).sort()).toEqual([...Object.keys(themes[n]), "scene"].sort());
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
    });
  }
  it("С5 the mapped set is made once", () => expect(colorsFor("graphite", "dark")).toBe(colorsFor("graphite", "dark")));
});

describe("unit:skin — what is left of «Наряд» in «Графит» (С6)", () => {
  /** the keys «Графит» does not own (spec 63 / #2314): no shadows, the glass is its own number set, the drawing canvas keeps its storey colours */
  const FROM_NARYAD = ["shadow", "blur", "blurOverlay", "blurTint", "drawing"];
  for (const n of names) {
    it(`${n}: every other key of ThemeColors is a «Графит» colour (a key that stayed the same must be listed above)`, () => {
      const c = colorsFor("graphite", n) as unknown as Record<string, unknown>;
      const base = themes[n] as unknown as Record<string, unknown>;
      const same = Object.keys(base).filter((k) => JSON.stringify(c[k]) === JSON.stringify(base[k]));
      // acc / onAcc / the tape's mark are the same yellow in both looks: the value is equal, the source is «Графит»
      const SAME_VALUE = ["acc", "onAcc", "tape", "blurTint"];
      expect(same.filter((k) => !FROM_NARYAD.includes(k) && !SAME_VALUE.includes(k))).toEqual([]);
      expect(FROM_NARYAD.every((k) => JSON.stringify(c[k]) === JSON.stringify(base[k]))).toBe(true);
    });
    it(`${n}: the soft glow spots are off and the scene is the «Графит» gradient`, () => {
      const c = colorsFor("graphite", n);
      expect(c.glow).toEqual([]);
      expect(c.scene).toEqual({ mid: graphiteThemes[n].bgMid, low: graphiteThemes[n].bgLow });
      expect(colorsFor("naryad", n).scene).toBeUndefined();
    });
  }
});

describe("unit:skin — the stored value and the device wipe (С7)", () => {
  it("the stored JSON text is read; junk, nothing and a broken text are «Наряд»", () => {
    expect(readSkin('"graphite"')).toBe("graphite");
    for (const r of [null, "", "graphite", "1", '"x"', "{"]) expect(readSkin(r)).toBe("naryad");
  });
  it("the key is wiped with the device (sign-out, account deletion)", () => {
    expect(DEVICE_KEYS).toContain(SKIN_KEY);
    expect(isDeviceKey(SKIN_KEY)).toBe(true);
  });
});
