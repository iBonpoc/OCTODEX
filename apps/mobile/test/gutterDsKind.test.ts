import { describe, expect, it } from "vitest";
import { DS_KINDS, DS_SHAPES, DS_STYLES, changeDs, dsKindOf } from "../src/modules/gutters/canvas/attrs";
import { DEFAULT_DS_ATTRS } from "../src/modules/gutters/canvas/model";
import { tFor } from "../src/i18n/translate";

/** #929 PR-2: the kind of a downspout = shape × style, one choice with an icon; the data stay shape + dsStyle. */
describe("downspout kinds", () => {
  it("four kinds, one for every (shape, style): a bijection", () => {
    expect(DS_KINDS).toHaveLength(DS_SHAPES.length * DS_STYLES.length);
    for (const sh of DS_SHAPES) for (const st of DS_STYLES) {
      const k = dsKindOf(sh, st);
      expect([k.shape, k.style]).toEqual([sh, st]);
    }
    expect(new Set(DS_KINDS.map((k) => k.key)).size).toBe(4);
    expect(new Set(DS_KINDS.map((k) => k.icon)).size).toBe(4);
  });
  it("no style stored is plain (an old drawing)", () => {
    expect(dsKindOf("rect").key).toBe("rectPlain");
    expect(dsKindOf("round", undefined).key).toBe("roundPlain");
  });
  it("a kind picked sets both; the size follows the shape and stays when only the style changes", () => {
    const rect = { ...DEFAULT_DS_ATTRS, size: "3x4" };
    const ribbed = changeDs(rect, { shape: "rect", dsStyle: "corrugated" });
    expect(ribbed).toMatchObject({ shape: "rect", dsStyle: "corrugated", size: "3x4" });
    const round = changeDs(ribbed, { shape: "round", dsStyle: "plain" });
    expect(round).toMatchObject({ shape: "round", dsStyle: "plain" });
    expect(round.size).toBe("3"); // a round size, not 3x4
  });
  it("the words fit a tile in the three languages: two lines, each a short word", () => {
    for (const lang of ["ru", "en", "es"] as const) {
      const t = tFor(lang);
      for (const k of DS_KINDS) {
        const lines = t(`mod.gutters.attr.kind.${k.key}` as never).split("\n");
        expect(lines).toHaveLength(2);
        for (const l of lines) expect(l.length).toBeLessThanOrEqual(12); // the tile's line at caption size, 390 px phone
      }
    }
  });
});
