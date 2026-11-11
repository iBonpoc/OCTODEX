import { describe, expect, it } from "vitest";
import { SPLIT_GAP_IN, splitCorner } from "../src/modules/gutters/canvas/edit";
import { DEFAULT_RUN_ATTRS } from "../src/modules/gutters/canvas/model";
import { findCorners, runEnds, type Drawing, type DrawnRun, type P } from "../src/modules/gutters/geometry";

/** #933 PR-2 «Разъединить угол»: two gutters with their own end caps; the rest of the line stays. */
const run = (id: string, a: P, b: P, o: Partial<DrawnRun> = {}): DrawnRun => ({ id, a, b, attrs: { ...DEFAULT_RUN_ATTRS }, ...o });
const L2: Drawing = { runs: [run("a", [0, 0], [240, 0]), run("b", [240, 0], [240, 180], { lengthIn: 180 })], downspouts: [] };
const caps = (d: Drawing) => { const e = runEnds(d, findCorners(d)); return d.runs.flatMap((r) => [0, 1].map((i) => e[r.id]?.[i as 0 | 1]?.kind)).filter((k) => k === "cap").length; };

describe("splitCorner", () => {
  it("the corner is gone, both gutters have an end cap there (4 caps in all), the first gutter does not move", () => {
    const f = findCorners(L2);
    expect(f).toHaveLength(1);
    const s = splitCorner(L2, f[0]!);
    expect(findCorners(s)).toHaveLength(0);
    expect(caps(s)).toBe(4);
    expect(s.runs[0]).toEqual(L2.runs[0]);
  });
  it("the second gutter is shorter by the gap at the meeting end, a taped length by the same; its far end stays", () => {
    const f = findCorners(L2)[0]!;
    const s = splitCorner(L2, f);
    const b = s.runs.find((r) => r.id === "b")!;
    const which = f.runs[1].id === "b" ? b : s.runs.find((r) => r.id === f.runs[1].id)!;
    const len = Math.hypot(which.b[0] - which.a[0], which.b[1] - which.a[1]);
    const was = Math.hypot(L2.runs.find((r) => r.id === which.id)!.b[0] - L2.runs.find((r) => r.id === which.id)!.a[0], L2.runs.find((r) => r.id === which.id)!.b[1] - L2.runs.find((r) => r.id === which.id)!.a[1]);
    expect(Math.round(was - len)).toBe(SPLIT_GAP_IN);
    if (which.id === "b") expect(which.lengthIn).toBe(180 - SPLIT_GAP_IN);
  });
  it("another corner of the line stays: a U shape split at one corner keeps the other", () => {
    const U: Drawing = { runs: [run("a", [0, 0], [240, 0]), run("b", [240, 0], [240, 180]), run("c", [240, 180], [0, 180])], downspouts: [] };
    const f = findCorners(U);
    expect(f).toHaveLength(2);
    expect(findCorners(splitCorner(U, f[0]!))).toHaveLength(1);
  });
  it("a slanted second gutter splits too (the rounding does not put the end back on the join)", () => {
    const S: Drawing = { runs: [run("a", [0, 0], [240, 0]), run("b", [240, 0], [410, 170])], downspouts: [] };
    const s = splitCorner(S, findCorners(S)[0]!);
    expect(findCorners(s)).toHaveLength(0);
  });
  it("too short a gutter: the same drawing back, nothing is lost", () => {
    const T: Drawing = { runs: [run("a", [0, 0], [240, 0]), run("b", [240, 0], [240, 14])], downspouts: [] };
    const f = findCorners(T);
    expect(f.length ? splitCorner(T, f[0]!) : T).toBe(T);
  });
  it("a downspout on the shortened gutter stays on the line", () => {
    const D: Drawing = { ...L2, downspouts: [{ id: "d", runId: "b", atIn: 179 } as never] };
    const s = splitCorner(D, findCorners(D)[0]!);
    const r = s.runs.find((x) => x.id === "b")!;
    expect(s.downspouts[0]!.atIn).toBeLessThanOrEqual(Math.round(Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1])));
  });
});
