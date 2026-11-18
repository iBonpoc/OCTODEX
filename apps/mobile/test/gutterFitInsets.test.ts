/**
 * #1667: «вписать» keeps the drawing out from under what lies over the canvas — the header on top, the toolbar and the
 * summary chips at the bottom, the toolbar at a side; and fitting itself never moves the view after a finger touched it.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { autoFitView, fitView, toScreen, type View } from "../src/modules/gutters/canvas/scene";
import type { P } from "../src/modules/gutters/geometry";

const vp = { w: 390, h: 844 };
const pts: P[] = [[0, 0], [1200, 0], [1200, 600], [0, 600]];
const inside = (v: View, box: { x0: number; y0: number; x1: number; y1: number }) =>
  pts.every((p) => {
    const [x, y] = toScreen(v, p);
    return x >= box.x0 - 1e-6 && x <= box.x1 + 1e-6 && y >= box.y0 - 1e-6 && y <= box.y1 + 1e-6;
  });

describe("fitView with a margin for each side", () => {
  it("a number is the old fit: the same margin on every side", () => {
    expect(fitView(pts, vp, 32)).toEqual(fitView(pts, vp, { t: 32, r: 32, b: 32, l: 32 }));
  });
  it("every point inside the free space; the drawing centred in it", () => {
    const m = { t: 120, r: 32, b: 190, l: 32 };
    const v = fitView(pts, vp, m);
    expect(inside(v, { x0: m.l, y0: m.t, x1: vp.w - m.r, y1: vp.h - m.b })).toBe(true);
    const [cx, cy] = toScreen(v, [600, 300]);
    expect(cx).toBeCloseTo(m.l + (vp.w - m.l - m.r) / 2, 6);
    expect(cy).toBeCloseTo(m.t + (vp.h - m.t - m.b) / 2, 6);
  });
  it("a tall drawing: the bottom margin (toolbar + chips) keeps its lowest point above them", () => {
    const tall: P[] = [[0, 0], [100, 1200]];
    const m = { t: 100, r: 32, b: 200, l: 32 };
    const v = fitView(tall, vp, m);
    const lowest = Math.max(...tall.map((p) => toScreen(v, p)[1]));
    expect(lowest).toBeLessThanOrEqual(vp.h - m.b + 1e-6);
    const old = fitView(tall, vp, 32);
    expect(Math.max(...tall.map((p) => toScreen(old, p)[1]))).toBeGreaterThan(vp.h - m.b); // was under the chips
  });
  it("a toolbar at the left: the drawing starts right of it", () => {
    const m = { t: 100, r: 32, b: 100, l: 90 };
    const v = fitView(pts, vp, m);
    expect(Math.min(...pts.map((p) => toScreen(v, p)[0]))).toBeGreaterThanOrEqual(m.l - 1e-6);
  });
  it("degenerate: one point, no free space — finite numbers", () => {
    for (const v of [fitView([[5, 5]], vp, { t: 0, r: 0, b: 0, l: 0 }), fitView(pts, vp, { t: 500, r: 300, b: 500, l: 300 }), fitView([], vp, 32)]) {
      expect(Number.isFinite(v.k) && v.k > 0 && Number.isFinite(v.ox) && Number.isFinite(v.oy)).toBe(true);
    }
  });
});

describe("autoFitView: the drawing fits itself only until a finger touches (no jump, rule 27)", () => {
  const a: View = { k: 0.3, ox: 10, oy: 400 };
  const b: View = { k: 0.25, ox: 20, oy: 380 };
  it("not touched: follows the new fit (the chips came after the first frame)", () => {
    expect(autoFitView(false, null, a)).toBe(a);
    expect(autoFitView(false, a, b)).toBe(b);
  });
  it("the same fit again: the same view object (no render, no move)", () => {
    expect(autoFitView(false, a, { ...a })).toBe(a);
  });
  it("touched: the view is the person's — never moves by itself, whatever the fit becomes", () => {
    expect(autoFitView(true, a, b)).toBe(a);
  });
  it("no view yet: the first one is the fit even after a touch (the screen is never left empty)", () => {
    expect(autoFitView(true, null, b)).toBe(b);
  });
  it("no fit yet (nothing measured): the view stays", () => {
    expect(autoFitView(false, a, null)).toBe(a);
  });
});
