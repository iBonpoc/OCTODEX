import { describe, expect, it } from "vitest";
import { computeGutterParts } from "@octo/estimating-engine";
import type { DrawnDownspout, DrawnRun, Drawing, P } from "../src/modules/gutters/geometry";
import { toMeasurement } from "../src/modules/gutters/geometry";
import { measureSpec } from "../src/modules/gutters/view/spec";
import { DEFAULT_DS_ATTRS } from "../src/modules/gutters/canvas/model";

/** «Просмотр замера» (#698, spec 33 П20.25 п.3): the list of what the drawing is made of. */

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const r = (id: string, a: P, b: P, o: Partial<DrawnRun> = {}): DrawnRun => ({ id, a, b, attrs, ...o });
const ft = (n: number) => n * 12;
const ds = (id: string, runId: string, o: Partial<DrawnDownspout> = {}): DrawnDownspout => ({ ...DEFAULT_DS_ATTRS, id, runId, atIn: 6, ...o });
// an L (an outside corner) and a gutter alone on the 2nd storey
const house = (): Drawing => ({
  runs: [
    r("a", [0, ft(10)], [ft(10), ft(10)]),
    r("b", [ft(10), ft(10)], [ft(10), 0]),
    r("up", [ft(-30), ft(-30)], [ft(-20), ft(-30)], { attrs: { ...attrs, story: 2, size: "6", color: "brown" } }),
  ],
  downspouts: [ds("d1", "a", { elbows: [{ style: "A", qty: 2 }, { style: "B", qty: 1 }], offsets: [{ lengthIn: 2, qty: 1 }] }), ds("d2", "up")],
});

describe("measureSpec", () => {
  it("gutters by their number: along the wall and along the face, storey, size, colour", () => {
    const s = measureSpec(house(), []);
    expect(s.runs.map((x) => x.n)).toEqual([1, 2, 3]);
    // the corner's gutters: the face 5″ longer (a 5″ gutter, 90° outside); the lone one — the same both ways
    expect(s.runs[0]).toMatchObject({ backIn: ft(10), frontIn: ft(10) + 5, story: 1, profile: "k", size: "5", color: "white" });
    expect(s.runs[2]).toMatchObject({ backIn: ft(10), frontIn: ft(10), story: 2, size: "6", color: "brown" });
  });
  it("corners: kind, angle and the cut of each of its gutters by number", () => {
    const s = measureSpec(house(), []);
    expect(s.corners).toHaveLength(1);
    expect(s.corners[0]).toMatchObject({ kind: "out", angleDeg: 90 });
    expect(s.corners[0]!.runs.map((x) => x.n).sort()).toEqual([1, 2]);
    expect(s.corners[0]!.runs.every((x) => x.frontIn - x.backIn === 5)).toBe(true);
  });
  it("downspouts: number, storey of its gutter, elbows and offsets counted", () => {
    const s = measureSpec(house(), []);
    expect(s.ds[0]).toMatchObject({ n: 1, story: 1, elbows: 3, offsets: 1 });
    expect(s.ds[1]).toMatchObject({ n: 2, story: 2 });
  });
  it("parts: only materials with a quantity — labour is the estimate's", () => {
    const d = house();
    const parts = computeGutterParts(toMeasurement(d)).parts;
    const s = measureSpec(d, parts);
    expect(s.parts.length).toBeGreaterThan(0);
    expect(s.parts.every((p) => p.kind === "material" && Number(p.qty) > 0)).toBe(true);
    expect(parts.some((p) => p.kind === "labor")).toBe(true);
  });
  it("an empty drawing: nothing", () => {
    expect(measureSpec({ runs: [], downspouts: [] }, [])).toEqual({ runs: [], corners: [], ds: [], parts: [] });
  });
});
