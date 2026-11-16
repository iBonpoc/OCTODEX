import { describe, expect, it } from "vitest";
import { size, space } from "@octo/design-tokens";
import { scrollBottom, toastBottom, toastLane, wideToastBottom } from "../src/ui/footerInset";

describe("the toast lane from 820 (DS §15.2, #1701) — the end of the page scrolls out from under the toast", () => {
  it("the lane is the toast's place + a one-line toast + a gap above it", () => {
    expect(toastLane(0)).toBe(space[6] + size.hitMin + space[3]);
    expect(toastLane(34)).toBe(34 + space[6] + size.hitMin + space[3]);
  });
  it("the top of a one-line toast stands below the lane: the last block scrolled to the end is not under it", () => {
    for (const inset of [0, 20, 34]) expect(wideToastBottom(inset) + size.hitMin).toBeLessThan(toastLane(inset));
  });
  it("wide: the scroll keeps at least the lane (was: the window's bottom + space[6] — right where the toast stands)", () => {
    const own = 34 + space[6];
    expect(scrollBottom(own, true, 34)).toBe(toastLane(34));
    expect(scrollBottom(own, true, 34)).toBeGreaterThan(wideToastBottom(34) + size.hitMin);
  });
  it("wide: a screen that needs more (a floating «＋») keeps its own", () => {
    expect(scrollBottom(toastLane(0) + 50, true, 0)).toBe(toastLane(0) + 50);
  });
  it("a phone keeps the screen's own bottom (tab bar, pinned bar): the lane is for wide screens only", () => {
    expect(scrollBottom(40, false, 34)).toBe(40);
  });
  it("above the pinned bar on a phone, as before (#1277)", () => {
    expect(toastBottom(100, 0, space[3])).toBe(100);
    expect(toastBottom(100, 120, space[3])).toBe(120 + space[3]);
  });
});
