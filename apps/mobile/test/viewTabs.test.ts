import { describe, expect, it } from "vitest";
import { component, space } from "@octo/design-tokens";
import { centerOffset, fadedEdges, nudgeDistance, tailRoom, wholeOffset } from "../src/ui/viewTabsLogic";

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

describe("the row never stops on a sliver of a tab (#3060: «видна одинокая «4»»)", () => {
  // the client's row at 390: Обзор · Работы 3 · Сметы 4 · Счета 4 · Выезды 4 · Объекты 2 · Журнал, 16 inset, 8 apart
  const ws = [64, 92, 80, 80, 90, 96, 80];
  const tabs = ws.reduce<{ x: number; w: number }[]>((a, w) => [...a, { x: a.length ? a[a.length - 1]!.x + a[a.length - 1]!.w + 8 : 16, w }], []);
  const content = tabs[tabs.length - 1]!.x + tabs[tabs.length - 1]!.w + 16;
  const starts = tabs.map((b) => b.x - 16);
  it("the middle alone cuts a tab at the left edge for some tab (the bug)", () => {
    const cut = tabs.map((b) => centerOffset(b, 390, content)).filter((x) => x !== 0 && !starts.includes(x));
    expect(cut.length).toBeGreaterThan(0);
  });
  for (const i of [2, 3, 4, 5, 6]) {
    it(`tab ${i}: stops where a whole tab starts and shows the selected one whole`, () => {
      const x = wholeOffset(tabs[i]!, tabs, 390, content);
      expect(starts.includes(x) || x === 0).toBe(true);
      expect(x <= tabs[i]!.x && x + 390 >= tabs[i]!.x + tabs[i]!.w).toBe(true);
    });
  }
  it("a row that fits does not move", () => expect(wholeOffset(tabs[1]!, tabs.slice(0, 3), 390, 300)).toBe(0));
  it("the last tab: with the tail room the row stops on a whole tab, not on a sliver", () => {
    const room = tailRoom(tabs, 390);
    const x = wholeOffset(tabs[6]!, tabs, 390, content + room);
    expect(starts.includes(x)).toBe(true);
    expect(x + 390 >= tabs[6]!.x + tabs[6]!.w).toBe(true);
  });
  it("no tail room for a row that fits", () => expect(tailRoom(tabs.slice(0, 3), 390)).toBe(0));
});
