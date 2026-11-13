import { describe, expect, it } from "vitest";
import { computeGutterParts } from "@octo/estimating-engine";
import {
  autoHouseSide, capSide, centre, cornerCut, findCorners, nearestRun, projectOnRun, runEnds, snapDirection, snapPoint, toMeasurement, withLength,
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

/**
 * #758 (audit G-01, G-11): the house's side came from the centre of all points — outside a thin L-shaped (Г) or a
 * U-shaped (П) house. Each case below checks first that the centre is outside the house (the old guess would be wrong),
 * then the kinds of corners, the caps and the face lengths of the crew's sheet.
 */
describe("#758: the house's side of a Г- and a П-shaped house", () => {
  // Г: 40 × 40 ft with a 30 × 30 ft notch at the top-right — two arms 10 ft wide; drawn clockwise
  const G: DrawnRun[] = [
    r("g1", [0, ft(40)], [ft(10), ft(40)]),
    r("g2", [ft(10), ft(40)], [ft(10), ft(10)]),
    r("g3", [ft(10), ft(10)], [ft(40), ft(10)]),
    r("g4", [ft(40), ft(10)], [ft(40), 0]),
    r("g5", [ft(40), 0], [0, 0]),
    r("g6", [0, 0], [0, ft(40)]),
  ];
  // П: 50 × 30 ft with a 30 × 20 ft courtyard open at the top; drawn counter-clockwise
  const U: DrawnRun[] = [
    r("u1", [0, 0], [ft(50), 0]),
    r("u2", [ft(50), 0], [ft(50), ft(30)]),
    r("u3", [ft(50), ft(30)], [ft(40), ft(30)]),
    r("u4", [ft(40), ft(30)], [ft(40), ft(10)]),
    r("u5", [ft(40), ft(10)], [ft(10), ft(10)]),
    r("u6", [ft(10), ft(10)], [ft(10), ft(30)]),
    r("u7", [ft(10), ft(30)], [0, ft(30)]),
    r("u8", [0, ft(30)], [0, 0]),
  ];
  const inG = (p: P) => p[0] >= 0 && p[1] >= 0 && p[0] <= ft(40) && p[1] <= ft(40) && (p[0] <= ft(10) || p[1] <= ft(10));
  const inU = (p: P) => p[0] >= 0 && p[1] >= 0 && p[0] <= ft(50) && p[1] <= ft(30) && !(p[0] > ft(10) && p[0] < ft(40) && p[1] > ft(10));
  const kinds = (runs: DrawnRun[]) => findCorners({ runs }).map((c) => c.kind).sort();

  it("the old guess was wrong here: the centre of the points is outside both houses", () => {
    expect(inG(centre(G))).toBe(false);
    expect(inU(centre(U))).toBe(false);
  });
  it("closed Г: five outside corners and one inside (was: inside ↔ outside mixed up)", () => {
    expect(kinds(G)).toEqual(["in", "out", "out", "out", "out", "out"]);
    expect(findCorners({ runs: G }).find((c) => c.runs.some((x) => x.id === "g2") && c.runs.some((x) => x.id === "g3"))?.kind).toBe("in");
  });
  it("closed П: six outside corners and two inside", () => {
    expect(kinds(U)).toEqual(["in", "in", "out", "out", "out", "out", "out", "out"]);
  });
  it("the same Г drawn in mixed directions and from another run: the same corners", () => {
    const mixed = G.map((x, i) => (i % 2 ? r(x.id, x.b, x.a) : x));
    expect(kinds([...mixed.slice(3), ...mixed.slice(0, 3)])).toEqual(["in", "out", "out", "out", "out", "out"]);
  });
  it("an open line round the outside of the Г (all but its long side): caps of opposite hands, the house inside every corner", () => {
    const open = G.slice(0, 5); // g6 (the west wall) has no gutter
    expect(kinds(open)).toEqual(["in", "out", "out", "out"]);
    const m = toMeasurement({ runs: open, downspouts: [] });
    const caps = m.runs.flatMap((x) => x.ends.flatMap((e, i) => (e.kind === "cap" ? [capSide(i as 0 | 1, x.houseSide)] : [])));
    // one cap at each free end, a right one and a left one (was: both right)
    expect(caps.sort()).toEqual(["L", "R"]);
    // walked g1 → g5 the house is on the right of every run
    expect(m.runs.map((x) => x.houseSide)).toEqual(["R", "R", "R", "R", "R"]);
  });
  it("an open П round three sides: the house inside both corners", () => {
    const open = [r("w", [0, ft(30)], [0, 0]), r("s", [0, 0], [ft(50), 0]), r("e", [ft(50), 0], [ft(50), ft(30)])];
    expect(kinds(open)).toEqual(["out", "out"]);
  });
  it("the crew's face lengths: an inside corner is shorter on the face by the gutter's size, an outside one longer", () => {
    const cs = findCorners({ runs: G });
    const inner = cs.find((c) => c.kind === "in")!;
    const cut = cornerCut({ runs: G }, inner, cs);
    // g2 (30 ft) runs from an outside corner (+6″) to the inside one (−6″): the face is as long as the back;
    // g3 (30 ft) the same; was: both ends counted the wrong way
    const g2 = cut.runs.find((x) => x.id === "g2")!;
    expect(g2.backIn).toBe(ft(30));
    expect(g2.frontIn).toBe(ft(30));
    const g1 = cornerCut({ runs: G }, cs.find((c) => c.runs.some((x) => x.id === "g1") && c.runs.some((x) => x.id === "g2"))!, cs).runs.find((x) => x.id === "g1")!;
    // g1 (10 ft) between two outside corners: + 6″ + 6″
    expect(g1.frontIn).toBe(ft(10) + 12);
  });
  it("reference: a straight gutter alone — no corners, a cap of each hand at its ends", () => {
    const m = toMeasurement({ runs: [r("s", [0, 0], [ft(40), 0])], downspouts: [] });
    expect(findCorners({ runs: m.runs.map((x) => r(x.id, [0, 0], [ft(40), 0])) })).toEqual([]);
    expect(m.runs[0]!.ends.map((e, i) => (e.kind === "cap" ? capSide(i as 0 | 1, m.runs[0]!.houseSide) : null)).sort()).toEqual(["L", "R"]);
  });
  it("reference: two storeys — the Г on the 1st and a rectangle on the 2nd above it: each storey its own line, its own corners", () => {
    const up = rect.map((x) => r(`2${x.id}`, x.a, x.b, { attrs: { ...attrs, story: 2 } }));
    const cs = findCorners({ runs: [...G, ...up] });
    const of = (s: string) => cs.filter((c) => c.runs[0]!.id.startsWith(s)).map((c) => c.kind).sort();
    expect(of("g")).toEqual(["in", "out", "out", "out", "out", "out"]);
    expect(of("2")).toEqual(["out", "out", "out", "out"]);
  });
  it("reference: a 45° bay on the front of a rectangle — four bay corners (two bending out, two in), four outside corners", () => {
    // 40 × 30 clockwise; the bottom wall has a bay 3 ft deep between x = 10 and 30 ft, its sides at 45°
    const bay: DrawnRun[] = [
      rect[0]!, rect[1]!,
      r("b1", [ft(40), 0], [ft(30), 0]),
      r("b2", [ft(30), 0], [ft(27), -ft(3)]),
      r("b3", [ft(27), -ft(3)], [ft(13), -ft(3)]),
      r("b4", [ft(13), -ft(3)], [ft(10), 0]),
      r("b5", [ft(10), 0], [0, 0]),
      rect[3]!,
    ];
    const cs = findCorners({ runs: bay });
    expect(cs.map((c) => c.kind).sort()).toEqual(["bay", "bay", "bay", "bay", "out", "out", "out", "out"]);
    // at the bay's base the gutter bends away from the house, at its front towards it
    expect(cs.filter((c) => c.kind === "bay").map((c) => c.outward).sort()).toEqual([false, false, true, true]);
  });
  it("a run turned by hand keeps its side; a straight line alone keeps the old guess", () => {
    const flipped = G.map((x) => ({ ...x, houseSide: "L" as const }));
    expect(kinds(flipped)).toEqual(["in", "in", "in", "in", "in", "out"]);
    const one = [r("x", [0, 0], [ft(20), 0]), r("y", [0, ft(30)], [ft(20), ft(30)])];
    expect(toMeasurement({ runs: one, downspouts: [] }).runs.map((x) => x.houseSide)).toEqual(["L", "R"]);
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
  it("a cut corner keeps the runs' gauge and finish: one coil line, the corner's 14 in (an outside corner) included", () => {
    const g = { ...attrs, material: "aluminum", gauge: ".032", finish: "painted" as const };
    const d: Drawing = { runs: [{ ...rect[0]!, attrs: g }, { ...rect[1]!, attrs: g }], downspouts: [] };
    const m = toMeasurement(d, { method: "cut" });
    expect(m.corners[0]).toMatchObject({ gauge: ".032", finish: "painted" });
    const coils = computeGutterParts(m).parts.filter((p) => p.key.startsWith("coil."));
    // (480 + 360 + 14) × 1.10 / 12 = 78.28 → 79
    expect(coils.map((p) => [p.key, p.qty])).toEqual([["coil.k.6.aluminum.032.white", "79"]]);
  });
  it("a downspout on a deleted run is dropped", () => {
    const m = toMeasurement({ runs: [rect[0]!], downspouts: [{ id: "d", runId: "gone", atIn: 0, shape: "rect", size: "3x4", material: "alu", bottom: { kind: "none" } }] });
    expect(m.downspouts).toEqual([]);
  });
});
