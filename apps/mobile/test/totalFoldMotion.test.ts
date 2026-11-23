/**
 * #2405 (founder 22.11 after TestFlight: «полоса внизу коллапсирует без анимации, просто прыгает — нужна хоть минимальная анимация»):
 * the bar's fold and unfold are moved, never jumped — the capsule slides in from the right edge growing from `foldScale`, the card
 * comes up by `foldShift` with its fade, the one going fades out in `durFast`; reduced motion — no movement (a cut, as the system asks).
 * The bar's height never changes (`figureRow.h + cardGap`) — the page's end stays put. Math only (the native — the founder on iPhone).
 */
import { describe, expect, it } from "vitest";
import { motion } from "@octo/design-tokens";
import { foldMotion } from "../src/ui/mainStepRules";

describe("unit:foldMotion (#2405)", () => {
  it("the capsule: from the right, a little smaller, in durBase; the card: up by foldShift, in durBase; the going one: durFast", () => {
    const m = foldMotion(false)!;
    expect(m.capsule).toEqual({ from: { opacity: 0, x: motion.foldShift, scale: motion.foldScale }, ms: motion.durBase });
    expect(m.card).toEqual({ from: { opacity: 0, y: motion.foldShift, scale: 1 }, ms: motion.durBase });
    expect(m.outMs).toBe(motion.durFast);
  });
  it("small steps: a shift of a few points, a scale just under 1 (no fly-in across the screen)", () => {
    expect(motion.foldShift).toBeGreaterThan(0);
    expect(motion.foldShift).toBeLessThanOrEqual(16);
    expect(motion.foldScale).toBeGreaterThan(0.85);
    expect(motion.foldScale).toBeLessThan(1);
  });
  it("reduced motion: none — the swap is a cut", () => {
    expect(foldMotion(true)).toBeNull();
  });
});
