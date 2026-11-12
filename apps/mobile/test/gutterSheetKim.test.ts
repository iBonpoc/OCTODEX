/**
 * The founder's demo measurement «David Kim» (build 1152; docs/specs/img/founder-kim/) on the drawing sheet (#1091, part 2):
 * contours of one size share a panel and a scale, no text lies on another or on a gutter, every corner's word stands at its
 * own corner (or has a leader). The fixture is rebuilt from his snapshots (test/fixtures/kimSheet.ts).
 */
import { drawingPrint as DP } from "@octo/design-tokens";
import { describe, expect, it } from "vitest";
import type { DocPrim } from "../src/features/docPages";
import { tFor } from "../src/i18n/translate";
import { blueprint, contours } from "../src/modules/gutters/view/blueprint";
import { kim } from "./fixtures/kimSheet";

const stamp = { company: "OCTODEX Demo Home Services", address: "4512 Ventura Canyon Ave", date: "11/11/2026", rough: true };
const rects = (items: DocPrim[]) => items.filter((p): p is Extract<DocPrim, { t: "r" }> => p.t === "r");
const texts = (items: DocPrim[]) => items.filter((p): p is Extract<DocPrim, { t: "x" }> => p.t === "x").map((p) => p.s);
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("the founder's sample on the sheet", () => {
  for (const width of [390, DP.pageW, DP.sheetW]) {
    it(`width ${width}: panels by size, every number and length once, no text on another text`, () => {
      const s = blueprint(kim, tFor("ru"), stamp, width);
      const tx = texts(s.items);
      // five contours; the cross one (69′) and the broken line (45′ + 25′) are of one size and share a panel: three or four
      // panels (the wider the sheet, the more of the small ones fit one scale), each with its own scale bar
      expect(contours(kim)).toHaveLength(5);
      const panels = tx.filter((x) => /^Контур \d/.test(x)).length;
      expect(panels).toBeGreaterThanOrEqual(3);
      expect(panels).toBeLessThanOrEqual(4);
      expect(tx.filter((x) => x.startsWith("Масштаб"))).toHaveLength(panels);
      for (let n = 1; n <= 10; n++) expect(tx.filter((x) => x === String(n)), `№${n}`).toHaveLength(1);
      for (const len of ["300′ 5″", "69′ 3″", "45′ 3″", "25′ 7″", "3′ 5″", "3′ 8″", "1′ 10″", "3′ 7″", "1′ 6″"]) expect(tx, len).toContain(len);
      const rs = rects(s.items);
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(overlap(rs[i]!, rs[j]!), `labels ${i} and ${j} overlap`).toBe(false);
    });
  }
  it("a corner's word never lies on a gutter", () => {
    const s = blueprint(kim, tFor("ru"), stamp, DP.sheetW);
    const lines = s.items.filter((p): p is Extract<DocPrim, { t: "l" }> => p.t === "l" && p.sw === DP.runW);
    const words = s.items.flatMap((p, i) => (p.t === "x" && /^(наруж\.|внутр\.|эркер) \d+°$/.test(p.s) ? [{ p, r: s.items[i - 1] }] : []));
    expect(words.length).toBeGreaterThanOrEqual(5);
    for (const { r } of words) {
      const box = r as Extract<DocPrim, { t: "r" }>;
      for (const l of lines) {
        for (let k = 0; k <= 40; k++) {
          const x = l.x1 + ((l.x2 - l.x1) * k) / 40, y = l.y1 + ((l.y2 - l.y1) * k) / 40;
          expect(x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h, "a corner word on a gutter").toBe(false);
        }
      }
    }
  });

  describe("numbers, header rows and the rectangle (review of #1192)", () => {
    type Prim = DocPrim;
    const sheet = () => blueprint(kim, tFor("ru"), stamp, DP.sheetW).items;
    const circlesOf = (items: Prim[]) => items.filter((p): p is Extract<DocPrim, { t: "c" }> => p.t === "c" && p.r === DP.numR);
    /** the number written in a circle: the text standing at its centre */
    const numberOf = (items: Prim[], c: { cx: number; cy: number }) => {
      const x = items.find((p): p is Extract<DocPrim, { t: "x" }> => p.t === "x" && /^\d+$/.test(p.s) && Math.abs(p.x - c.cx) < 0.6 && Math.abs(p.y - (c.cy + DP.fontSm * 0.35)) < 0.6);
      return x ? Number(x.s) : NaN;
    };
    const dist = (px: number, py: number, l: { x1: number; y1: number; x2: number; y2: number }) => {
      const vx = l.x2 - l.x1, vy = l.y2 - l.y1;
      const t = Math.max(0, Math.min(1, ((px - l.x1) * vx + (py - l.y1) * vy) / (vx * vx + vy * vy || 1)));
      return Math.hypot(px - (l.x1 + t * vx), py - (l.y1 + t * vy));
    };
    for (const width of [390, DP.pageW, DP.sheetW]) {
      it(`width ${width}: no circle or label in a panel's header row; circles clear of labels and of each other; each number nearest its own gutter`, () => {
        const items = blueprint(kim, tFor("ru"), stamp, width).items;
        const titles = items.filter((p): p is Extract<DocPrim, { t: "x" }> => p.t === "x" && /^Контур \d/.test(p.s));
        const bands = titles.map((x) => ({ y0: x.y - DP.fontSm * 1.2, y1: x.y - DP.fontSm * 1.2 + DP.fontSm * 3.4 }));
        const circles = circlesOf(items);
        const rs = rects(items);
        const inBand = (y0: number, y1: number) => bands.some((b) => y0 < b.y1 && b.y0 < y1);
        for (const c of circles) expect(inBand(c.cy - c.r, c.cy + c.r), `circle ${numberOf(items, c)} in a header row`).toBe(false);
        for (const r of rs) expect(inBand(r.y, r.y + r.h), "a label in a header row").toBe(false);
        for (let i = 0; i < circles.length; i++) {
          const a = circles[i]!;
          for (const r of rs) expect(overlap({ x: a.cx - a.r, y: a.cy - a.r, w: 2 * a.r, h: 2 * a.r }, r), `circle ${numberOf(items, a)} on a label`).toBe(false);
          for (let j = i + 1; j < circles.length; j++) expect(Math.hypot(a.cx - circles[j]!.cx, a.cy - circles[j]!.cy) >= 2 * a.r, `circles ${numberOf(items, a)} and ${numberOf(items, circles[j]!)} touch`).toBe(true);
        }
        const lines = items.filter((p): p is Extract<DocPrim, { t: "l" }> => p.t === "l" && p.sw === DP.runW);
        expect(lines).toHaveLength(10);
        for (const c of circles) {
          const n = numberOf(items, c);
          const near = lines.map((l, i) => ({ n: i + 1, d: dist(c.cx, c.cy, l) })).sort((p, q) => p.d - q.d)[0]!;
          expect(near.n, `the number ${n} stands nearest gutter ${near.n}`).toBe(n);
        }
      });
    }
    it("the rectangle (gutters 7–10) has exactly three «наруж. 90°», the open corner none", () => {
      const items = sheet();
      const titles = items.filter((p): p is Extract<DocPrim, { t: "x" }> => p.t === "x" && /^Контур \d/.test(p.s));
      const at = titles.findIndex((x) => /\b10\b/.test(x.s));
      expect(at).toBeGreaterThanOrEqual(0);
      const y0 = titles[at]!.y, y1 = titles[at + 1] ? titles[at + 1]!.y : Infinity;
      const words = items.filter((p): p is Extract<DocPrim, { t: "x" }> => p.t === "x" && p.s === "наруж. 90°" && p.y > y0 && p.y < y1);
      expect(words).toHaveLength(3);
    });
  });
});
