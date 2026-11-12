import { describe, expect, it } from "vitest";
import { exitDuration, scrimLevel, swipeCloses, swipeStart, swipeStep, type SwipeState } from "../src/ui/sheetSwipe";

/** #714 (#505 on iPhone): a swipe down on a sheet's body — the list first, then the sheet. */
const run = (moves: [number, number][]) => {
  let s: SwipeState = { base: null };
  let drag = 0;
  for (const [top, travel] of moves) ({ state: s, drag } = swipeStep(s, top, travel));
  return drag;
};

describe("swipe down on the body of a sheet", () => {
  it("the list at its top: the sheet follows the finger from the start", () => {
    expect(run([[0, 0], [0, 40], [0, 150]])).toBe(150);
  });
  it("the list scrolled down: the finger scrolls it first, the sheet stays", () => {
    expect(run([[120, 0], [80, 40], [30, 90]])).toBe(0);
  });
  it("one stroke: the list reaches its top, then the sheet follows from there", () => {
    expect(run([[60, 0], [20, 40], [0, 60], [0, 200]])).toBe(140);
  });
  it("upward never moves the sheet", () => {
    expect(run([[0, 0], [0, -80]])).toBe(0);
  });
  it("let go: far or fast closes; a short slow one springs back; not moved never closes", () => {
    expect(swipeCloses(130, 0, 120, 0.8)).toBe(true);
    expect(swipeCloses(30, 1.2, 120, 0.8)).toBe(true);
    expect(swipeCloses(30, 0.2, 120, 0.8)).toBe(false);
    expect(swipeCloses(0, 3, 120, 0.8)).toBe(false);
  });
});

describe("when a finger on the body becomes the swipe", () => {
  it("down past the slop, mostly down → the swipe", () => {
    expect(swipeStart(2, 12, 10, false)).toBe("activate");
  });
  it("a child holding the finger (the tape, a signature) → never, however far down", () => {
    expect(swipeStart(0, 200, 10, true)).toBe("fail");
  });
  it("sideways → never (a slider, the tape)", () => {
    expect(swipeStart(30, 8, 10, false)).toBe("fail");
    expect(swipeStart(-30, 20, 10, false)).toBe("fail");
  });
  it("up, or not far yet → wait (an upward drag is the list's scroll)", () => {
    expect(swipeStart(0, -40, 10, false)).toBe("wait");
    expect(swipeStart(1, 6, 10, false)).toBe("wait");
  });
});

describe("how the sheet leaves (#1163, DS Б1)", () => {
  it("at the finger's speed: the way left ÷ the speed, never quicker than durFast nor slower than durSlow", () => {
    expect(exitDuration(400, 2, 160, 350, 220)).toBe(200);
    expect(exitDuration(400, 10, 160, 350, 220)).toBe(160);
    expect(exitDuration(400, 0.5, 160, 350, 220)).toBe(350);
  });
  it("no speed (✕, the scrim, Esc): the resting time", () => {
    expect(exitDuration(400, 0, 160, 350, 220)).toBe(220);
    expect(exitDuration(400, -1, 160, 350, 220)).toBe(220);
  });
  it("the scrim follows the sheet: full in place, gone when it has left, never outside 0..1", () => {
    expect(scrimLevel(0, 500)).toBe(1);
    expect(scrimLevel(250, 500)).toBe(0.5);
    expect(scrimLevel(500, 500)).toBe(0);
    expect(scrimLevel(900, 500)).toBe(0);
    expect(scrimLevel(-30, 500)).toBe(1);
    expect(scrimLevel(10, 0)).toBe(1);
  });
  it("the share of the height decides: 40 % of a tall sheet is far, of a short one is near", () => {
    expect(swipeCloses(0.4 * 700 + 1, 0, 0.4 * 700, 0.8)).toBe(true);
    expect(swipeCloses(0.4 * 300 + 1, 0, 0.4 * 300, 0.8)).toBe(true);
    expect(swipeCloses(0.4 * 700 - 1, 0.3, 0.4 * 700, 0.8)).toBe(false);
  });
});
