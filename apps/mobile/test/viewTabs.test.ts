import { describe, expect, it } from "vitest";
import { component, space } from "@octo/design-tokens";
import { centerOffset, fadedEdges, nudgeDistance } from "../src/ui/viewTabsLogic";

// DS §9 А1п (#1343): the row of view tabs — the selected pill to the middle, the edges that fade, the one nudge
describe("the selected pill comes to the middle", () => {
  it("in the middle of what is seen", () => expect(centerOffset({ x: 400, w: 80 }, 390, 900)).toBe(400 - (390 - 80) / 2));
  it("never before the row's start (the first tabs)", () => expect(centerOffset({ x: 16, w: 70 }, 390, 900)).toBe(0));
  it("never past its end (the last tab)", () => expect(centerOffset({ x: 820, w: 64 }, 390, 900)).toBe(900 - 390));
  it("a row that fits does not move", () => expect(centerOffset({ x: 200, w: 60 }, 390, 380)).toBe(0));
});

describe("an edge fades only where more tabs lie past it", () => {
  it("at the start: only the right", () => expect(fadedEdges(0, 390, 900)).toEqual({ left: false, right: true }));
  it("in the middle: both", () => expect(fadedEdges(200, 390, 900)).toEqual({ left: true, right: true }));
  it("at the end: only the left", () => expect(fadedEdges(510, 390, 900)).toEqual({ left: true, right: false }));
  it("a row that fits: none", () => expect(fadedEdges(0, 390, 380)).toEqual({ left: false, right: false }));
  it("a rounded offset of a pixel is not «more»", () => expect(fadedEdges(1, 390, 391)).toEqual({ left: false, right: false }));
});

describe("the nudge on the first open", () => {
  it("a fade and a step past it — from tokens", () => expect(nudgeDistance(390, 900)).toBe(component.tab.fadeW + space[6]));
  it("no further than the row goes", () => expect(nudgeDistance(390, 410)).toBe(20));
  it("none when the row fits", () => expect(nudgeDistance(390, 390)).toBe(0));
  it("the fade is a token (space-8), as the design system's CSS says", () => expect(component.tab.fadeW).toBe(space[8]));
});
