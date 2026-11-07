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

describe("fullCanvas in the safe area (docs/specs/32)", () => {
  const bar = 56 + 8; // the buttons and the gap above them
  /** the block (canvas + bar) as the screen shows it, centred inside the padding: its edges on the window */
  const shown = (winW: number, winH: number, c: ReturnType<typeof fullCanvas>) => {
    const bw = c.rotate ? c.h + bar : c.w;
    const bh = c.rotate ? c.w : c.h + bar;
    const x = c.pad.left + (winW - c.pad.left - c.pad.right - bw) / 2;
    const y = c.pad.top + (winH - c.pad.top - c.pad.bottom - bh) / 2;
    return { left: x, right: x + bw, top: y, bottom: y + bh };
  };
  it("an iPhone in portrait (59 top / 34 bottom): the turned canvas stays under the Dynamic Island and above the home indicator", () => {
    const ins = { top: 59, bottom: 34, left: 0, right: 0 };
    const c = fullCanvas(390, 844, 358, 160, 16, bar, ins);
    expect(c.pad).toEqual({ top: 59, bottom: 34, left: 16, right: 16 });
    const b = shown(390, 844, c);
    expect(b.top).toBeGreaterThanOrEqual(59);
    expect(b.bottom).toBeLessThanOrEqual(844 - 34);
    expect(b.left).toBeGreaterThanOrEqual(16);
    expect(b.right).toBeLessThanOrEqual(390 - 16);
    // before: the canvas ran 16…828, under the island and the home indicator
    expect(c.w).toBeLessThanOrEqual(844 - 59 - 34);
  });
  it("an iPhone in landscape (59 left / 59 right / 21 bottom): canvas and «Отмена / Готово» clear of the notch", () => {
    const ins = { top: 0, bottom: 21, left: 59, right: 59 };
    const c = fullCanvas(844, 390, 358, 160, 16, bar, ins);
    expect(c.rotate).toBe(false);
    const b = shown(844, 390, c);
    expect(b.left).toBeGreaterThanOrEqual(59);
    expect(b.right).toBeLessThanOrEqual(844 - 59);
    expect(b.top).toBeGreaterThanOrEqual(16);
    expect(b.bottom).toBeLessThanOrEqual(390 - 21);
    expect(c.w / c.h).toBeCloseTo(358 / 160, 1);
  });
  it("no insets (Android with buttons, a desktop window): the same as before — 16 on every side", () => {
    expect(fullCanvas(390, 844, 358, 160, 16, bar)).toEqual(fullCanvas(390, 844, 358, 160, 16, bar, { top: 0, bottom: 0, left: 0, right: 0 }));
    expect(fullCanvas(390, 844, 358, 160, 16, bar).pad).toEqual({ top: 16, bottom: 16, left: 16, right: 16 });
  });
  it("a window too small never gives a negative canvas", () => {
    const c = fullCanvas(100, 60, 358, 160, 16, bar, { top: 30, bottom: 30, left: 0, right: 0 });
    expect(c.w).toBeGreaterThanOrEqual(0);
    expect(c.h).toBeGreaterThanOrEqual(0);
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
