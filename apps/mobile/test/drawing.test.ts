import { describe, expect, it } from "vitest";
import { summarize } from "../src/modules/gutters/drawing";

describe("photo drawing summary", () => {
  // calibration: 0.2 units = 16 ft (garage door) → 80 ft per unit
  const cal = { a: [0.1, 0.5] as [number, number], b: [0.3, 0.5] as [number, number], knownFt: 16 };

  it("is not calibrated without two points", () => {
    expect(summarize([[[0, 0], [1, 0]]], { knownFt: 16 }, []).calibrated).toBe(false);
  });

  it("measures an L-shaped eave: lengths and one outside corner (roof on the left of travel)", () => {
    // left→right along the top, then down the right side: roof is up/left → turning right = toward... check both sides
    const run: [number, number][] = [[0.1, 0.2], [0.6, 0.2], [0.6, 0.45]];
    const s = summarize([run], cal, [[0.1, 0.2], [0.6, 0.45]], "right");
    expect(s.calibrated).toBe(true);
    expect(s.segmentsFt[0]).toEqual([40, 20]);
    expect(s.totalFt).toBe(60);
    expect(s.outside + s.inside).toBe(1);
    expect(s.downspouts).toBe(2);
  });

  it("roof side flips outside/inside", () => {
    const run: [number, number][] = [[0.1, 0.2], [0.6, 0.2], [0.6, 0.45]];
    const r = summarize([run], cal, [], "right");
    const l = summarize([run], cal, [], "left");
    expect(r.outside).toBe(l.inside);
    expect(r.inside).toBe(l.outside);
  });

  it("ignores single-point runs", () => {
    expect(summarize([[[0.1, 0.1]]], cal, []).totalFt).toBe(0);
  });
});
