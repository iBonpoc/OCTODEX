/**
 * #2375 (founder 22.11 after TestFlight: «перетаскивание срабатывает моментально… случайно провожу по экрану — хватаю позицию»;
 * 21.11 q3: «зажал ~0,5 с и тянешь»): an estimate line is taken by a FINGER only after a hold of `gesture.sortHoldMs` 500 — by its
 * body AND by its «⠿» (the handles stand at the right edge, where the thumb scrolls); a mouse still starts by a move of `dragStart`.
 * The dispatch board (dnd.tsx) keeps `dragHoldMs` 230.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
import { gesture } from "@octo/design-tokens";
import { holdConfig, sortHandleConfig, sortHoldConfig } from "../src/ui/pointer";

describe("unit:sortHold (#2375)", () => {
  it("the estimate's hold is 0.5 s; the board keeps its own", () => {
    expect(gesture.sortHoldMs).toBe(500);
    expect(gesture.dragHoldMs).toBe(230);
    expect(holdConfig(false)).toEqual({ activateAfterLongPress: gesture.dragHoldMs });
  });
  it("a finger: the row's body and its handle both wait for the hold — a swipe never takes a line", () => {
    expect(sortHoldConfig(false)).toEqual({ activateAfterLongPress: 500 });
    expect(sortHandleConfig(false)).toEqual({ activateAfterLongPress: 500 });
  });
  it("a mouse or a pen: a move of dragStart, as before", () => {
    expect(sortHoldConfig(true)).toEqual({ minDistance: gesture.dragStart });
    expect(sortHandleConfig(true)).toEqual({ minDistance: gesture.dragStart });
  });
});
