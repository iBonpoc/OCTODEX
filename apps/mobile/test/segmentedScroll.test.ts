/** Segmented scroll: the selected tab is brought into view («Лиды» №13, долг 1). */
import { describe, expect, it } from "vitest";
import { offsetToShow } from "../src/ui/segmentedScroll";

describe("offsetToShow", () => {
  const view = { w: 300, offset: 0, content: 600 };
  it("a visible tab: no scroll", () => {
    expect(offsetToShow({ x: 20, w: 80 }, view, 12)).toBeNull();
  });
  it("a tab past the right edge: scrolls so it ends inside, with the margin", () => {
    expect(offsetToShow({ x: 500, w: 80 }, view, 12)).toBe(500 + 80 + 12 - 300);
  });
  it("a tab past the left edge: scrolls back to it, never below 0 or past the end", () => {
    expect(offsetToShow({ x: 100, w: 80 }, { ...view, offset: 250 }, 12)).toBe(88);
    expect(offsetToShow({ x: 4, w: 80 }, { ...view, offset: 250 }, 12)).toBe(0);
    expect(offsetToShow({ x: 560, w: 80 }, view, 12)).toBe(300);
  });
  it("no width yet: nothing", () => {
    expect(offsetToShow({ x: 500, w: 80 }, { w: 0, offset: 0, content: 0 }, 12)).toBeNull();
  });
});
