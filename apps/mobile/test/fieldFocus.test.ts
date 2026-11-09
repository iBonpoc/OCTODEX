import { describe, expect, it } from "vitest";
import { motion } from "@octo/design-tokens";
import { focusPlan } from "../src/ui/fieldFocus";

// #691 (founder 09.11): the length sheet opened on an iPhone without the number selected. Before: the input's own
// autoFocus on every platform (lost while the sheet slides in) and no selection by hand.
describe("a field that opens in a sheet takes the focus (#691)", () => {
  it("iOS / Android: no own autoFocus — focus once the sheet is up, select all by hand", () => {
    for (const os of ["ios", "android"]) {
      expect(focusPlan(os, { autoFocus: true, selectOnFocus: true })).toEqual({ autoFocus: false, focusAfterMs: motion.durSlow, selectByHand: true });
    }
  });
  it("the web: the input's own autoFocus and select on focus (they work there)", () => {
    expect(focusPlan("web", { autoFocus: true, selectOnFocus: true })).toEqual({ autoFocus: true, focusAfterMs: null, selectByHand: false });
  });
  it("read-only or no autoFocus: no focus", () => {
    expect(focusPlan("ios", { autoFocus: true, readOnly: true }).focusAfterMs).toBeNull();
    expect(focusPlan("ios", {}).focusAfterMs).toBeNull();
    expect(focusPlan("ios", { selectOnFocus: true }).selectByHand).toBe(true);
  });
});
