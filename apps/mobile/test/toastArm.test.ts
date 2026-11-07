import { describe, expect, it } from "vitest";
import { motion } from "@octo/design-tokens";
import { toastArmed } from "../src/ui/toastArm";

describe("toastArmed — «Отменить» ignores the second tap of a double tap", () => {
  const shown = 1_000_000;
  it("a tap right after the toast showed (the second tap of a double tap) is ignored", () => {
    expect(toastArmed(shown, shown)).toBe(false);
    expect(toastArmed(shown, shown + 120)).toBe(false);
    expect(toastArmed(shown, shown + motion.toastArmMs - 1)).toBe(false);
  });
  it("a deliberate tap a moment later undoes", () => {
    expect(toastArmed(shown, shown + motion.toastArmMs)).toBe(true);
    expect(toastArmed(shown, shown + 2_000)).toBe(true);
  });
  it("the arm time is short enough for a deliberate tap and well inside the 5-second toast", () => {
    expect(motion.toastArmMs).toBeGreaterThanOrEqual(250);
    expect(motion.toastArmMs).toBeLessThanOrEqual(500);
    expect(motion.toastArmMs * 10).toBeLessThanOrEqual(motion.toastUndoMs);
  });
});
