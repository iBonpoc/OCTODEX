// The math of the shared row swipe (src/ui/swipeRowLogic.ts, #2350, DS Б13 п.2): the web cannot swipe, so the numbers are
// proved here (rule 27а) — each line on it and one pixel short.
import { describe, expect, it } from "vitest";
import { component, gesture } from "@octo/design-tokens";
import { armBuzz, armedAt, createSwipeGroup, fullAt, openThreshold, screenOrder, sideOf, type SwipeGeom } from "../src/ui/swipeRowLogic";

const W = 390;
const g = (o: Partial<SwipeGeom> = {}): SwipeGeom => ({
  rowW: W,
  btnW: component.swipeAction.w,
  full: component.swipeAction.full,
  nLeft: 1,
  nRight: 1,
  fullLeft: true,
  hysteresis: gesture.swipeFullHysteresis,
  ...o,
});

describe("row swipe: sides", () => {
  it("right shows the left actions, left the right ones; none toward an empty side or at rest", () => {
    expect(sideOf(5, g())).toBe("left");
    expect(sideOf(-5, g())).toBe("right");
    expect(sideOf(0, g())).toBeNull();
    expect(sideOf(5, g({ nLeft: 0 }))).toBeNull();
    expect(sideOf(-5, g({ nRight: 0 }))).toBeNull();
  });
  it("the buttons stay open past half a button", () => {
    expect(openThreshold(component.swipeAction.w)).toBe(component.swipeAction.w / 2);
  });
});

describe("row swipe: the full-swipe line", () => {
  it("is 0.6 of the row", () => {
    expect(fullAt(g(), "left")).toBeCloseTo(W * 0.6);
  });
  it("never before all the buttons are out and half a button more (a narrow row, many buttons)", () => {
    expect(fullAt(g({ rowW: 200, nLeft: 2 }), "left")).toBe(2.5 * component.swipeAction.w);
  });
  it("not measured yet — no full swipe", () => {
    expect(fullAt(g({ rowW: 0 }), "left")).toBe(Infinity);
    expect(armedAt(1000, g({ rowW: 0 }))).toBeNull();
  });
  it("arms on the line and not one pixel short", () => {
    const line = fullAt(g(), "left");
    expect(armedAt(line, g())).toBe("left");
    expect(armedAt(line - 1, g())).toBeNull();
  });
  it("once armed, holds until `hysteresis` back inside the line (no flicker), then lets go", () => {
    const line = fullAt(g(), "left");
    expect(armedAt(line - gesture.swipeFullHysteresis, g(), true)).toBe("left");
    expect(armedAt(line - gesture.swipeFullHysteresis - 1, g(), true)).toBeNull();
  });
  it("only to the right and only for a reversible action (DS Б13 п.2): to the left never, a not-full action never", () => {
    expect(armedAt(-W, g())).toBeNull();
    expect(armedAt(W, g({ fullLeft: false }))).toBeNull();
    expect(armedAt(W, g({ nLeft: 0 }))).toBeNull();
  });
});

describe("row swipe: vibration and order", () => {
  it("`light` once on arming; going back and staying are silent", () => {
    expect(armBuzz(null, "left")).toBe(true);
    expect(armBuzz("left", "left")).toBe(false);
    expect(armBuzz("left", null)).toBe(false);
    expect(armBuzz(null, null)).toBe(false);
  });
  it("the first action stands at the outer edge", () => {
    expect(screenOrder(["a", "b"], "left")).toEqual(["a", "b"]);
    expect(screenOrder(["a", "b"], "right")).toEqual(["b", "a"]);
  });
  it("one row open at a time: opening another closes the first; closing the open one forgets it", () => {
    const s = createSwipeGroup();
    let closedA = 0;
    const a = { close: () => closedA++ };
    const b = { close: () => undefined };
    s.opened(a);
    s.opened(a);
    expect(closedA).toBe(0);
    s.opened(b);
    expect(closedA).toBe(1);
    s.closed(b);
    s.opened(a);
    expect(closedA).toBe(1);
  });
});
