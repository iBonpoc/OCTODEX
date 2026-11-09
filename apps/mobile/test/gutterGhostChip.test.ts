import { describe, expect, it } from "vitest";
import { ghostChipAt } from "../src/modules/gutters/draw/ghostChip";

const chip = { w: 60, h: 24 };
const box = { w: 390, h: 844, top: 120 };
const centre = (r: { left: number; top: number }) => [r.left + chip.w / 2, r.top + chip.h / 2] as const;

describe("the live length of a stroke (#689)", () => {
  it("a level stroke: at its middle, just above the line — not at the top of the screen", () => {
    const r = ghostChipAt([40, 400], [240, 400], chip, box, 4);
    const [x, y] = centre(r);
    expect(x).toBe(140);
    expect(y).toBe(400 - 12 - 4);
    expect(r.top + chip.h).toBeLessThanOrEqual(400);
  });
  it("drawn right to left — still above", () => {
    const [, y] = centre(ghostChipAt([240, 400], [40, 400], chip, box, 4));
    expect(y).toBeLessThan(400);
  });
  it("an upright stroke: beside it (to the left), not on it", () => {
    const r = ghostChipAt([200, 300], [200, 500], chip, box, 4);
    expect(r.left + chip.w).toBeLessThanOrEqual(200);
    expect(centre(r)[1]).toBe(400);
  });
  it("a slanted stroke: off the line by more than half the chip", () => {
    const a = [100, 500] as const, b = [300, 300] as const;
    const [x, y] = centre(ghostChipAt(a, b, chip, box, 4));
    // distance from the line through a, b
    const d = Math.abs((b[0] - a[0]) * (a[1] - y) - (a[0] - x) * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    expect(d).toBeGreaterThan(chip.h / 2);
  });
  it("stays inside the canvas and below the top bar", () => {
    const r = ghostChipAt([0, 125], [30, 125], chip, box, 4);
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.top).toBeGreaterThanOrEqual(box.top);
    const e = ghostChipAt([370, 840], [389, 843], chip, box, 4);
    expect(e.left + chip.w).toBeLessThanOrEqual(box.w);
    expect(e.top + chip.h).toBeLessThanOrEqual(box.h);
  });
  it("a dot (no length yet): straight above it", () => {
    const [x, y] = centre(ghostChipAt([200, 400], [200, 400], chip, box, 4));
    expect(x).toBe(200);
    expect(y).toBeLessThan(400);
  });
});
