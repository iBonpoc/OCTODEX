/**
 * #1271 (founder 12.11: «щипком приблизил с 1% до 100%, отпустил — откатилось примерно до 80%»). The live transform of the canvas's two
 * gestures as pure steps (canvas/gestureState.ts). The old logic is written out below as `legacy`: it shows the cause — the late
 * frames of the lift (one finger left, the span jumps, `scaleChange` < 1) multiplied the scale, and the pan's end committed a second
 * time. The new rule: only two-finger frames count, the first end commits and closes the gesture.
 */
import { describe, expect, it } from "vitest";
import { beginGesture, endGesture, idleState, panStep, pinchStep } from "../src/modules/gutters/canvas/gestureState";

/** a pinch of N frames, ×1.5 each (two fingers), then the fingers lift: late frames with ONE pointer, the span collapsing */
const pinchFrames = (n: number) => Array.from({ length: n }, () => ({ scaleChange: 1.5, numberOfPointers: 2 }));
const LIFT = [{ scaleChange: 0.8, numberOfPointers: 1 }, { scaleChange: 0.5, numberOfPointers: 1 }];
const PAN2 = { changeX: 3, changeY: -2, numberOfPointers: 2 };
const PAN1 = { changeX: 40, changeY: 25, numberOfPointers: 1 }; // the focal point jumps to the finger left

describe("the old logic (the cause)", () => {
  it("legacy: every scaleChange multiplies, both gestures commit at their end → the commit is not what was under the fingers", () => {
    let s = 1;
    for (const f of [...pinchFrames(6), ...LIFT]) s *= f.scaleChange;
    const underFingers = 1.5 ** 6;
    expect(s).toBeCloseTo(underFingers * 0.8 * 0.5, 6); // the lift took 60 % away
    expect(s).toBeLessThan(underFingers * 0.5);
  });
});

describe("the new steps", () => {
  it("only frames with TWO pointers count: the scale committed is exactly the one of the last two-finger frame", () => {
    const st = idleState();
    beginGesture(st);
    for (const f of [...pinchFrames(6), ...LIFT]) pinchStep(st, f);
    expect(st.s).toBeCloseTo(1.5 ** 6, 9);
    expect(endGesture(st)).toBe(true);
    expect(st.s).toBeCloseTo(1.5 ** 6, 9);
  });
  it("one commit per gesture: the second end (pan and pinch both end) commits nothing, and late frames after the first end are ignored", () => {
    const st = idleState();
    beginGesture(st);
    for (const f of pinchFrames(3)) pinchStep(st, f);
    expect(endGesture(st)).toBe(true); // the pinch ends first and commits
    pinchStep(st, { scaleChange: 0.8, numberOfPointers: 2 }); // a late frame
    panStep(st, PAN2);
    expect(st.s).toBeCloseTo(1.5 ** 3, 9);
    expect(st.tx).toBe(0);
    expect(endGesture(st)).toBe(false); // the pan ends after it: nothing
  });
  it("a new touch starts again: after the end the next gesture counts from the next begin", () => {
    const st = idleState();
    beginGesture(st);
    pinchStep(st, { scaleChange: 2, numberOfPointers: 2 });
    endGesture(st);
    // the canvas drops the live transform after the commit (CanvasView's layout effect)
    st.tx = 0; st.ty = 0; st.s = 1;
    pinchStep(st, { scaleChange: 2, numberOfPointers: 2 }); // before a begin: ignored
    expect(st.s).toBe(1);
    beginGesture(st);
    pinchStep(st, { scaleChange: 2, numberOfPointers: 2 });
    expect(st.s).toBe(2);
    expect(endGesture(st)).toBe(true);
  });
  it("after a pinch the pan counts only two-finger frames (the lift moves the focal point); a pan alone counts one finger", () => {
    const st = idleState();
    beginGesture(st);
    pinchStep(st, { scaleChange: 2, numberOfPointers: 2 });
    panStep(st, PAN2);
    panStep(st, PAN1);
    expect([st.tx, st.ty]).toEqual([3, -2]);
    const alone = idleState();
    beginGesture(alone);
    panStep(alone, PAN1);
    expect([alone.tx, alone.ty]).toEqual([40, 25]);
  });
  it("nothing moved → no commit; an end without a begin → no commit", () => {
    const st = idleState();
    beginGesture(st);
    expect(endGesture(st)).toBe(false);
    expect(endGesture(idleState())).toBe(false);
  });
  it("1% → 100% (a ×100 zoom in several pinches): every commit is exactly what the two-finger frames made", () => {
    let total = 1;
    for (let g = 0; g < 4; g++) {
      const st = idleState();
      beginGesture(st);
      for (const f of [...pinchFrames(3), ...LIFT]) pinchStep(st, f);
      expect(endGesture(st)).toBe(true);
      total *= st.s;
    }
    expect(total).toBeCloseTo(1.5 ** 12, 6);
  });
});
