/**
 * #1281 (founder 12.11: after a long pinch to and fro the app hung): no limits of the scale and a grid with millions of lines far out.
 * Limits (the farthest: the whole drawing in a quarter of the screen; the nearest: 1″ as big as a finger's target), the clamp of a view,
 * a ceiling of the grid's lines, and the time of a scene at the extreme scales.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { size as sizes } from "@octo/design-tokens";
import { gridPaths, GRID_STEPS_IN, gridStepIn, MAX_GRID_LINES } from "../src/modules/gutters/canvas/grid";
import { buildScene, clampView, fitView, zoomLimits, type View } from "../src/modules/gutters/canvas/scene";
import { applyTf } from "../src/modules/gutters/canvas/gestureState";
import type { Drawing, P } from "../src/modules/gutters/geometry";

const vp = { w: 390, h: 844 };
const pts: P[] = [[0, 0], [1200, 0], [1200, 600], [0, 600]]; // a 100 × 50 ft house
const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };

describe("zoomLimits", () => {
  const lim = zoomLimits(pts, vp, 32, sizes.hitMin);
  it("the nearest: 1″ as big as a finger's target (hitMin px); the farthest: a quarter of the view that fits the drawing (#1403: was half), so it takes a quarter of the screen each way", () => {
    expect(lim.kMax).toBe(sizes.hitMin);
    const fit = fitView(pts, vp, 32);
    expect(lim.kMin).toBeCloseTo(fit.k / 4, 9);
    expect((1200 * lim.kMin) / (1200 * fit.k)).toBeCloseTo(0.25, 9);
  });
  it("a tiny drawing: the farthest limit never goes beyond the nearest", () => {
    const tiny = zoomLimits([[0, 0], [1, 1]], vp, 32, sizes.hitMin);
    expect(tiny.kMin).toBeLessThanOrEqual(tiny.kMax);
  });
  it("an empty drawing: sane limits (the default 40 ft sheet)", () => {
    const e = zoomLimits([], vp, 32, sizes.hitMin);
    expect(e.kMin).toBeGreaterThan(0);
    expect(e.kMin).toBeLessThan(e.kMax);
  });
});

describe("commitView / clampView: the committed view is inside the limits", () => {
  const lim = { kMin: 0.2, kMax: 44 };
  const v: View = { k: 1, ox: 100, oy: 200 };
  it("a pinch far out or far in is clamped at the commit; the centre of the viewport stays where it is", () => {
    for (const S of [1e-9, 1e-3, 1e3, 1e9]) {
      const c = clampView(applyTf(v, { S, Tx: 0, Ty: 0 }), lim, vp);
      expect(c.k).toBeGreaterThanOrEqual(lim.kMin);
      expect(c.k).toBeLessThanOrEqual(lim.kMax);
      // the plan point under the centre before the clamp is under it after
      const raw = applyTf(v, { S, Tx: 0, Ty: 0 });
      const at = (w: View) => [(vp.w / 2 - w.ox) / w.k, -(vp.h / 2 - w.oy) / w.k];
      expect(at(c)[0]).toBeCloseTo(at(raw)[0]!, 6);
      expect(at(c)[1]).toBeCloseTo(at(raw)[1]!, 6);
    }
  });
  it("a view inside the limits is the same object (nothing to do); a broken scale (NaN, 0) comes back inside", () => {
    expect(clampView(v, lim, vp)).toBe(v);
    expect(clampView({ k: NaN, ox: 0, oy: 0 }, lim, vp).k).toBe(lim.kMin);
    expect(clampView({ k: 0, ox: 0, oy: 0 }, lim, vp).k).toBe(lim.kMin);
  });
});

describe("#1403 — the grid: the whole screen at any view, the fine steps at the nearest scale, a ceiling of the lines", () => {
  const lines = (g: { minor: string; major: string }) => (g.minor.match(/M/g)?.length ?? 0) + (g.major.match(/M/g)?.length ?? 0);
  const xsOf = (g: { minor: string; major: string }) => [...(g.minor + g.major).matchAll(/M(-?[\d.]+) 0V/g)].map((m) => Number(m[1]));
  const ysOf = (g: { minor: string; major: string }) => [...(g.minor + g.major).matchAll(/M0 (-?[\d.]+)H/g)].map((m) => Number(m[1]));
  it("the lines cover EXACTLY the screen: the first and the last of each direction are less than a cell from its edges, none outside", () => {
    for (const [k, ox, oy] of [[1, 100, 500], [0.3, -40, 900], [5, 0, 844], [44, -1000, 3000], [0.02, 200, 400]] as const) {
      const g = gridPaths(k, ox, oy, vp.w, vp.h, 24);
      const cell = g.stepIn * k;
      const xs = xsOf(g), ys = ysOf(g);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.05);
      expect(Math.max(...xs)).toBeLessThanOrEqual(vp.w + 0.05);
      expect(Math.min(...xs)).toBeLessThan(cell + 0.1);
      expect(Math.max(...xs)).toBeGreaterThan(vp.w - cell - 0.1);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(-0.05);
      expect(Math.max(...ys)).toBeLessThanOrEqual(vp.h + 0.05);
      expect(Math.min(...ys)).toBeLessThan(cell + 0.1);
      expect(Math.max(...ys)).toBeGreaterThan(vp.h - cell - 0.1);
    }
  });
  it("it follows the live transform of the fingers: the view the screen shows now is the committed view under p' = S·p + T, and it is covered whatever S and T are", () => {
    const base = { k: 2, ox: 100, oy: 600 };
    for (const [S, Tx, Ty] of [[1, 390, -300], [0.25, 20, 700], [3, -500, -900], [0.5, 150, 150]] as const) {
      const g = gridPaths(base.k * S, S * base.ox + Tx, S * base.oy + Ty, vp.w, vp.h, 24);
      expect(lines(g)).toBeGreaterThan(4);
      expect(Math.min(...xsOf(g))).toBeLessThan(g.stepIn * base.k * S + 0.1);
      expect(Math.max(...xsOf(g))).toBeGreaterThan(vp.w - g.stepIn * base.k * S - 0.1);
    }
  });
  it("at the nearest scale (1″ = a finger's target) the cell is 1″ or 6″, not one huge 1 ft cell; the steps only get coarser outwards", () => {
    expect(GRID_STEPS_IN.slice(0, 2)).toEqual([1, 6]);
    expect(gridStepIn(sizes.hitMin, 24)).toBe(1);
    expect(gridStepIn(sizes.hitMin / 4, 24)).toBe(6); // 6″ = 66 px
    for (let i = 1; i < GRID_STEPS_IN.length; i++) expect(GRID_STEPS_IN[i]!).toBeGreaterThan(GRID_STEPS_IN[i - 1]!);
  });
  it("a ceiling of the lines whatever the scale (k → 0 made millions): never more than MAX_GRID_LINES, none for a broken view, and fast", () => {
    const t0 = performance.now();
    for (const k of [44, 10, 1, 0.1, 0.01, 1e-3, 1e-4, 1e-6, 1e-9, 0, NaN, Infinity]) {
      const g = gridPaths(k, vp.w / 2, vp.h / 2, vp.w, vp.h, 24);
      expect(lines(g)).toBeLessThanOrEqual(MAX_GRID_LINES);
    }
    expect(gridPaths(NaN, 0, 0, vp.w, vp.h, 24)).toMatchObject({ minor: "", major: "" });
    expect(gridPaths(1, NaN, 0, vp.w, vp.h, 24)).toMatchObject({ minor: "", major: "" });
    expect(performance.now() - t0).toBeLessThan(500);
  });
  it("a normal scale has its grid (the ceiling does not eat it), at the nearest scale there are more than 10 lines (it was one cell)", () => {
    expect(lines(gridPaths(1, 0, vp.h, vp.w, vp.h, 24))).toBeGreaterThan(5);
    const g = gridPaths(sizes.hitMin, 0, vp.h, vp.w, vp.h, 24);
    expect(lines(g)).toBeGreaterThan(10);
    expect(lines(g)).toBeLessThanOrEqual(MAX_GRID_LINES);
  });
  it("every 5th line is a major one", () => {
    const g = gridPaths(1, 0, vp.h, vp.w, vp.h, 24);
    expect(g.major).toContain("M0.0 0V");
    expect(g.minor).not.toContain("M0.0 0V");
  });
});

describe("the time of a scene at the extreme scales (the speed bench's idea, in units: a big drawing, the farthest and the nearest)", () => {
  const big: Drawing = { runs: Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, a: [i * 100, 0] as P, b: [i * 100 + 90, 400] as P, attrs })), downspouts: [] };
  const lim = zoomLimits(big.runs.flatMap((r) => [r.a, r.b]), vp, 32, sizes.hitMin);
  const opts = (view: View) => ({ view, viewport: vp, fontSize: 14, padX: 4, gap: 4, dsPad: 7, dsText: (n: number) => `D${n}`, storyText: (n: number) => `эт ${n}` });
  it("a scene (runs, labels, the grid) at kMin and at kMax is built in well under a frame's budget × 10 on this machine", () => {
    for (const k of [lim.kMin, lim.kMax]) {
      const t0 = performance.now();
      buildScene(big, opts({ k, ox: vp.w / 2, oy: vp.h / 2 }));
      expect(performance.now() - t0).toBeLessThan(160); // a frame is 16 ms on a phone; the device's own bench is the founder's (the browser here is not a phone)
    }
  });
});
