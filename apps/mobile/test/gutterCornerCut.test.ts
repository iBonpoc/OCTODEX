import { describe, expect, it } from "vitest";
import { cornerCut, eighth, findCorners, type DrawnRun, type Drawing, type P } from "../src/modules/gutters/geometry";
import { ftIn } from "../src/modules/gutters/canvas/format";
import { tapeIn } from "../src/modules/gutters/canvas/attrs";
import { setLength } from "../src/modules/gutters/canvas/edit";
import { fromElements, toElements } from "../src/modules/gutters/canvas/model";

/** docs/specs/33-gutters-canvas.md П20.14 — the cut of a corner and the tape to 1/8″ (founder 08.11). */

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
    expect(Math.abs(a.frontIn - a.backIn)).toBe(eighth(5 * Math.tan(Math.PI / 6)));
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

describe("the tape to 1/8″", () => {
  it("8′ 9¼″ typed: 105.25″; shown back the same", () => {
    expect(tapeIn("8", "9", 2)).toBe(105.25);
    expect(ftIn(105.25)).toBe("8′ 9¼″");
    expect(ftIn(96.5)).toBe("8′ ½″");
    expect(ftIn(0.375)).toBe("⅜″");
    expect(ftIn(120)).toBe("10′");
  });
  it("a decimal inch is kept to 1/8″; feet stay whole", () => {
    expect(tapeIn("8", "9.3")).toBe(105.25);
    expect(tapeIn("8.5", "0")).toBeNull();
  });
  it("kept to 1/8″ through the store", () => {
    const d = setLength({ runs: [r("a", [0, 0], [ft(8), 0])], downspouts: [] }, "a", 105.25);
    expect(d.runs[0]!.lengthIn).toBe(105.25);
    expect(fromElements(toElements(d, "m1")).runs[0]!.lengthIn).toBe(105.25);
  });
});
