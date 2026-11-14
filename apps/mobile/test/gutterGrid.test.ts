/**
 * #1434 — the canvas grid on an iPhone was a small rectangle on a pinch out (build 1405): it was a path of the scaled layer,
 * drawn beyond it and left to `overflow: visible`, which react-native-svg on iOS does not honour. Now the grid is a
 * screen-sized layer whose paths are computed per frame from the live view (canvas/grid.ts, GridLayer). These tests are the
 * grid's whole contract: it covers the screen at every live view, it has a ceiling of lines, the steps, and its speed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GRID_STEPS_IN, gridPaths, gridStepIn, liveView, MAX_GRID_LINES } from "../src/modules/gutters/canvas/grid";

const vp = { w: 390, h: 844 };
const lines = (g: { minor: string; major: string }) => (g.minor.match(/M/g)?.length ?? 0) + (g.major.match(/M/g)?.length ?? 0);
const xsOf = (d: string) => [...d.matchAll(/M(-?[\d.]+) 0V/g)].map((m) => Number(m[1]));
const ysOf = (d: string) => [...d.matchAll(/M0 (-?[\d.]+)H/g)].map((m) => Number(m[1]));

describe("gridPaths: drawn over the screen, not beyond it", () => {
  it("every line lies on the screen and runs across all of it (a vertical one 0…h, a horizontal one 0…w)", () => {
    const g = gridPaths(1, 100, 500, vp.w, vp.h, 24);
    const all = g.minor + g.major;
    for (const x of xsOf(all)) expect(x >= 0 && x <= vp.w).toBe(true);
    for (const y of ysOf(all)) expect(y >= 0 && y <= vp.h).toBe(true);
    expect(all).toContain(`V${vp.h}`);
    expect(all).toContain(`H${vp.w}`);
    expect(xsOf(all).length).toBeGreaterThan(5);
    expect(ysOf(all).length).toBeGreaterThan(5);
  });
  it("every 5th line is a major one, the rest minor", () => {
    const g = gridPaths(1, 0, vp.h, vp.w, vp.h, 24); // a cell of 1 ft = 12 px is finer than 24: 5 ft = 60 px
    expect(g.stepIn).toBe(60);
    expect(xsOf(g.major)).toContain(0);
    expect(xsOf(g.minor)).toContain(60);
    expect(xsOf(g.major)).toContain(300);
  });
});

describe("#1434: the grid covers the whole screen at ANY live view of the fingers — the iPhone's rectangle", () => {
  // the live transform p' = S·p + (1 − S)·f + T: a pinch about the fingers' point f, then a shift T
  const at = (S: number, fx: number, fy: number, Tx = 0, Ty = 0) => {
    const v = liveView(0.5, vp.w / 2, vp.h / 2, S, Tx, Ty, fx, fy);
    return gridPaths(v.k, v.ox, v.oy, vp.w, vp.h, 24);
  };
  it("a pinch out far past the old reach (to a tenth), about any point, and a pan by screens: lines at both edges, every way", () => {
    for (const S of [1, 0.5, 0.25, 0.1, 0.05]) {
      for (const [fx, fy] of [[0, 0], [vp.w, vp.h], [vp.w / 2, vp.h / 2], [0, vp.h], [vp.w, 0]] as const) {
        for (const [Tx, Ty] of [[0, 0], [vp.w * 3, -vp.h * 2], [-vp.w * 5, vp.h * 4]] as const) {
          const g = at(S, fx, fy, Tx, Ty);
          const all = g.minor + g.major;
          const xs = xsOf(all), ys = ysOf(all);
          // the lines are spread over the whole screen: none of its sides is left without them by more than a cell
          const cell = g.stepIn * 0.5 * S;
          expect(Math.min(...xs)).toBeLessThanOrEqual(cell + 0.1);
          expect(Math.max(...xs)).toBeGreaterThanOrEqual(vp.w - cell - 0.1);
          expect(Math.min(...ys)).toBeLessThanOrEqual(cell + 0.1);
          expect(Math.max(...ys)).toBeGreaterThanOrEqual(vp.h - cell - 0.1);
        }
      }
    }
  });
  it("the step follows the live scale: a pinch out makes the cell coarser, so the lines on the screen stay few", () => {
    const near = at(1, vp.w / 2, vp.h / 2), far = at(0.05, vp.w / 2, vp.h / 2);
    expect(far.stepIn).toBeGreaterThan(near.stepIn);
    expect(lines(far)).toBeLessThan(MAX_GRID_LINES);
  });
  it("liveView: the identity transform is the committed view; it is the same map as the canvas's style", () => {
    expect(liveView(2, 10, 20, 1, 0, 0)).toEqual({ k: 2, ox: 10, oy: 20 });
    // a plan point (x, y) on the screen: (x·k + ox, −y·k + oy), then p' = S·p + (1 − S)·f + T
    const k = 2, ox = 10, oy = 300, S = 0.5, Tx = 7, Ty = -3, fx = 100, fy = 50, x = 40, y = 30;
    const v = liveView(k, ox, oy, S, Tx, Ty, fx, fy);
    expect(x * v.k + v.ox).toBeCloseTo(S * (x * k + ox) + (1 - S) * fx + Tx);
    expect(-y * v.k + v.oy).toBeCloseTo(S * (-y * k + oy) + (1 - S) * fy + Ty);
  });
});

describe("a ceiling of the lines, whatever the scale (k → 0 made millions, #1281)", () => {
  it("k from 44 down to 1e-9 and 0, NaN, an empty screen: never more than MAX_GRID_LINES", () => {
    for (const k of [44, 10, 1, 0.1, 0.01, 1e-3, 1e-4, 1e-6, 1e-9, 0, NaN]) expect(lines(gridPaths(k, vp.w / 2, vp.h / 2, vp.w, vp.h, 8))).toBeLessThanOrEqual(MAX_GRID_LINES);
    expect(lines(gridPaths(1, 0, 0, 0, 0, 8))).toBe(0);
  });
});

describe("the steps: 1 ft at the nearest scale, only coarser outwards (the 1″ / 6″ steps went with #1405, reverted in #1443)", () => {
  it("the steps grow; the cell is the smallest step not finer than minPx; a normal scale has its grid", () => {
    expect(GRID_STEPS_IN[0]).toBe(12);
    for (let i = 1; i < GRID_STEPS_IN.length; i++) expect(GRID_STEPS_IN[i]!).toBeGreaterThan(GRID_STEPS_IN[i - 1]!);
    expect(gridStepIn(2, 24)).toBe(12);
    expect(gridStepIn(1, 24)).toBe(60);
    expect(gridStepIn(1e-6, 24)).toBe(6000);
    expect(lines(gridPaths(2, 0, vp.h, vp.w, vp.h, 24))).toBeGreaterThan(10);
  });
});

describe("speed: the paths are built on the UI thread for every frame of a pinch", () => {
  it("about 100 lines a frame: 1000 frames of a pinch in well under a frame each on this machine", () => {
    let n = 0;
    const t0 = performance.now();
    for (let f = 0; f < 1000; f++) {
      const S = 1 - (f / 1000) * 0.9; // a pinch out from 1 to 0.1
      const v = liveView(4, vp.w / 2, vp.h / 2, S, f % 7, -(f % 5), vp.w / 2, vp.h / 2);
      n = Math.max(n, lines(gridPaths(v.k, v.ox, v.oy, vp.w, vp.h, 8)));
    }
    const perFrame = (performance.now() - t0) / 1000;
    expect(n).toBeGreaterThan(50); // the load is real: up to ~100 lines a frame (minPx 8 on 390×844)
    expect(perFrame).toBeLessThan(2); // a frame is 16 ms; the device's own number is in the PR (the browser here is not a phone)
  });
});

describe("#1434 guard: nothing on the canvas leans on `overflow: visible` of an Svg (iOS clips to the view)", () => {
  const src = (f: string) => readFileSync(join(__dirname, "../src/modules/gutters", f), "utf8");
  it("the painter of the scaled layer has no grid and no overflow; the grid layer is screen-sized and outside the scaled layer", () => {
    const painter = src("canvas/SvgPainter.tsx");
    expect(painter).not.toMatch(/overflow:\s*["']visible["']/);
    expect(painter).not.toMatch(/grid-(minor|major)/);
    const layer = src("canvas/GridLayer.tsx");
    expect(layer).toMatch(/id="grid-minor"/);
    expect(layer).toMatch(/id="grid-major"/);
    expect(layer).toMatch(/<Svg width=\{size\.w\} height=\{size\.h\}/);
    // the canvas draws it in `under` — before the Animated.View that scales — not among the children of the scaled layer
    const canvas = src("canvas/CanvasView.tsx");
    expect(canvas.indexOf("{under}")).toBeGreaterThan(-1);
    expect(canvas.indexOf("{under}")).toBeLessThan(canvas.indexOf("<Animated.View"));
    expect(src("draw/DrawScreen.tsx")).toMatch(/under=\{[^}]*<GridLayer/);
  });
  it("no Svg of the module asks for overflow: visible", () => {
    for (const f of ["canvas/SvgPainter.tsx", "canvas/GridLayer.tsx", "draw/DrawScreen.tsx", "bench/BenchScreen.tsx"]) expect(src(f), f).not.toMatch(/<Svg[^>]*overflow:\s*["']visible["']/);
  });
});
