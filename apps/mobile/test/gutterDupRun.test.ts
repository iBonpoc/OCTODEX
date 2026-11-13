/**
 * #1256 (К1, money): a line drawn over a gutter from one end to the other made a SECOND gutter lying exactly on it —
 * `findCorners` returned the pair twice with one id, the material and the corners were counted twice. The canvas makes no such
 * gutter; an old drawing that has one is protected in the data (corners, material).
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { computeGutterParts } from "@octo/estimating-engine";
import { finishStroke } from "../src/modules/gutters/canvas/edit";
import { DEFAULT_DS_ATTRS } from "../src/modules/gutters/canvas/model";
import { duplicateRuns, findCorners, sameEnds, toMeasurement, withoutDuplicates, wouldDuplicate, type Drawing, type DrawnDownspout, type DrawnRun, type P } from "../src/modules/gutters/geometry";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const run = (id: string, a: P, b: P, story = 1): DrawnRun => ({ id, a, b, attrs: { ...attrs, story } });
const stroke = (d: Drawing, a: P, p: P) => finishStroke({ kind: "line", a }, d, p, 20, false, { id: "N", attrs });
const base = (): Drawing => ({ runs: [run("A", [0, 0], [400, 0]), run("B", [400, 0], [400, 300])], downspouts: [] });

describe("the canvas makes no gutter over a gutter", () => {
  it("a line from B.a to B.b: no new gutter (the same drawing back)", () => {
    const d = base();
    expect(stroke(d, [400, 0], [400, 300])).toBe(d);
  });
  it("the same drawn the other way round (B.b → B.a)", () => {
    const d = base();
    expect(stroke(d, [400, 300], [400, 0])).toBe(d);
  });
  it("a triangle: the line that closes it is a new gutter; the line over A from A.b to A.a is not", () => {
    const d = base();
    expect(stroke(d, [400, 300], [0, 0]).runs).toHaveLength(3); // the hypotenuse is new
    expect(stroke(d, [400, 0], [0, 0])).toBe(d); // over A
  });
  it("another storey is no duplicate; a shorter line on the same line is not either", () => {
    const d = base();
    expect(wouldDuplicate(d, [400, 0], [400, 300], 2)).toBeUndefined();
    expect(wouldDuplicate(d, [400, 0], [400, 150], 1)).toBeUndefined();
  });
  it("sameEnds: both ends within an inch, either way; one end only is not", () => {
    expect(sameEnds(run("a", [0, 0], [100, 0]), run("b", [100, 0], [0, 0]))).toBe(true);
    expect(sameEnds(run("a", [0, 0], [100, 0]), run("b", [0, 0], [100, 5]))).toBe(false);
  });
});

describe("an old drawing that already has a duplicate is protected in the data", () => {
  const dup = (): Drawing => ({ runs: [...base().runs, run("N", [400, 0], [400, 300])], downspouts: [] });
  it("findCorners: the corner A–B once (not «c:B:N» twice); the duplicate makes no corner with B", () => {
    const ids = findCorners(dup()).map((c) => c.id);
    expect(ids).toContain("c:A:B");
    expect(ids.filter((id) => id.includes("N") && id.includes("B"))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length); // no id twice
  });
  it("duplicateRuns says which; withoutDuplicates keeps the first and moves the downspouts of the others (a reversed one: the other end)", () => {
    const d: Drawing = { ...dup(), runs: [...base().runs, run("N", [400, 300], [400, 0])], downspouts: [{ ...DEFAULT_DS_ATTRS, id: "d", runId: "N", atIn: 40 } as DrawnDownspout] };
    expect(duplicateRuns(d)).toEqual([["B", "N"]]);
    const w = withoutDuplicates(d);
    expect(w.runs.map((r) => r.id)).toEqual(["A", "B"]);
    expect(w.downspouts[0]).toMatchObject({ runId: "B", atIn: 260 }); // 300 − 40: it runs the other way
  });
  it("a sound drawing is the same object (nothing to do)", () => {
    const d = base();
    expect(withoutDuplicates(d)).toBe(d);
    expect(duplicateRuns(d)).toEqual([]);
  });
});

describe("money: the material of a drawing with a duplicate is the material of the same drawing without it", () => {
  it("toMeasurement drops the later duplicate: one gutter B, one corner A–B, the same parts as the sound drawing", () => {
    const sound = base();
    const withDup: Drawing = { ...sound, runs: [...sound.runs, run("N", [400, 0], [400, 300])] };
    const m = toMeasurement(withDup);
    expect(m.runs.map((r) => r.id)).toEqual(["A", "B"]);
    expect(m.corners).toHaveLength(1);
    expect(computeGutterParts(m).parts).toEqual(computeGutterParts(toMeasurement(sound)).parts);
  });
  it("the same with the duplicate drawn the other way and a downspout on it: the downspout is in the estimate once", () => {
    const sound: Drawing = { ...base(), downspouts: [{ ...DEFAULT_DS_ATTRS, id: "d", runId: "B", atIn: 260 } as DrawnDownspout] };
    const withDup: Drawing = { runs: [...sound.runs, run("N", [400, 300], [400, 0])], downspouts: [{ ...DEFAULT_DS_ATTRS, id: "d", runId: "N", atIn: 40 } as DrawnDownspout] };
    withDup.runs = withDup.runs;
    const a = computeGutterParts(toMeasurement({ runs: withDup.runs, downspouts: withDup.downspouts })).parts;
    const b = computeGutterParts(toMeasurement(sound)).parts;
    expect(a).toEqual(b);
  });
});
