/** Spec 29: the full-screen signature — the canvas size and the finger → canvas point under a 90° turn. */
import { describe, expect, it } from "vitest";
import { fullCanvas, turnedToCanvas, uprightToCanvas } from "../src/features/signatureCanvas";
import { normalizeSignature, scale } from "../src/features/signaturePath";

describe("fullCanvas", () => {
  it("a portrait phone (390 × 844): the canvas is turned and runs along the long side, field proportions kept", () => {
    const c = fullCanvas(390, 844, 358, 160, 16, 56);
    expect(c.rotate).toBe(true);
    expect(c.w).toBeGreaterThan(358 * 1.4); // much longer than the field on the screen
    expect(c.w).toBeLessThanOrEqual(844 - 32);
    expect(c.h).toBeLessThanOrEqual(390 - 32 - 56);
    expect(c.w / c.h).toBeCloseTo(358 / 160, 1);
  });
  it("the phone turned to landscape (844 × 390): the window is wide, nothing is rotated", () => {
    const c = fullCanvas(844, 390, 358, 160, 16, 56);
    expect(c.rotate).toBe(false);
    expect(c.w).toBeLessThanOrEqual(844 - 32);
  });
});

describe("finger → canvas", () => {
  const box = { x: 40, y: 100 };
  const ch = 300;
  it("the turned canvas: every canvas point shown on screen maps back to itself", () => {
    for (const [x, y] of [[0, 0], [10, 20], [600, 299], [333, 150]]) {
      const screen = { px: box.x + ch - y, py: box.y + x }; // where the 90° clockwise turn shows (x, y)
      expect(turnedToCanvas(screen.px, screen.py, box, ch)).toEqual({ x, y });
    }
  });
  it("a stroke down the phone (portrait) draws along the canvas", () => {
    const a = turnedToCanvas(box.x + 150, box.y + 10, box, ch);
    const b = turnedToCanvas(box.x + 150, box.y + 500, box, ch);
    expect(b.x - a.x).toBe(490);
    expect(b.y).toBe(a.y);
  });
  it("the upright canvas: page minus the box corner", () => {
    expect(uprightToCanvas(140, 230, box)).toEqual({ x: 100, y: 130 });
  });
});

describe("the stroke goes to full screen and back unchanged in shape", () => {
  it("scaled up by the canvas factor and back down: the same points (to 0.01 px), then saved in the 400 × 160 box", () => {
    const field = "M10 20 L300 140 ";
    const k = 812 / 358;
    const back = scale(scale(field, k), 1 / k);
    const a = field.match(/[\d.]+/g)!.map(Number), b = back.match(/[\d.]+/g)!.map(Number);
    b.forEach((v, i) => expect(v).toBeCloseTo(a[i]!, 1));
    expect(normalizeSignature(back, 358, 160)).toBe(back); // a phone field fits the box: kept as drawn
  });
});
