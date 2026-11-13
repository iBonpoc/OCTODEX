import { describe, expect, it } from "vitest";
import { hitTest, onCornerPoint, splitCorner } from "../src/modules/gutters/canvas/edit";
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
  it("a gutter shorter than twice the set-back stays put", () => {
    const S: Drawing = { ...T, runs: T.runs.map((r) => (r.id === "c" ? run("c", [240, 0], [240, -30], { lengthIn: 30 }) : r)) };
    const s = splitCorner(S, pair(S, "a", "c"), OFF);
    expect(s.runs.find((r) => r.id === "c")!.a).toEqual([240, 0]);
  });
});

describe("a joint of three ends is not made (#1282)", () => {
  it("a point where two ends meet is a corner point; a free end is not; an own end is not counted", () => {
    expect(onCornerPoint(T, T.runs[0]!, new Set(["c"]), [240, 0], 20)).toBe(true);
    expect(onCornerPoint(T, T.runs[0]!, new Set(["b", "c"]), [240, 0], 20)).toBe(false);
    expect(onCornerPoint(T, T.runs[0]!, new Set(["c"]), [0, 0], 20)).toBe(false);
  });
});
