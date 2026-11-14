import { describe, expect, it } from "vitest";
import { hitTest, onCornerPoint, splitCorner, swingEnd } from "../src/modules/gutters/canvas/edit";
import { DEFAULT_RUN_ATTRS } from "../src/modules/gutters/canvas/model";
import { findCorners, runLengthIn, toMeasurement, type Drawing, type DrawnRun, type P } from "../src/modules/gutters/geometry";

/** #1282 «Разъединить угол» when a third gutter still lies on the joint: the freed end is set back so it can be taken */
const run = (id: string, a: P, b: P, o: Partial<DrawnRun> = {}): DrawnRun => ({ id, a, b, attrs: { ...DEFAULT_RUN_ATTRS }, ...o });
// three gutters end at (240, 0): a from the left, b down, c up
const T: Drawing = { runs: [run("a", [0, 0], [240, 0], { lengthIn: 240 }), run("b", [240, 0], [240, 180], { lengthIn: 180 }), run("c", [240, 0], [240, -180], { lengthIn: 180 })], downspouts: [] };
const pair = (d: Drawing, x: string, y: string) => findCorners(d).find((c) => c.runs.some((r) => r.id === x) && c.runs.some((r) => r.id === y))!;
const OFF = 22;

describe("the freed end leaves the joint that still has other ends (#1282)", () => {
  it("both freed ends are set back along their own gutters; b, left at the joint, stays where it was", () => {
    const s = splitCorner(T, pair(T, "a", "c"), OFF);
    const c = s.runs.find((r) => r.id === "c")!, a = s.runs.find((r) => r.id === "a")!;
    expect(c.a).toEqual([240, -OFF]);
    expect(a.b).toEqual([240 - OFF, 0]); // the other freed end of the pair is set back along ITS gutter
    expect(s.runs.find((r) => r.id === "b")!.a).toEqual([240, 0]);
  });
  it("the freed ends are no longer at the corner point: a finger on the corner picks the corner's end, on the freed end — that end", () => {
    const s = splitCorner(T, pair(T, "a", "c"), OFF);
    expect(hitTest(s, [240, -OFF], 1)).toEqual({ kind: "end", id: "c", end: 0 });
  });
  it("measured lengths are the same to the inch (the estimate's input)", () => {
    const s = splitCorner(T, pair(T, "a", "c"), OFF);
    expect(s.runs.map((r) => runLengthIn(r))).toEqual(T.runs.map((r) => runLengthIn(r)));
    expect(toMeasurement(s).runs.map((r) => r.lengthIn)).toEqual(toMeasurement(T).runs.map((r) => r.lengthIn));
  });
  it("the split corner is gone from the data and from the measurement; the other one stays", () => {
    const s = splitCorner(T, pair(T, "a", "c"), OFF);
    expect(findCorners(s).some((c) => c.runs.some((r) => r.id === "c") && c.runs.some((r) => r.id === "a"))).toBe(false);
    expect(toMeasurement(s).corners.length).toBeLessThan(toMeasurement(T).corners.length);
  });
  it("a plain corner with no third end does not move (a mark only, as before)", () => {
    const L2: Drawing = { runs: [run("a", [0, 0], [240, 0], { lengthIn: 240 }), run("b", [240, 0], [240, 180], { lengthIn: 180 })], downspouts: [] };
    const s = splitCorner(L2, findCorners(L2)[0]!, OFF);
    expect(s.runs.map((r) => [r.a, r.b])).toEqual(L2.runs.map((r) => [r.a, r.b]));
  });
  it("a short gutter is freed too (never left on the joint): set back by a third of its length when the set-back is larger (#1338 review)", () => {
    const S: Drawing = { ...T, runs: T.runs.map((r) => (r.id === "c" ? run("c", [240, 0], [240, -30], { lengthIn: 30 }) : r)) };
    const s = splitCorner(S, pair(S, "a", "c"), OFF);
    expect(s.runs.find((r) => r.id === "c")!.a).toEqual([240, -10]); // 30 ÷ 3, not 22
    // a big set-back at a small scale (88″) frees a 10 ft gutter as well, by a third
    const big = splitCorner(T, pair(T, "a", "c"), 88);
    expect(big.runs.find((r) => r.id === "c")!.a).toEqual([240, -60]); // 180 ÷ 3 = 60, under the set-back of 88
    expect(big.runs.find((r) => r.id === "a")!.b).toEqual([240 - 80, 0]); // 240 ÷ 3 = 80
  });
  it("the measured length of a freed short gutter stays", () => {
    const S: Drawing = { ...T, runs: T.runs.map((r) => (r.id === "c" ? run("c", [240, 0], [240, -30], { lengthIn: 30 }) : r)) };
    expect(runLengthIn(splitCorner(S, pair(S, "a", "c"), OFF).runs.find((r) => r.id === "c")!)).toBe(30);
  });
});

describe("a downspout stays at the same point of the plan when its gutter's end is set back (#1338 review)", () => {
  const ds = (runId: string, atIn: number) => ({ id: "d", runId, atIn, size: "2x3", finish: "mill" }) as unknown as Drawing["downspouts"][number];
  const place = (d: Drawing, runId: string, atIn: number): P => {
    const r = d.runs.find((x) => x.id === runId)!;
    const t = atIn / runLengthIn(r);
    return [r.a[0] + (r.b[0] - r.a[0]) * t, r.a[1] + (r.b[1] - r.a[1]) * t];
  };
  const close = (u: P, v: P) => Math.hypot(u[0] - v[0], u[1] - v[1]) < 0.01;
  it("the middle of a 240″ gutter whose START is freed: the same point of the plan", () => {
    // a runs 0,0 → 240,0 with its END at the joint (end 1): the downspout in the middle
    const D: Drawing = { ...T, downspouts: [ds("a", 120)] };
    const s = splitCorner(D, pair(D, "a", "c"), OFF);
    expect(close(place(s, "a", s.downspouts[0]!.atIn), place(D, "a", 120))).toBe(true);
  });
  it("a gutter freed at its START (end 0): the same point of the plan too", () => {
    const D: Drawing = { ...T, downspouts: [ds("c", 90)] }; // c runs 240,0 → 240,-180: its start is at the joint
    const s = splitCorner(D, pair(D, "a", "c"), OFF);
    expect(s.runs.find((r) => r.id === "c")!.a).toEqual([240, -OFF]);
    expect(close(place(s, "c", s.downspouts[0]!.atIn), place(D, "c", 90))).toBe(true);
  });
  it("a downspout in the set-back stretch ends at the new end (never outside the gutter); one on a gutter that did not move is untouched", () => {
    const near: Drawing = { ...T, downspouts: [ds("c", 5), ds("b", 60)].map((x, i) => ({ ...x, id: `d${i}` })) };
    const s = splitCorner(near, pair(near, "a", "c"), OFF);
    expect(s.downspouts.find((x) => x.runId === "c")!.atIn).toBeGreaterThanOrEqual(0);
    expect(s.downspouts.find((x) => x.runId === "b")!.atIn).toBe(60);
  });
});

describe("a joint of three ends is not made (#1282)", () => {
  it("a point where two ends meet is a corner point; a free end is not; an own end is not counted", () => {
    expect(onCornerPoint(T, T.runs[0]!, new Set(["c"]), [240, 0], 20)).toBe(true);
    expect(onCornerPoint(T, T.runs[0]!, new Set(["b", "c"]), [240, 0], 20)).toBe(false);
    expect(onCornerPoint(T, T.runs[0]!, new Set(["c"]), [0, 0], 20)).toBe(false);
  });
});

describe("an end pulled onto a joint of two ends is not taken (#1282, П35)", () => {
  // a and b meet at (240, 0): a corner of two ends; c's free end is pulled around
  const J: Drawing = { runs: [run("a", [0, 0], [240, 0], { lengthIn: 240 }), run("b", [240, 0], [240, 180], { lengthIn: 180 }), run("c", [100, -300], [100, -100], { lengthIn: 200 })], downspouts: [] };
  it("near the joint: refused (null — the last frame stays)", () => {
    expect(swingEnd(J, "c", 1, [240, 2], null, 20, null)).toBeNull();
  });
  it("in the air, or onto a free end: allowed (a corner forms there)", () => {
    expect(swingEnd(J, "c", 1, [100, -50], null, 20, null)).not.toBeNull();
    expect(swingEnd(J, "c", 1, [0, 2], null, 20, null)).not.toBeNull(); // a's far end: one end there, two make a corner
  });
});
