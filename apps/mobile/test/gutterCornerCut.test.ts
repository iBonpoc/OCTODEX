import { describe, expect, it } from "vitest";
import { angleFromTriangle, cornerCut, sixteenth, findCorners, type DrawnRun, type Drawing, type P } from "../src/modules/gutters/geometry";
import { ftIn } from "../src/modules/gutters/canvas/format";
import { tapeIn } from "../src/modules/gutters/canvas/attrs";
import { setCornerAngle, setLength } from "../src/modules/gutters/canvas/edit";
import { fromElements, toElements } from "../src/modules/gutters/canvas/model";
import { fmtLen } from "../src/modules/gutters/canvas/format";
import { oneIn } from "../src/modules/gutters/canvas/attrs";
import { setCornerSplash, setRunUnit } from "../src/modules/gutters/canvas/edit";
import { splashOff, toMeasurement } from "../src/modules/gutters/geometry";
import { placeAt } from "../src/modules/gutters/canvas/localStore";

/** docs/specs/33-gutters-canvas.md П20.14 — the cut of a corner and the tape to 1/16″ (founder 08.11). */

const attrs = { profile: "k" as const, size: "5", material: "alu_032", color: "white", story: 1, hanger: "hidden" as const };
const r = (id: string, a: P, b: P, o: Partial<DrawnRun> = {}): DrawnRun => ({ id, a, b, attrs, ...o });
const ft = (n: number) => n * 12;
// an L, clockwise round the house: a → b turns right — an outside corner (the house inside the turn)
const square = (): Drawing => ({
  runs: [r("a", [0, ft(10)], [ft(10), ft(10)]), r("b", [ft(10), ft(10)], [ft(10), 0]), r("far", [ft(-30), ft(-30)], [ft(-20), ft(-30)])],
  downspouts: [],
});

describe("the cut of a corner", () => {
  it("90° outside, 5″ gutter: each run 10′ along the wall, 10′ 5″ along the face", () => {
    const d = square();
    const f = findCorners(d)[0]!;
    expect(f.kind).toBe("out");
    const cut = cornerCut(d, f);
    expect(cut.angleDeg).toBe(90);
    for (const x of cut.runs) {
      expect(x.backIn).toBe(ft(10));
      expect(x.frontIn).toBe(ft(10) + 5);
    }
  });
  it("90° inside: the face is shorter by the offset; a 6″ gutter — by 6″", () => {
    const d = square();
    // the house on the other side: the same corner is an inside one
    const inside: Drawing = { ...d, runs: d.runs.map((x) => (x.id === "far" ? x : { ...x, houseSide: x.id === "a" ? "L" : "L", attrs: { ...x.attrs, size: "6" } })) };
    const f = findCorners(inside)[0]!;
    expect(f.kind).toBe("in");
    for (const x of cornerCut(inside, f).runs) expect(x.frontIn).toBe(ft(10) - 6);
  });
  it("another angle: 120° between the walls (a 60° turn) — offset · tan 30°, to 1/8″", () => {
    const L = ft(10);
    const b: P = [L + Math.round(L * Math.cos(Math.PI / 3)), ft(10) - Math.round(L * Math.sin(Math.PI / 3))];
    const d: Drawing = { runs: [r("a", [0, ft(10)], [L, ft(10)]), r("b", [L, ft(10)], b)], downspouts: [] };
    const f = findCorners(d)[0]!;
    const cut = cornerCut(d, f);
    expect(cut.angleDeg).toBe(120);
    const a = cut.runs.find((x) => x.id === "a")!;
    expect(Math.abs(a.frontIn - a.backIn)).toBe(sixteenth(5 * Math.tan(Math.PI / 6)));
  });
  it("a run between two corners counts both ends; a cap end adds nothing", () => {
    // a U round a house: two outside corners — the middle run gets 5″ at each end
    const d: Drawing = { runs: [r("a", [0, 0], [0, ft(10)]), r("b", [0, ft(10)], [ft(20), ft(10)]), r("c", [ft(20), ft(10)], [ft(20), 0])], downspouts: [] };
    const f = findCorners(d).find((c) => c.runs.some((x) => x.id === "a"))!;
    const cut = cornerCut(d, f);
    expect(cut.runs.find((x) => x.id === "b")!.frontIn - ft(20)).toBe(10);
    expect(cut.runs.find((x) => x.id === "a")!.frontIn - ft(10)).toBe(5);
  });
});

describe("the tape to 1/16″", () => {
  it("8′ 9¼″ typed: 105.25″; shown back the same", () => {
    expect(tapeIn("8", "9", 2)).toBe(105.25);
    expect(ftIn(105.25)).toBe("8′ 9¼″");
    expect(ftIn(96.5)).toBe("8′ ½″");
    expect(ftIn(0.375)).toBe("⅜″");
    expect(ftIn(120)).toBe("10′");
  });
  it("a decimal inch is kept to 1/16″; feet stay whole", () => {
    expect(tapeIn("8", "9.3")).toBe(105.3125);
    expect(tapeIn("8", "9.25")).toBe(105.25);
    expect(tapeIn("8.5", "0")).toBeNull();
  });
  it("kept to 1/16″ through the store", () => {
    const d = setLength({ runs: [r("a", [0, 0], [ft(8), 0])], downspouts: [] }, "a", 105.25);
    expect(d.runs[0]!.lengthIn).toBe(105.25);
    expect(fromElements(toElements(d, "m1")).runs[0]!.lengthIn).toBe(105.25);
  });
});

describe("the angle from a triangle measured on site (founder 08.11)", () => {
  it("3-4-5 → 90°; end to end of 16′ and 12′ 6⅜″ at 90° → 90°", () => {
    expect(angleFromTriangle(36, 48, 60)).toBe(90);
    const a = 192, b = 150.375;
    expect(angleFromTriangle(a, b, Math.hypot(a, b))).toBe(90);
  });
  it("110° and 70° come out; not a triangle → null", () => {
    const tri = (deg: number) => Math.sqrt(36 * 36 + 48 * 48 - 2 * 36 * 48 * Math.cos((deg * Math.PI) / 180));
    expect(angleFromTriangle(36, 48, tri(110))).toBe(110);
    expect(angleFromTriangle(36, 48, tri(70))).toBe(70);
    expect(angleFromTriangle(36, 48, 100)).toBeNull();
    expect(angleFromTriangle(36, 48, 0)).toBeNull();
  });
  it("setCornerAngle turns the second gutter, the corner and the first stay; the cut follows", () => {
    const d = square();
    const f = findCorners(d)[0]!;
    const t = setCornerAngle(d, f, 110);
    const g = findCorners(t)[0]!;
    expect(180 - g.turnDeg).toBe(110);
    expect(t.runs.find((x) => x.id === "a")).toEqual(d.runs.find((x) => x.id === "a"));
    expect(cornerCut(t, g).angleDeg).toBe(110);
    expect(setCornerAngle(d, f, 90)).toBe(d);
  });
  it("what hangs on the far end turns with it", () => {
    const d: Drawing = { runs: [r("a", [0, ft(10)], [ft(10), ft(10)]), r("b", [ft(10), ft(10)], [ft(10), 0]), r("c", [ft(10), 0], [0, 0])], downspouts: [] };
    const f = findCorners(d).find((k) => k.runs.some((x) => x.id === "a"))!;
    const t = setCornerAngle(d, f, 100);
    const c = t.runs.find((x) => x.id === "c")!;
    const b = t.runs.find((x) => x.id === "b")!;
    expect(c.a).toEqual(b.b); // still joined
    expect(Math.round(Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]))).toBe(ft(10)); // the same shape
  });
});


describe("part 1 of 09.11: units, the splash guard, the toolbar on top", () => {
  it("a length shown in ft+in, inches or mm; kept in inches", () => {
    expect(fmtLen(260)).toBe("21′ 8″");
    expect(fmtLen(306.5, "in")).toBe("306½″");
    expect(fmtLen(0.5, "in")).toBe("½″");
    expect(fmtLen(39.375, "mm")).toBe("1000 mm");
    // metres and centimetres too (founder 09.11)
    expect(fmtLen(118.125, "m")).toBe("3 m");
    expect(fmtLen(39.375, "cm")).toBe("100 cm");
    expect(oneIn("3", "m")).toBe(118.125);
    expect(oneIn("250,5", "cm")).toBe(98.625);
    expect(oneIn("1000", "mm")).toBe(39.375);
    expect(oneIn("260", "in")).toBe(260);
    expect(oneIn("0", "m")).toBeNull();
    expect(oneIn("x", "cm")).toBeNull();
    const d = setRunUnit({ runs: [r("a", [0, 0], [ft(10), 0])], downspouts: [] }, "a", "mm");
    expect(d.runs[0]!.unit).toBe("mm");
    expect("unit" in setRunUnit(d, "a", "ftin").runs[0]!).toBe(false);
    expect(fromElements(toElements(d, "m1")).runs[0]!.unit).toBe("mm");
  });
  it("the inside corner's splash guard off → the engine gets none; on again → back", () => {
    const d = square();
    const inside: Drawing = { ...d, runs: d.runs.map((x) => (x.id === "far" ? x : { ...x, houseSide: "L" as const })) };
    const f = findCorners(inside)[0]!;
    expect(toMeasurement(inside).corners[0]!.splashGuard).toBe(true);
    const off = setCornerSplash(inside, f, false);
    expect(splashOff(off, f)).toBe(true);
    expect(toMeasurement(off).corners[0]!.splashGuard).toBeUndefined();
    expect(toMeasurement(off).runs.every((x) => !("noSplash" in x))).toBe(true); // not an engine field
    expect(toMeasurement(setCornerSplash(off, f, true)).corners[0]!.splashGuard).toBe(true);
  });
  it("the toolbar dropped near the top sticks to the top", () => {
    expect(placeAt(195, 20, 390, 844)).toBe("top");
  });
});
