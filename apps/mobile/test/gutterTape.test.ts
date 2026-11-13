/**
 * #1315 (founder 13.11: «шаг между метками больше, потому что тяжело попадать»): the tape is stretched (`component.tapeTick`),
 * it settles on the nearest mark, and every mark crossed gives a tick in the hand (not a buzz on a flick).
 */
import { describe, expect, it } from "vitest";
import { component } from "@octo/design-tokens";
import { settleAt, tickDue, TICK_GAP_MS } from "../src/modules/gutters/draw/tapeMath";

describe("the tape's marks are farther apart than a real tape's", () => {
  it("a mark is 16 px (it was 8): twice the room for a finger", () => {
    expect(component.tapeTick).toBe(16);
  });
});

describe("the tape settles on the nearest mark", () => {
  it("between two marks: the nearer one; halves go up", () => {
    expect(settleAt(100.4, 1000)).toBe(100);
    expect(settleAt(100.6, 1000)).toBe(101);
    expect(settleAt(100.5, 1000)).toBe(101);
    expect(settleAt(-7.2, 1000)).toBe(1); // never below the first mark
    expect(settleAt(5000.2, 1000)).toBe(1000); // nor past the last
  });
  it("a value that is a mark stays that mark", () => {
    expect(settleAt(192, 99999)).toBe(192);
  });
});

describe("a tick for every mark crossed, not a buzz", () => {
  it("another mark and enough time since the last tick → a tick", () => {
    expect(tickDue(10, 11, 0, TICK_GAP_MS)).toBe(true);
    expect(tickDue(10, 9, 100, 200)).toBe(true);
  });
  it("the same mark → none (the finger moved inside it)", () => {
    expect(tickDue(10, 10, 0, 1000)).toBe(false);
  });
  it("a flick over many marks in a few ms → the first only (a tick is at least TICK_GAP_MS after the last)", () => {
    let last = 0, ticks = 0;
    for (let k = 1, t = 1000; k <= 20; k++, t += 4) if (tickDue(k - 1, k, last, t)) (ticks++, (last = t));
    expect(ticks).toBeGreaterThan(1); // the hand still gets some…
    expect(ticks).toBeLessThan(20); // …not one per mark
  });
});
