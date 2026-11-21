import { describe, expect, it } from "vitest";
import { glideBack, stickyShift } from "../src/ui/stickyTop";

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

/** the founder on the build of #2302: «пролистал до середины, потом бах — перемотала всё назад» — the page wound itself back */
describe("glideBack: the page glides back to the tabs only when the tab changed", () => {
  it("the tab changed and the page is scrolled past the tabs: glide back", () => {
    expect(glideBack("a", "b", true, 800, 200)).toBe(true);
  });
  it("the SAME tab key (the screen re-rendered, its `tabs` element is a new object): the page stays where the person put it", () => {
    expect(glideBack("a", "a", true, 6399, 200)).toBe(false);
    expect(glideBack(undefined, undefined, true, 6399, 200)).toBe(false);
  });
  it("the tab changed but the page is above the tabs, or there are no tabs: nothing to glide", () => {
    expect(glideBack("a", "b", true, 100, 200)).toBe(false);
    expect(glideBack("a", "b", false, 800, 200)).toBe(false);
  });
});
