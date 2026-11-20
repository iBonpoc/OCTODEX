import { describe, expect, it } from "vitest";
import { stickyShift } from "../src/ui/stickyTop";

/** the stuck strip of a Screen stands below the status bar (the audit's iPhone simulator, #2302): rule 27 (а) */
describe("stickyShift", () => {
  it("stuck on an iPhone: moved down by the safe-area top, not left under the clock", () => {
    expect(stickyShift(true, 47)).toBe(47);
    expect(stickyShift(true, 59)).toBe(59);
  });
  it("not stuck: in its place, no shift (the page does not jump)", () => {
    expect(stickyShift(false, 47)).toBe(0);
  });
  it("no safe area (the web, a tablet without a notch): no shift", () => {
    expect(stickyShift(true, 0)).toBe(0);
    expect(stickyShift(true, -3)).toBe(0);
  });
});
