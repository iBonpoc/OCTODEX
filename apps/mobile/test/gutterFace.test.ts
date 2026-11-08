import { describe, expect, it } from "vitest";
import { capSide, chainOf, centre, findCorners, houseSide, toMeasurement, type DrawnRun, type Drawing, type P } from "../src/modules/gutters/geometry";
import { flipFace } from "../src/modules/gutters/canvas/edit";
import { buildScene } from "../src/modules/gutters/canvas/scene";

/** docs/specs/33-gutters-canvas.md П20.11 — the face, end caps L/R, corners inside/outside (founder 08.11). */

const attrs = { profile: "k" as const, size: "6", material: "alu_032", color: "white", story: 1, hanger: "hidden" as const };
const r = (id: string, a: P, b: P, o: Partial<DrawnRun> = {}): DrawnRun => ({ id, a, b, attrs, ...o });
const ft = (n: number) => n * 12;
const d = (runs: DrawnRun[]): Drawing => ({ runs, downspouts: [] });
const sceneOf = (x: Drawing) =>
  buildScene(x, { view: { k: 1, ox: 100, oy: 1000 }, viewport: { w: 2000, h: 2000 }, fontSize: 11, padX: 4, gap: 4, dsText: (n) => `D${n}`, storyText: (n) => `эт ${n}`, cornerText: (k, s) => (s ? `${k}+sg` : k), faceOff: 8 });

// an L-shaped house, drawn round it clockwise: one inside corner (at the notch)
const L = [
  r("a", [0, ft(30)], [ft(20), ft(30)]),
  r("b", [ft(20), ft(30)], [ft(20), ft(15)]),
  r("c", [ft(20), ft(15)], [ft(40), ft(15)]),
];

describe("end caps L/R", () => {
  it("the same rule as the engine: start R when the house is right", () => {
    expect(capSide(0, "R")).toBe("R");
    expect(capSide(1, "R")).toBe("L");
    expect(capSide(0, "L")).toBe("L");
    expect(capSide(1, "L")).toBe("R");
  });
  it("a single run: two caps, one L and one R", () => {
    const s = sceneOf(d([r("x", [0, 0], [ft(20), 0])]));
    expect(s.caps.map((c) => c.side).sort()).toEqual(["L", "R"]);
  });
  it("a tap on a cap flips the face: both caps swap", () => {
    const x = d([r("x", [0, 0], [ft(20), 0]), r("y", [ft(40), ft(10)], [ft(40), ft(30)])]);
    const before = sceneOf(x).caps.filter((c) => c.runId === "x");
    const after = sceneOf(flipFace(x, "x")).caps.filter((c) => c.runId === "x");
    expect(after.map((c) => c.side)).toEqual(before.map((c) => (c.side === "L" ? "R" : "L")));
    // the other, separate run keeps its face
    expect(sceneOf(flipFace(x, "x")).caps.filter((c) => c.runId === "y").map((c) => c.side)).toEqual(sceneOf(x).caps.filter((c) => c.runId === "y").map((c) => c.side));
  });
});

describe("corners inside / outside", () => {
  it("chainOf: runs joined end to end", () => {
    expect([...chainOf(d([...L, r("far", [ft(90), 0], [ft(99), 0])]), "a")].sort()).toEqual(["a", "b", "c"]);
  });
  it("flipFace flips the whole line: every corner swaps inside ↔ outside, the caps follow", () => {
    const x = d(L);
    const kinds = (z: Drawing) => Object.fromEntries(findCorners(z).map((f) => [f.at.join(","), f.kind]));
    const k0 = kinds(x);
    const y = flipFace(x, "c");
    const k1 = kinds(y);
    expect(Object.values(k0).sort()).toEqual(["in", "out"]);
    expect(k1).toEqual(Object.fromEntries(Object.entries(k0).map(([at, k]) => [at, k === "in" ? "out" : "in"])));
    const c = centre(x.runs);
    for (const run of y.runs) expect(houseSide(run, c)).not.toBe(houseSide(x.runs.find((q) => q.id === run.id)!, c));
  });
  it("an inside corner gets a splash guard by itself; an outside one does not; a set choice wins", () => {
    const x = d(L);
    const m = toMeasurement(x);
    for (const k of m.corners) expect(k.splashGuard).toBe(k.kind === "in" ? true : undefined);
    expect(m.corners.some((k) => k.kind === "in")).toBe(true);
    const id = m.corners.find((k) => k.kind === "in")!.id;
    expect(toMeasurement({ ...x, corners: { [id]: { method: "cut", splashGuard: false } } }).corners.find((k) => k.id === id)!.splashGuard).toBe(false);
  });
  it("the scene: a mark and a chip per corner, no caps where runs meet", () => {
    const s = sceneOf(d(L));
    expect(s.corners).toHaveLength(2);
    expect(s.caps).toHaveLength(2); // the two free ends
    expect(s.labels.filter((l) => l.kind === "corner").map((l) => l.text).sort()).toEqual(s.corners.map((k) => (k.splash ? `${k.kind}+sg` : k.kind)).sort());
  });
});

describe("the face line", () => {
  it("stands off the run on the side away from the house", () => {
    const x = d([r("x", [0, 0], [ft(20), 0]), r("y", [0, ft(30)], [ft(20), ft(30)])]);
    // the house is between them (centre y = 15 ft): run x's face is south (screen y bigger, y is flipped), y's north
    const s = sceneOf(x);
    const fx = s.runs.find((q) => q.id === "x")!;
    const fy = s.runs.find((q) => q.id === "y")!;
    expect(fx.face[0][1]).toBeGreaterThan(fx.a[1]);
    expect(fy.face[0][1]).toBeLessThan(fy.a[1]);
  });
});

import { dsCode, elbowCounts, withElbowQty } from "../src/modules/gutters/canvas/attrs";
import { moveDs } from "../src/modules/gutters/canvas/edit";

describe("a downspout's fittings in one word (founder 08.11)", () => {
  it("A 2 + B 1 + offset 4″ → «AABO⁴»", () => {
    expect(dsCode({ shape: "rect", elbows: [{ style: "A", qty: 2 }, { style: "B", qty: 1 }], offsets: [{ lengthIn: 4, qty: 1 }] })).toBe("AABO⁴");
  });
  it("unset elbows are the engine's default (3 × A); none at all → empty", () => {
    expect(dsCode({ shape: "rect" })).toBe("AAA");
    expect(dsCode({ shape: "rect", elbows: [{ style: "A", qty: 0 }] })).toBe("");
  });
  it("round: by angle, the count small on top; two offsets of 2″", () => {
    expect(dsCode({ shape: "round", elbows: [{ style: "45", qty: 2 }, { style: "90", qty: 1 }], offsets: [{ lengthIn: 2, qty: 2 }] })).toBe("45°²90°O²O²");
  });
  it("the panel's counts: every style, and a change keeps the others", () => {
    expect(elbowCounts({ shape: "rect" })).toEqual({ A: 3, B: 0 });
    const a = { shape: "rect" as const, elbows: withElbowQty({ shape: "rect" }, "B", 1) };
    expect(elbowCounts(a)).toEqual({ A: 3, B: 1 });
    expect(withElbowQty(a, "A", 2)).toEqual([{ style: "A", qty: 2 }, { style: "B", qty: 1 }]);
    expect(withElbowQty({ shape: "rect", elbows: [{ style: "A", qty: 1 }] }, "A", 0)).toEqual([{ style: "A", qty: 0 }]);
  });
});

describe("a downspout dragged (founder 08.11)", () => {
  const ds = { id: "d1", runId: "x", atIn: 24, shape: "rect", size: "2x3", material: "alu_032", color: "white", bottom: { kind: "extension" } } as unknown as Drawing["downspouts"][number];
  const x: Drawing = { runs: [r("x", [0, 0], [ft(20), 0])], downspouts: [ds] };
  it("slides along its own run to the finger", () => {
    expect(moveDs(x, "d1", [ft(10), 30]).downspouts[0]!.atIn).toBe(ft(10));
  });
  it("stays on the run past its ends", () => {
    expect(moveDs(x, "d1", [ft(30), 0]).downspouts[0]!.atIn).toBe(ft(20));
    expect(moveDs(x, "d1", [-50, 0]).downspouts[0]!.atIn).toBe(0);
  });
  it("the scene: «D1» inside the mark, the fittings word over it", () => {
    const s = sceneOf({ ...x, downspouts: [{ ...ds, elbows: [{ style: "A", qty: 2 }, { style: "B", qty: 1 }], offsets: [{ lengthIn: 4, qty: 1 }] }] });
    expect(s.ds[0]!.text).toBe("D1");
    expect(s.labels.find((l) => l.kind === "ds")!.text).toBe("AABO⁴");
  });
});

import { placeAt } from "../src/modules/gutters/canvas/localStore";

describe("the toolbar dropped by its grip (founder 08.11)", () => {
  it("sticks to the nearest edge: bottom, left or right", () => {
    expect(placeAt(195, 800, 390, 844)).toBe("bottom");
    expect(placeAt(10, 400, 390, 844)).toBe("left");
    expect(placeAt(380, 400, 390, 844)).toBe("right");
    expect(placeAt(640, 880, 1280, 900)).toBe("bottom");
  });
});
