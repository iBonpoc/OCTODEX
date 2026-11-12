import { describe, expect, it } from "vitest";
import { computeGutterParts } from "@octo/estimating-engine";
import { moveEnd, moveEndAlong, splitCorner } from "../src/modules/gutters/canvas/edit";
import { DEFAULT_RUN_ATTRS, fromElements, toElements } from "../src/modules/gutters/canvas/model";
import { findCorners, runEnds, toMeasurement, type Drawing, type DrawnRun, type P } from "../src/modules/gutters/geometry";

/** #933 PR-2 «Разъединить угол»: a mark, not a move — nothing measured changes; two end caps instead of a corner. */
const run = (id: string, a: P, b: P, o: Partial<DrawnRun> = {}): DrawnRun => ({ id, a, b, attrs: { ...DEFAULT_RUN_ATTRS }, ...o });
const L2: Drawing = { runs: [run("a", [0, 0], [240, 0], { lengthIn: 240 }), run("b", [240, 0], [240, 180], { lengthIn: 181.5 })], downspouts: [] };
const caps = (d: Drawing) => { const e = runEnds(d, findCorners(d)); return d.runs.flatMap((r) => [0, 1].map((i) => e[r.id]?.[i as 0 | 1]?.kind)).filter((k) => k === "cap").length; };
const split = (d: Drawing) => splitCorner(d, findCorners(d)[0]!);
const q = (d: Drawing, key: string) => computeGutterParts(toMeasurement(d)).parts.find((p) => p.key.startsWith(key))?.qty;

describe("splitCorner is a mark: nothing measured changes", () => {
  it("points and lengths are the same to the inch; only the mark is added", () => {
    const s = split(L2);
    expect(s.runs.map((r) => [r.a, r.b, r.lengthIn])).toEqual(L2.runs.map((r) => [r.a, r.b, r.lengthIn]));
    expect(s.runs.every((r) => r.attrs.openEnds)).toBe(true);
  });
  it("the measurement and the estimate see the same lengths: the engine's input and the installed feet are equal before and after", () => {
    const s = split(L2);
    expect(toMeasurement(s).runs.map((r) => r.lengthIn)).toEqual(toMeasurement(L2).runs.map((r) => r.lengthIn));
    expect(q(s, "gutter.")).toBe(q(L2, "gutter."));
  });
  it("the corner is gone and each gutter has an end cap there (4 caps in all); the engine has no corner and 4 end caps", () => {
    const s = split(L2);
    expect(findCorners(L2)).toHaveLength(1);
    expect(findCorners(s)).toHaveLength(0);
    expect(caps(s)).toBe(4);
    expect(toMeasurement(s).corners).toHaveLength(0);
    expect(toMeasurement(L2).corners).toHaveLength(1);
    expect(toMeasurement(s).runs.flatMap((r) => r.ends).filter((e) => e.kind === "cap")).toHaveLength(4);
    const caps4 = computeGutterParts(toMeasurement(s)).parts.filter((p) => /^endcap\./.test(p.key)).reduce((n, p) => n + Number(p.qty), 0);
    expect(caps4).toBe(4);
  });
});

describe("data without the mark are as before", () => {
  it("an old drawing: the same corner, 2 caps", () => {
    expect(findCorners(L2)).toHaveLength(1);
    expect(caps(L2)).toBe(2);
    expect(L2.runs.every((r) => !r.attrs.openEnds)).toBe(true);
  });
  it("the mark survives the store's rows (jsonb attrs) and comes back", () => {
    const back = fromElements(toElements(split(L2), "m1"));
    expect(findCorners(back)).toHaveLength(0);
    expect(back.runs.map((r) => r.attrs.openEnds)).toEqual(split(L2).runs.map((r) => r.attrs.openEnds));
  });
});

describe("the mark and the rest of the line", () => {
  it("another corner of the line stays: a U split at one corner keeps the other", () => {
    const U: Drawing = { runs: [run("a", [0, 0], [240, 0]), run("b", [240, 0], [240, 180]), run("c", [240, 180], [0, 180])], downspouts: [] };
    const f = findCorners(U);
    expect(f).toHaveLength(2);
    const s = splitCorner(U, f[0]!);
    expect(findCorners(s)).toHaveLength(1);
    expect(caps(s)).toBe(4);
  });
  it("a slanted corner splits too; an unknown gutter changes nothing", () => {
    const S: Drawing = { runs: [run("a", [0, 0], [240, 0]), run("b", [240, 0], [410, 170])], downspouts: [] };
    expect(findCorners(split(S))).toHaveLength(0);
    expect(splitCorner(S, { runs: [{ id: "zz", end: 0 }, { id: "a", end: 1 }] })).toBe(S);
  });
  it("an end pulled or moved away drops its mark; the other gutter's stays, and the corner does not come back by itself", () => {
    const s = split(L2);
    const pulled = moveEndAlong(s, "b", 0, [240, 40]); // b's start (the split end) pulled along its gutter
    expect(pulled.runs.find((r) => r.id === "b")!.attrs.openEnds).toBeUndefined();
    expect(pulled.runs.find((r) => r.id === "a")!.attrs.openEnds).toBeTruthy();
    const moved = moveEnd(s, "b", 0, [300, 60], 18);
    expect(moved.runs.find((r) => r.id === "b")!.attrs.openEnds).toBeUndefined();
  });
});
