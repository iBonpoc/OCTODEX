import { describe, expect, it } from "vitest";
import { motion } from "@octo/design-tokens";
import { isDoubleTap } from "../src/modules/gutters/canvas/gestureState";

/** #1273: a double tap = a second tap on the SAME object within motion.doubleTapMs */
describe("isDoubleTap", () => {
  const W = motion.doubleTapMs;
  it("the window is 300 ms (the toast's arm time)", () => expect(W).toBe(300));
  it("a second tap on the same object inside the window is a double tap", () => expect(isDoubleTap({ at: 1000, id: "a" }, 1000 + W, "a", W)).toBe(true));
  it("outside the window it is a first tap", () => expect(isDoubleTap({ at: 1000, id: "a" }, 1000 + W + 1, "a", W)).toBe(false));
  it("another object is a first tap", () => expect(isDoubleTap({ at: 1000, id: "a" }, 1100, "b", W)).toBe(false));
  it("no previous tap (a pinch since, or the first) is a first tap", () => expect(isDoubleTap(null, 1100, "a", W)).toBe(false));
  it("the empty place counts as one object (two taps on empty = double)", () => expect(isDoubleTap({ at: 1000, id: "" }, 1200, "", W)).toBe(true));
  it("a clock that went back is not a double tap", () => expect(isDoubleTap({ at: 1000, id: "a" }, 900, "a", W)).toBe(false));
});
