/**
 * #1318 (К1, money): a line along a PART of a gutter, or one that starts on it and runs past its end, made a gutter lying on it —
 * the material was counted twice and three corners were found. The canvas makes no such gutter (the same drawing back); touching
 * at a point (a gutter growing on from its end, a straight join) is no overlap.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {}, NativeModules: {}, AppState: { addEventListener: () => ({ remove() {} }) } }));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
import { computeGutterParts } from "@octo/estimating-engine";
import { finishStroke, lineRefused, moveEnd } from "../src/modules/gutters/canvas/edit";
import { overlapsRun, toMeasurement, type Drawing, type DrawnRun, type P } from "../src/modules/gutters/geometry";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const run = (id: string, a: P, b: P, story = 1): DrawnRun => ({ id, a, b, attrs: { ...attrs, story } });
const stroke = (d: Drawing, a: P, p: P) => finishStroke({ kind: "line", a }, d, p, 20, false, { id: "N", attrs });
const base = (): Drawing => ({ runs: [run("A", [0, 0], [400, 0]), run("B", [400, 0], [400, 300])], downspouts: [] });

describe("a line along a stretch of a gutter is no new gutter (#1318)", () => {
  it("from B.a to the middle of B: refused, the same drawing back, «overlap»", () => {
    const d = base();
    expect(stroke(d, [400, 0], [400, 150])).toBe(d);
    expect(lineRefused(d, [400, 0], [400, 150], 1)).toBe("overlap");
  });
  it("from the middle of B to its end; and a stretch in the middle", () => {
    const d = base();
    expect(stroke(d, [400, 100], [400, 300])).toBe(d);
    expect(overlapsRun(d, [400, 100], [400, 200], 1)).toBeDefined();
  });
  it("from B.b past B.a along the same line, longer than B (the second case of #1318): refused", () => {
    const d = base();
    expect(lineRefused(d, [400, 300], [400, -100], 1)).toBe("overlap");
    expect(stroke(d, [400, 300], [400, -100])).toBe(d);
  });
  it("exactly on a gutter is still «dup»", () => {
    expect(lineRefused(base(), [400, 0], [400, 300], 1)).toBe("dup");
  });
  it("not an overlap: touching at a point (straight on from B.b), a crossing line, a parallel one beside it, another storey", () => {
    const d = base();
    expect(overlapsRun(d, [400, 300], [400, 500], 1)).toBeUndefined(); // grows on from B.b
    expect(overlapsRun(d, [300, 150], [500, 150], 1)).toBeUndefined(); // crosses B
    expect(overlapsRun(d, [420, 0], [420, 300], 1)).toBeUndefined(); // 20″ beside
    expect(overlapsRun(d, [400, 0], [400, 150], 2)).toBeUndefined(); // another storey
  });
  it("the straight join of a new line to a gutter's end still works (a corner, not a refusal)", () => {
    const d = base();
    expect(stroke(d, [400, 300], [100, 300]).runs).toHaveLength(3);
  });
});

describe("money: the material is not doubled", () => {
  it("the drawing after the refused line has the same parts as before", () => {
    const d = base();
    const after = stroke(d, [400, 0], [400, 150]);
    expect(computeGutterParts(toMeasurement(after)).parts).toEqual(computeGutterParts(toMeasurement(d)).parts);
  });
  it("a refused line is the reason the parts were doubled before: the overlapping run would add its own length", () => {
    const d = base();
    const withOverlap: Drawing = { ...d, runs: [...d.runs, run("N", [400, 0], [400, 150])] };
    const a = Number(computeGutterParts(toMeasurement(withOverlap)).parts.find((p) => p.key.startsWith("gutter."))?.qty ?? 0) ;
    const b = Number(computeGutterParts(toMeasurement(d)).parts.find((p) => p.key.startsWith("gutter."))?.qty ?? 0) ;
    expect(a).toBeGreaterThan(b);
  });
});

describe("a dragged end that would lay its gutter along another one is no move", () => {
  it("C's end pulled so that C lies along a stretch of A: refused", () => {
    const d: Drawing = { runs: [run("A", [0, 0], [400, 0]), run("C", [200, 300], [200, 100])], downspouts: [] };
    expect(moveEnd(d, "C", 1, [300, 0], 20)).not.toBe(d); // across onto A's end is fine (a point)
    const e: Drawing = { runs: [run("A", [0, 0], [400, 0]), run("C", [100, 0], [100, 200])], downspouts: [] };
    expect(moveEnd(e, "C", 1, [300, 0], 20)).toBe(e); // C from (100,0) to (300,0): along A
  });
});
