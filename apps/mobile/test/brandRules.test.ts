import { describe, expect, it } from "vitest";
import { motion } from "@octo/design-tokens";
import { DOT, bootStage, dotTone, dotWay, gToMark, pointOnWay } from "../src/ui/brandRules";

describe("unit:brandRules — GoRix in the app (DS §18.2, #1156)", () => {
  it("the dot: yellow on a big mark; ink at 24 and less on light and on any screen with a yellow main button", () => {
    expect(dotTone({ size: 48, theme: "dark", screenHasPrimary: false })).toEqual({ dot: "acc", ring: false });
    expect(dotTone({ size: 48, theme: "light", screenHasPrimary: false })).toEqual({ dot: "acc", ring: true });
    expect(dotTone({ size: 24, theme: "light", screenHasPrimary: false })).toEqual({ dot: "ink", ring: false });
    expect(dotTone({ size: 24, theme: "dark", screenHasPrimary: false })).toEqual({ dot: "acc", ring: false });
    expect(dotTone({ size: 120, theme: "dark", screenHasPrimary: true })).toEqual({ dot: "ink", ring: false });
  });

  it("the launch (#1394): the mark still for durBrandHold, then the wait with its word, after actionTimeoutMs «Повторить»", () => {
    expect(bootStage(0)).toBe("still");
    expect(bootStage(motion.durBrandHold - 1)).toBe("still");
    expect(bootStage(motion.durBrandHold)).toBe("wait");
    expect(bootStage(motion.actionTimeoutMs - 1)).toBe("wait");
    expect(bootStage(motion.actionTimeoutMs)).toBe("failed");
    // a fast start never shows a move: the hold is longer than the old short entry, and within Android's 1000 for a splash icon
    expect(motion.durBrandHold).toBeGreaterThan(motion.durBrandQuick);
    expect(motion.durBrandHold).toBeLessThanOrEqual(1000);
  });

  it("the dot's way starts at the G's top end and ends at the dot's place, without jumps", () => {
    const way = dotWay(700);
    expect(pointOnWay(way, 0)).toEqual({ x: 700, y: 232 });
    const end = pointOnWay(way, 1);
    expect(end.x).toBeCloseTo(DOT.cx, 6);
    expect(end.y).toBeCloseTo(DOT.cy, 6);
    let prev = pointOnWay(way, 0);
    for (let i = 1; i <= 200; i++) {
      const p = pointOnWay(way, i / 200);
      expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(20); // ≈ length / 200, no teleport at a joint
      prev = p;
    }
    // outside 0…1 it holds the ends
    expect(pointOnWay(way, -1)).toEqual(pointOnWay(way, 0));
    expect(pointOnWay(way, 2)).toEqual(pointOnWay(way, 1));
  });

  it("the dot at rest lands inside the mark's box", () => {
    const p = gToMark({ x: DOT.cx, y: DOT.cy });
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(0.5); // in the G, the left half
    expect(p.y).toBeGreaterThan(0.3);
    expect(p.y).toBeLessThan(0.7);
  });
});
