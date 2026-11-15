/**
 * #1681: the lines a label must not lie on are put into the cells of the screen only (the part of a line off the screen
 * is never read — a label is placed only wholly inside the screen). The placement is the same as before: a digest of
 * ~200 seeded scenes and a few made on purpose, taken on the code before the change.
 */
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { size as sizes } from "@octo/design-tokens";
import { clipSegment, layoutLabels, work, type LabelWant } from "../src/modules/gutters/canvas/labels";
import { buildScene, fitView, zoomLimits, type View } from "../src/modules/gutters/canvas/scene";
import type { Drawing, P } from "../src/modules/gutters/geometry";

type Pt = [number, number];
const vp = { w: 390, h: 844 };

/** a seeded random (mulberry32): the same scenes on every machine */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** a scene: lines far past the screen too (up to 20 screens away), labels on some of them */
function scene(seed: number) {
  const r = rng(seed);
  const at = (): Pt => [(r() - 0.5) * vp.w * (r() < 0.3 ? 40 : 2) + vp.w / 2, (r() - 0.5) * vp.h * (r() < 0.3 ? 40 : 2) + vp.h / 2];
  const lines = Array.from({ length: 3 + Math.floor(r() * 25) }, () => ({ a: at(), b: at() }));
  const want: LabelWant[] = lines.slice(0, Math.floor(r() * lines.length) + 1).map((l, i) => ({
    id: `l${i}`, a: l.a, b: l.b, w: 30 + Math.floor(r() * 50), h: 20, priority: Math.floor(r() * 100), ...(r() < 0.2 ? { must: true } : {}),
  }));
  const marks = r() < 0.5 ? [{ at: at(), r: 9 }] : [];
  return { lines, want, marks, keepAll: r() < 0.1 };
}

const digest = (xs: { id: string; x: number; y: number }[]) => xs.map((p) => `${p.id}@${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(";");

/** a 32-bit FNV-1a of a string: one short number for a long placement */
const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
};

describe("#1681 the placement is the same with the lines cut to the screen", () => {
  it("200 seeded scenes: one digest, taken before the change", () => {
    let all = "";
    for (let seed = 1; seed <= 200; seed++) {
      const s = scene(seed);
      all += `|${seed}:` + digest(layoutLabels(s.want, vp, 4, s.keepAll, s.marks, s.lines));
    }
    expect(fnv(all)).toMatchInlineSnapshot(`"4daa5174"`);
  });

  it("on purpose: a line with both ends off the screen across it; a label at the edge by a line that leaves it; must; keepAll; every line off the screen", () => {
    const across = { a: [-5000, 400] as Pt, b: [5390, 420] as Pt }; // its middle is on the screen
    const leaving = { a: [300, 120] as Pt, b: [9000, 160] as Pt };
    const short = { a: [330, 60] as Pt, b: [385, 60] as Pt }; // at the right edge, the leaving line just under it
    const off = { a: [-3000, -3000] as Pt, b: [-2000, -2500] as Pt };
    const w = (id: string, l: { a: Pt; b: Pt }, extra: Partial<LabelWant> = {}): LabelWant => ({ id, a: l.a, b: l.b, w: 60, h: 20, priority: 1, ...extra });
    const top = { a: [100, 30] as Pt, b: [290, 30] as Pt };
    const cases = {
      across: layoutLabels([w("x", across), w("x2", across, { priority: 0 })], vp, 4, false, [], [across, leaving]),
      edge: layoutLabels([w("e", short), w("l", leaving)], vp, 4, false, [], [short, leaving, across]),
      must: layoutLabels([w("m", across, { must: true }), w("n", across), w("n2", across)], vp, 4, false, [{ at: [195, 380], r: 30 }], [across, leaving]),
      keepAll: layoutLabels([w("k", off), w("k2", across)], vp, 4, true, [], [off, across]),
      // every line off the screen, a mark over the label's places: it still shows (off the lines, over the mark)
      allOff: layoutLabels([w("o", top, { w: 180 })], vp, 4, false, [{ at: [195, 30], r: 200 }], [off]),
    };
    expect(Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, digest(v)]))).toMatchInlineSnapshot(`
      {
        "across": "x@194.973,424.058;x2@195.027,395.942",
        "allOff": "o@195.000,44.000",
        "edge": "e@357.500,74.000",
        "keepAll": "k@-2511.789,-2726.422;k2@194.973,424.058",
        "must": "m@194.973,424.058;n@195.027,395.942",
      }
    `);
  });
});

describe("#1681 the work of the labels does not grow with the scale (a count, not a clock)", () => {
  const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
  const big: Drawing = { runs: Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, a: [i * 100, 0] as P, b: [i * 100 + 90, 400] as P, attrs })), downspouts: [] };
  const pts = big.runs.flatMap((r) => [r.a, r.b]);
  const lim = zoomLimits(pts, vp, 32, sizes.hitMin);
  const opts = (view: View) => ({ view, viewport: vp, fontSize: 14, padX: 4, gap: 4, dsPad: 7, dsText: (n: number) => `D${n}`, storyText: (n: number) => `эт ${n}` });
  const cells = (view: View) => {
    work.lineCells = 0;
    buildScene(big, opts(view));
    return work.lineCells;
  };
  it("the lines' cells at the nearest and the farthest scale: at most 3× the fitted view's (the part off the screen is not indexed)", () => {
    const fit = cells(fitView(pts, vp, 32));
    expect(fit).toBeGreaterThan(0);
    for (const k of [lim.kMin, lim.kMax]) {
      const n = cells({ k, ox: vp.w / 2, oy: vp.h / 2 });
      expect(n, `k=${k}: ${n} cells vs fitted ${fit}`).toBeLessThanOrEqual(fit * 3);
    }
  });
});

describe("clipSegment: the part of a segment inside a box", () => {
  const box = { x0: 0, y0: 0, x1: 100, y1: 50 };
  it("inside — the same; across — its ends on the edges; past — none", () => {
    expect(clipSegment([10, 10], [90, 40], box)).toEqual([[10, 10], [90, 40]]);
    expect(clipSegment([-100, 25], [200, 25], box)).toEqual([[0, 25], [100, 25]]);
    expect(clipSegment([50, -100], [50, 100], box)).toEqual([[50, 0], [50, 50]]);
    expect(clipSegment([-10, -10], [-1, 60], box)).toBeNull();
    expect(clipSegment([0, 80], [100, 80], box)).toBeNull();
  });
  it("a point inside and outside; a segment that touches a corner only", () => {
    expect(clipSegment([5, 5], [5, 5], box)).toEqual([[5, 5], [5, 5]]);
    expect(clipSegment([500, 5], [500, 5], box)).toBeNull();
    expect(clipSegment([-50, 50], [0, 100], { x0: 0, y0: 0, x1: 100, y1: 100 })).toEqual([[0, 100], [0, 100]]);
  });
  it("a broken point (NaN, Infinity) — none, as before: it never gave a cell", () => {
    expect(clipSegment([NaN, 0], [10, 10], box)).toBeNull();
    expect(clipSegment([0, 0], [Infinity, 10], box)).toBeNull();
  });
});
