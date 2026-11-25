import { describe, expect, it } from "vitest";
import { motion } from "@octo/design-tokens";
import { tapRule, isDoubleTap } from "../src/modules/gutters/canvas/doubleTap";

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

describe("tapRule — one rule for every tool (#1563, founder 14.11; code-reviewer #1582)", () => {
  const W = 300;
  const tap = (o: Partial<Parameters<typeof tapRule>[0]>) => tapRule({ tool: "line", onDs: false, lift: false, key: "", id: null, last: null, now: 1000, windowMs: W, ...o });
  it("«Водосток», ONE tap on a downspout: picks it — no properties (it opened them at once before)", () => {
    const r = tap({ tool: "ds", onDs: true, key: "d1", id: "d1" });
    expect(r.act).toEqual({ do: "pick", id: "d1" });
    expect(r.last).toEqual({ at: 1000, id: "d1" });
  });
  it("«Водосток», TWO taps on the same downspout: its properties — the same as «Желоб»", () => {
    const first = tap({ tool: "ds", onDs: true, key: "d1", id: "d1" });
    const second = tap({ tool: "ds", onDs: true, key: "d1", id: "d1", last: first.last, now: 1200 });
    expect(second.act).toEqual({ do: "open", id: "d1" });
    expect(second.last).toBeNull();
    const line = tap({ tool: "line", onDs: true, key: "d1", id: "d1", last: tap({ tool: "line", onDs: true, key: "d1", id: "d1" }).last, now: 1200 });
    expect(line.act).toEqual(second.act);
  });
  it("taps on two DIFFERENT downspouts in the window: not a double tap (each is picked)", () => {
    const a = tap({ tool: "ds", onDs: true, key: "d1", id: "d1" });
    const b = tap({ tool: "ds", onDs: true, key: "d2", id: "d2", last: a.last, now: 1100 });
    expect(b.act).toEqual({ do: "pick", id: "d2" });
  });
  it("a placement clears the last tap: a tap made before it never becomes the first of two with the next one", () => {
    const a = tap({ tool: "ds", onDs: true, key: "d1", id: "d1" }); // d1 picked
    const put = tap({ tool: "ds", onDs: false, key: "run1", id: "run1", last: a.last, now: 1050 }); // a downspout put on a gutter
    expect(put.act).toEqual({ do: "place" });
    expect(put.last).toBeNull();
    const again = tap({ tool: "ds", onDs: true, key: "d1", id: "d1", last: put.last, now: 1100 }); // d1 again, inside the window
    expect(again.act).toEqual({ do: "pick", id: "d1" }); // a first tap: picked, not opened — and not lost
  });
  it("«Водосток» on a gutter or the empty place puts a downspout (its menu is not opened by itself)", () => {
    expect(tap({ tool: "ds", key: "run1", id: "run1" }).act).toEqual({ do: "place" });
    expect(tap({ tool: "ds" }).act).toEqual({ do: "place" });
  });
  it("the lift of a drag: with «Водосток» nothing (as before); with «Желоб» it picks and is never the first of two", () => {
    expect(tap({ tool: "ds", onDs: true, lift: true, key: "d1", id: "d1" }).act).toEqual({ do: "ignore" });
    expect(tap({ tool: "ds", lift: true, key: "run1", id: "run1" }).act).toEqual({ do: "ignore" });
    const lift = tap({ tool: "line", lift: true, key: "run1", id: "run1", last: { at: 990, id: "run1" } });
    expect(lift.act).toEqual({ do: "pick", id: "run1" });
    expect(lift.last).toBeNull();
  });
  it("two taps on the empty place: «Желоб» — the whole drawing; «Водосток» never gets there (it puts)", () => {
    const first = tap({});
    expect(first.act).toEqual({ do: "pick", id: null });
    expect(tap({ last: first.last, now: 1100 }).act).toEqual({ do: "fit" });
  });
  it("too slow: two single taps", () => {
    const first = tap({ key: "run1", id: "run1" });
    expect(tap({ key: "run1", id: "run1", last: first.last, now: 1000 + W + 1 }).act).toEqual({ do: "pick", id: "run1" });
  });
});
