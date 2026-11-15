/**
 * #1091 (founder 12.11, build 1039): a 250′ 4″ gutter and a small contour 34′ 5″ · 25′ 4″ · 13′ 5″ on one sheet and one
 * scale ran together — numbers 2 and 3 on top of each other, the corner words in a row. A contour that would come out
 * too small next to a big one gets its own panel with its own scale bar; the numbers run through the whole sheet.
 */
import { drawingPrint as DP } from "@octo/design-tokens";
import { describe, expect, it } from "vitest";
import { clientPages, pagesProblem, type DocPrim } from "../src/features/docPages";
import { tFor } from "../src/i18n/translate";
import type { DrawnRun, Drawing, P } from "../src/modules/gutters/geometry";
import { blueprint, contours, sheetPage } from "../src/modules/gutters/view/blueprint";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const r = (id: string, a: P, b: P): DrawnRun => ({ id, a, b, attrs });
const ft = (n: number, i = 0) => n * 12 + i;
/** the founder's snapshot */
const big: Drawing = {
  runs: [
    r("a", [0, 0], [ft(250, 4), 0]),
    r("b", [ft(300), 0], [ft(334, 5), 0]),
    r("c", [ft(334, 5), 0], [ft(334, 5), ft(25, 4)]),
    r("d", [ft(334, 5), ft(25, 4)], [ft(321), ft(25, 4)]),
  ],
  downspouts: [],
};
const stamp = { company: "Test Gutters LLC", address: "12 Oak St", date: "11/10/2026", rough: false };
const texts = (items: DocPrim[]) => items.filter((p): p is Extract<DocPrim, { t: "x" }> => p.t === "x").map((p) => p.s);
const rects = (items: DocPrim[]) => items.filter((p): p is Extract<DocPrim, { t: "r" }> => p.t === "r");
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("contours", () => {
  it("the big one first; runs joined at an end are one contour; the rest apart", () => {
    expect(contours(big)).toEqual([[0], [1, 2, 3]]);
  });
  it("a near gap (a downspout's) keeps one contour, a far one splits", () => {
    const near: Drawing = { runs: [r("a", [0, 0], [ft(10), 0]), r("b", [ft(10, 20), 0], [ft(20), 0])], downspouts: [] };
    expect(contours(near)).toEqual([[0, 1]]);
    const far: Drawing = { runs: [r("a", [0, 0], [ft(10), 0]), r("b", [ft(100), 0], [ft(110), 0])], downspouts: [] };
    expect(contours(far)).toHaveLength(2);
  });
  it("every run is in exactly one, whatever the drawing", () => {
    for (const d of [big, { runs: [], downspouts: [] }, { runs: [big.runs[0]!], downspouts: [] }]) expect(contours(d).flat().sort()).toEqual(d.runs.map((_, i) => i));
  });
});

describe("the sheet", () => {
  for (const lang of ["ru", "en", "es"] as const) {
    it(`${lang}: two panels with their own scale, numbers through the sheet, no label on another`, () => {
      const s = blueprint(big, tFor(lang), stamp);
      const tx = texts(s.items);
      expect(tx.filter((x) => /^(Контур|Contour|Contorno) \d/.test(x))).toHaveLength(2);
      expect(tx.filter((x) => /^(Масштаб|Scale|Escala)/.test(x))).toHaveLength(2);
      expect(tx).toEqual(expect.arrayContaining(["1", "2", "3", "4"]));
      const rs = rects(s.items);
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(overlap(rs[i]!, rs[j]!), `labels ${i} and ${j} overlap`).toBe(false);
      expect(tx).toEqual(expect.arrayContaining(["250′ 4″", "34′ 5″", "25′ 4″", "13′ 5″"]));
    });
  }
  it("the scales differ: the big house's bar is long, the small one's short", () => {
    const sc = texts(blueprint(big, tFor("en"), stamp).items).filter((x) => x.startsWith("Scale"));
    expect(sc[0]).not.toBe(sc[1]);
  });
  it("the second contour reads at its own scale: its dimension line is longer than a fifth of the sheet", () => {
    const s = blueprint(big, tFor("en"), stamp);
    const runs = s.items.filter((p): p is Extract<DocPrim, { t: "l" }> => p.t === "l" && p.sw === DP.runW);
    const lens = runs.map((l) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1));
    expect(Math.min(...lens)).toBeGreaterThan(s.w / 12);
  });
  it("one contour or similar sizes: the sheet is as before — no panel title, one bar", () => {
    const one = blueprint({ runs: big.runs.slice(1), downspouts: [] }, tFor("en"), stamp);
    expect(texts(one.items).filter((x) => /^Contour/.test(x))).toHaveLength(0);
    expect(texts(one.items).filter((x) => x.startsWith("Scale"))).toHaveLength(1);
  });
  it("it is a page the core accepts (estimate, /p/, PDF)", () => {
    const page = sheetPage("p1", "x", blueprint(big, tFor("en"), stamp, DP.pageW));
    expect(pagesProblem([page])).toBeNull();
    expect(clientPages([page])[0]!.items.length).toBeGreaterThan(10);
  });
});
