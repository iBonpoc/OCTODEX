import { describe, expect, it } from "vitest";
import { HINT_ESTIMATES, HINT_LEFT, HINT_RIGHT, NO_HINTS_YET, parseSwipeHint, swipeHintDue } from "../src/features/estimate/swipeHint";

describe("unit:swipeHint — the swipe hint of the first estimates (DS §8.11, #1307 б)", () => {
  it("the numbers of the DS: left 1.4 buttons, right 0.8, three estimates", () => {
    expect([HINT_LEFT, HINT_RIGHT, HINT_ESTIMATES]).toEqual([1.4, 0.8, 3]);
  });
  it("plays in the first three estimates on the device", () => {
    expect(swipeHintDue({ shown: 0, swiped: false }, false)).toBe(true);
    expect(swipeHintDue({ shown: 2, swiped: false }, false)).toBe(true);
    expect(swipeHintDue({ shown: 3, swiped: false }, false)).toBe(false);
  });
  it("never once the person has swiped a line, never under «уменьшить движение»", () => {
    expect(swipeHintDue({ shown: 0, swiped: true }, false)).toBe(false);
    expect(swipeHintDue({ shown: 0, swiped: false }, true)).toBe(false);
  });
  it("what the device keeps: read safely (nothing, garbage, a bad count)", () => {
    expect(parseSwipeHint(null)).toEqual(NO_HINTS_YET);
    expect(parseSwipeHint("garbage")).toEqual(NO_HINTS_YET);
    expect(parseSwipeHint('{"shown":2,"swiped":true}')).toEqual({ shown: 2, swiped: true });
    expect(parseSwipeHint('{"shown":-4}')).toEqual({ shown: 0, swiped: false });
    expect(parseSwipeHint('{"shown":"x","swiped":"yes"}')).toEqual({ shown: 0, swiped: false });
  });
});
