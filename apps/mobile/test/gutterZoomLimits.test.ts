/**
 * #1281 (founder 12.11: after a long pinch to and fro the app hung): no limits of the scale and a grid with millions of lines far out.
 * Limits (the farthest: the whole drawing in a quarter of the screen; the nearest: 1″ as big as a finger's target), the clamp of a view,
 * a ceiling of the grid's lines, and the time of a scene at the extreme scales.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { size as sizes } from "@octo/design-tokens";
import { buildGrid, buildScene, clampView, fitView, GRID_REACH, GRID_STEPS_IN, gridStepIn, MAX_GRID_LINES, zoomLimits, type View } from "../src/modules/gutters/canvas/scene";
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

describe("buildGrid: a ceiling of the lines, whatever the scale (k → 0 made millions)", () => {
  const lines = (g: { minor: string; major: string }) => (g.minor.match(/M/g)?.length ?? 0) + (g.major.match(/M/g)?.length ?? 0);
  it("k from 44 down to 1e-9 and 0, NaN: never more than MAX_GRID_LINES lines, and fast", () => {
    const t0 = performance.now();
    for (const k of [44, 10, 1, 0.1, 0.01, 1e-3, 1e-4, 1e-6, 1e-9, 0, NaN]) {
      const g = buildGrid({ k, ox: vp.w / 2, oy: vp.h / 2 }, vp, 8);
      expect(lines(g)).toBeLessThanOrEqual(MAX_GRID_LINES);
    }
    expect(performance.now() - t0).toBeLessThan(500);
  });
  it("a normal scale still has its grid (the ceiling does not eat it)", () => {
    const g = buildGrid({ k: 1, ox: 0, oy: vp.h }, vp, 24);
    expect(lines(g)).toBeGreaterThan(5);
  });
});

describe("#1403 — the grid covers the screen at any live pan or zoom, and has a fine step at the nearest scale", () => {
  const nums = (d: string, re: RegExp) => [...d.matchAll(re)].map((m) => Number(m[1]));
  it("the lines run GRID_REACH screens past the screen on every side, and there are lines out there", () => {
    const g = buildGrid({ k: 1, ox: 100, oy: 500 }, vp, 24);
    const all = g.minor + g.major;
    const xs = nums(all, /M(-?[\d.]+) -/g); // vertical lines: «M<x> <-ry>V…»
    expect(Math.min(...xs)).toBeLessThan(0); // a line left of the screen
    expect(Math.max(...xs)).toBeGreaterThan(vp.w); // and right of it
    expect(all).toContain(`M${-GRID_REACH * vp.w} `); // horizontal lines start GRID_REACH screens to the left…
    expect(all).toContain(`H${(1 + GRID_REACH) * vp.w}`); // …and end that far to the right
    expect(all).toContain(`V${(1 + GRID_REACH) * vp.h}`); // vertical lines end that far below
  });
  it("a live zoom out to a quarter about ANY point of the screen (the farthest limit from the fitting view), and a pan by a screen: the grid still covers the screen", () => {
    const covers = (S: number, fx: number, fy: number, dx = 0, dy = 0) => {
      const Tx = (1 - S) * fx + dx, Ty = (1 - S) * fy + dy; // the live transform p' = S·p + T: scale about the fingers' point, then shifted
      const x0 = S * -GRID_REACH * vp.w + Tx, x1 = S * (1 + GRID_REACH) * vp.w + Tx;
      const y0 = S * -GRID_REACH * vp.h + Ty, y1 = S * (1 + GRID_REACH) * vp.h + Ty;
      return x0 <= 0 && x1 >= vp.w && y0 <= 0 && y1 >= vp.h;
    };
    for (const S of [1, 0.5, 0.3, 0.25]) for (const [fx, fy] of [[0, 0], [vp.w, vp.h], [vp.w / 2, vp.h / 2], [0, vp.h], [vp.w, 0]] as const) expect(covers(S, fx, fy)).toBe(true);
    expect(covers(1, 0, 0, vp.w, vp.h)).toBe(true);
    expect(covers(1, 0, 0, -vp.w, -vp.h)).toBe(true);
    expect(covers(0.2, 0, 0)).toBe(false); // the reach is finite: farther than the farthest limit is not promised
  });
  it("at the nearest scale (1″ = a finger's target) the cell is 1″ or 6″, not one huge 1 ft cell; the steps only get coarser outwards", () => {
    expect(GRID_STEPS_IN.slice(0, 2)).toEqual([1, 6]);
    expect(gridStepIn(sizes.hitMin, 24)).toBe(1);
    expect(gridStepIn(sizes.hitMin / 4, 24)).toBe(6); // 6″ = 66 px
    for (let i = 1; i < GRID_STEPS_IN.length; i++) expect(GRID_STEPS_IN[i]!).toBeGreaterThan(GRID_STEPS_IN[i - 1]!);
  });
  it("lines at the nearest scale: more than 2 on the screen (it was one cell) and still under the ceiling", () => {
    const g = buildGrid({ k: sizes.hitMin, ox: 0, oy: vp.h }, vp, 24);
    const lines = (g.minor.match(/M/g)?.length ?? 0) + (g.major.match(/M/g)?.length ?? 0);
    expect(lines).toBeGreaterThan(10);
    expect(lines).toBeLessThanOrEqual(MAX_GRID_LINES);
  });
});

describe("the time of a scene at the extreme scales (the speed bench's idea, in units: a big drawing, the farthest and the nearest)", () => {
  const big: Drawing = { runs: Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, a: [i * 100, 0] as P, b: [i * 100 + 90, 400] as P, attrs })), downspouts: [] };
  const lim = zoomLimits(big.runs.flatMap((r) => [r.a, r.b]), vp, 32, sizes.hitMin);
  const opts = (view: View) => ({ view, viewport: vp, fontSize: 14, padX: 4, gap: 4, dsPad: 7, dsText: (n: number) => `D${n}`, storyText: (n: number) => `эт ${n}`, gridMinPx: 8 });
  it("a scene (runs, labels, the grid) at kMin and at kMax is built in well under a frame's budget × 10 on this machine", () => {
    for (const k of [lim.kMin, lim.kMax]) {
      const t0 = performance.now();
      buildScene(big, opts({ k, ox: vp.w / 2, oy: vp.h / 2 }));
      expect(performance.now() - t0).toBeLessThan(160); // a frame is 16 ms on a phone; the device's own bench is the founder's (the browser here is not a phone)
    }
  });
});
