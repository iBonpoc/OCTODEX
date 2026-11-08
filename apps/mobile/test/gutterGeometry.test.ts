import { describe, expect, it } from "vitest";
import { computeGutterParts } from "@octo/estimating-engine";
import {
  autoHouseSide, centre, findCorners, nearestRun, projectOnRun, runEnds, snapDirection, snapPoint, toMeasurement, withLength,
  type DrawnRun, type Drawing, type P,
} from "../src/modules/gutters/geometry";

/** docs/specs/33-gutters-module.md §3 (Measurement), S4g/S5g — drawing geometry in inches, north up. */

const attrs = { profile: "k" as const, size: "6", material: "alu_032", color: "white", story: 1, hanger: "hidden" as const };
const r = (id: string, a: P, b: P, o: Partial<DrawnRun> = {}): DrawnRun => ({ id, a, b, attrs, ...o });
const ft = (n: number) => n * 12;

// 40 × 30 ft rectangle drawn clockwise: top, right, bottom, left
const rect: DrawnRun[] = [
  r("top", [0, ft(30)], [ft(40), ft(30)]),
  r("right", [ft(40), ft(30)], [ft(40), 0]),
  r("bottom", [ft(40), 0], [0, 0]),
  r("left", [0, 0], [0, ft(30)]),
];

describe("snapping", () => {
  it("an end within 1.5 ft jumps onto an existing end; otherwise stays (rounded)", () => {
    expect(snapPoint([ft(40) + 10, ft(30) - 5], [[ft(40), ft(30)]])).toEqual([ft(40), ft(30)]);
    expect(snapPoint([100.4, 50.6], [[0, 0]])).toEqual([100, 51]);
  });
  it("direction snaps to 0/45/90 within 7°, length kept", () => {
    const b = snapDirection([0, 0], [100, 8]); // ~4.6°
    expect(b).toEqual([100, 0]);
    expect(snapDirection([0, 0], [100, 30])).toEqual([100, 30]); // ~16.7° — free
    const d = snapDirection([0, 0], [70, 72]); // ~45.8°
    expect(Math.round(Math.hypot(d[0], d[1]))).toBe(Math.round(Math.hypot(70, 72)));
    expect(d[0]).toBe(d[1]);
  });
  it("typed length moves the end along the drawn direction", () => {
    expect(withLength({ a: [0, 0], b: [100, 0] }, ft(42))).toEqual([ft(42), 0]);
  });
});

describe("house side", () => {
  it("clockwise outline: the house is on the right of every run", () => {
    const c = centre(rect);
    expect(rect.map((x) => autoHouseSide(x, c))).toEqual(["R", "R", "R", "R"]);
  });
});

describe("corners from topology", () => {
  it("rectangle: four outside corners, no end caps", () => {
    const cs = findCorners({ runs: rect });
    expect(cs).toHaveLength(4);
    expect(cs.every((c) => c.kind === "out" && c.turnDeg === 90)).toBe(true);
    const ends = runEnds({ runs: rect }, cs);
    expect(Object.values(ends).flat().every((e) => e.kind === "corner")).toBe(true);
  });
  it("same rectangle drawn in mixed directions still gives four outside corners", () => {
    const mixed = [rect[0]!, r("right", [ft(40), 0], [ft(40), ft(30)]), rect[2]!, r("left", [0, ft(30)], [0, 0])];
    expect(findCorners({ runs: mixed }).map((c) => c.kind)).toEqual(["out", "out", "out", "out"]);
  });
  it("L-shaped house: five outside corners and one inside", () => {
    // 40 × 30 with a 15 × 10 notch cut from the top-right
    const L: DrawnRun[] = [
      r("1", [0, ft(30)], [ft(25), ft(30)]),
      r("2", [ft(25), ft(30)], [ft(25), ft(20)]),
      r("3", [ft(25), ft(20)], [ft(40), ft(20)]),
      r("4", [ft(40), ft(20)], [ft(40), 0]),
      r("5", [ft(40), 0], [0, 0]),
      r("6", [0, 0], [0, ft(30)]),
    ];
    const kinds = findCorners({ runs: L }).map((c) => c.kind).sort();
    expect(kinds).toEqual(["in", "out", "out", "out", "out", "out"]);
  });
  it("open front: two runs meeting at 90° — one corner, caps at the free ends", () => {
    const runs = [rect[0]!, rect[1]!];
    const cs = findCorners({ runs });
    const ends = runEnds({ runs }, cs);
    expect(ends.top).toEqual([{ kind: "cap" }, { kind: "corner", cornerId: cs[0]!.id }]);
    expect(ends.right).toEqual([{ kind: "corner", cornerId: cs[0]!.id }, { kind: "cap" }]);
  });
  it("a turn under 20° is a straight join (no corner, no cap); 45° is a bay corner", () => {
    const join = [r("a", [0, 0], [ft(20), 0]), r("b", [ft(20), 0], [ft(40), 12])];
    expect(findCorners({ runs: join })).toEqual([]);
    expect(runEnds({ runs: join }, []).a[1]).toEqual({ kind: "join" });
    const bay = [r("a", [0, 0], [ft(20), 0]), r("b", [ft(20), 0], [ft(30), -ft(10)])];
    expect(findCorners({ runs: bay })[0]!.kind).toBe("bay");
  });
  it("the user can remove an end cap", () => {
    const one = [r("a", [0, 0], [ft(20), 0], { noCap: [false, true] })];
    expect(runEnds({ runs: one }, []).a).toEqual([{ kind: "cap" }, { kind: "join" }]);
  });
});

describe("downspouts on a run", () => {
  it("a tap near a run lands on it, measured from the run's start; far taps are refused", () => {
    expect(nearestRun({ runs: rect }, [ft(10), ft(30) + 20])).toEqual({ runId: "top", atIn: ft(10) });
    expect(nearestRun({ runs: rect }, [ft(20), ft(15)])).toBeNull();
  });
  it("position follows the typed length, clamped to the ends", () => {
    const run = r("a", [0, 0], [100, 0], { lengthIn: ft(20) });
    expect(projectOnRun(run, [50, 3]).atIn).toBe(120);
    expect(projectOnRun(run, [500, 0]).atIn).toBe(ft(20));
  });
});

describe("drawing → engine", () => {
  it("open L (two runs, one downspout): parts come out with caps, one corner, typed length wins", () => {
    const d: Drawing = {
      runs: [rect[0]!, { ...rect[1]!, lengthIn: ft(31) }],
      downspouts: [{ id: "d", runId: "right", atIn: ft(31), shape: "rect", size: "3x4", material: "alu", color: "white", bottom: { kind: "extension" } }],
    };
    const m = toMeasurement(d, { method: "prefab" });
    expect(m.runs.map((x) => x.lengthIn)).toEqual([ft(40), ft(31)]);
    expect(m.corners).toHaveLength(1);
    expect(m.corners[0]!.kind).toBe("out");
    const parts = computeGutterParts(m).parts;
    const q = (k: string) => parts.find((p) => p.key === k)?.qty;
    expect(q("gutter.k.6.alu_032.white")).toBe("71");
    expect(q("corner.out.k.6.alu_032.white")).toBe("1");
    expect(Number(q("endcap.L.k.6.alu_032.white") ?? 0) + Number(q("endcap.R.k.6.alu_032.white") ?? 0)).toBe(2);
    expect(q("labor.downspout.story1")).toBe("1");
  });
  it("a cut corner keeps the runs' gauge and finish: one coil line, the corner's 6 in included", () => {
    const g = { ...attrs, material: "aluminum", gauge: ".032", finish: "painted" as const };
    const d: Drawing = { runs: [{ ...rect[0]!, attrs: g }, { ...rect[1]!, attrs: g }], downspouts: [] };
    const m = toMeasurement(d, { method: "cut" });
    expect(m.corners[0]).toMatchObject({ gauge: ".032", finish: "painted" });
    const coils = computeGutterParts(m).parts.filter((p) => p.key.startsWith("coil."));
    // (480 + 360 + 6) × 1.05 / 12 = 74.025 → 75
    expect(coils.map((p) => [p.key, p.qty])).toEqual([["coil.k.6.aluminum.032.white", "75"]]);
  });
  it("a downspout on a deleted run is dropped", () => {
    const m = toMeasurement({ runs: [rect[0]!], downspouts: [{ id: "d", runId: "gone", atIn: 0, shape: "rect", size: "3x4", material: "alu", bottom: { kind: "none" } }] });
    expect(m.downspouts).toEqual([]);
  });
});
