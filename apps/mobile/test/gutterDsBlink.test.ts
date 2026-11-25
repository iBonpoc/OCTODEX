import { describe, expect, it } from "vitest";
import { motion } from "@octo/design-tokens";
import { blinkPlan, dimAt } from "../src/modules/gutters/canvas/dsBlink";

// #1763 (founder 16.11): a new downspout blinks, THEN its sheet opens — about half a second
describe("a new downspout: the blink, then the sheet", () => {
  it("the sheet opens after the last beat, never during the blink", () => {
    const p = blinkPlan(false);
    expect(p.steps).toBeGreaterThan(0);
    expect(p.sheetAtMs).toBe(p.steps * p.stepMs);
    for (let i = 0; i < p.steps; i++) expect(i * p.stepMs).toBeLessThan(p.sheetAtMs);
  });
  it("about half a second, from the tokens (motion.blinkSteps × motion.blinkStepMs)", () => {
    const p = blinkPlan(false);
    expect(p.sheetAtMs).toBe(motion.blinkSteps * motion.blinkStepMs);
    expect(p.sheetAtMs).toBeGreaterThanOrEqual(400);
    expect(p.sheetAtMs).toBeLessThanOrEqual(700);
  });
  it("the mark ends shown: an even count of beats, off first", () => {
    expect(blinkPlan(false, 3, 100)).toEqual({ steps: 4, stepMs: 100, sheetAtMs: 400 });
    const p = blinkPlan(false);
    expect(p.steps % 2).toBe(0);
    expect(dimAt(0)).toBe(true);
    expect(dimAt(p.steps - 1)).toBe(false);
  });
  it("reduce motion: no blink, the sheet at once", () => {
    expect(blinkPlan(true)).toEqual({ steps: 0, stepMs: 0, sheetAtMs: 0 });
  });
});
