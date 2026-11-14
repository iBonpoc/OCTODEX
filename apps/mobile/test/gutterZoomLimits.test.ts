/**
 * #1281 (founder 12.11: after a long pinch to and fro the app hung): no limits of the scale and a grid with millions of lines far out.
 * Limits (the farthest: the whole drawing in a quarter of the screen; the nearest: 1″ as big as a finger's target), the clamp of a view,
 * a ceiling of the grid's lines, and the time of a scene at the extreme scales.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { size as sizes } from "@octo/design-tokens";
import { buildGrid, buildScene, clampView, fitView, MAX_GRID_LINES, zoomLimits, type View } from "../src/modules/gutters/canvas/scene";
import { applyTf } from "../src/modules/gutters/canvas/gestureState";
import type { Drawing, P } from "../src/modules/gutters/geometry";

const vp = { w: 390, h: 844 };
const pts: P[] = [[0, 0], [1200, 0], [1200, 600], [0, 600]]; // a 100 × 50 ft house
const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };

describe("zoomLimits", () => {
  const lim = zoomLimits(pts, vp, 32, sizes.hitMin);
  it("the nearest: 1″ as big as a finger's target (hitMin px); the farthest: half the view that fits the drawing, so it takes a quarter of the screen", () => {
    expect(lim.kMax).toBe(sizes.hitMin);
    const fit = fitView(pts, vp, 32);
    expect(lim.kMin).toBeCloseTo(fit.k / 2, 9);
    // at the farthest limit the drawing is half as wide and half as high as when it fits: a quarter of the area
    expect((1200 * lim.kMin) / (1200 * fit.k)).toBeCloseTo(0.5, 9);
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
    const g = buildGrid({ k: 1, ox: 0, oy: vp.h }, vp, 8);
    expect(lines(g)).toBeGreaterThan(5);
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
