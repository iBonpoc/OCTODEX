/**
 * #1275 (founder 12.11): the canvas writes a corner as «135°» alone — small, on the bisector of its angle, outside the dash-dot arc — and a
 * gutter's length stands OUTSIDE from the house; «· эт N» only when the drawing has more than one storey. The cut of a piece is half the turn.
 */
import { describe, expect, it } from "vitest";
import { bisector, buildScene } from "../src/modules/gutters/canvas/scene";
import { fitView } from "../src/modules/gutters/canvas/scene";
import { candidates } from "../src/modules/gutters/canvas/labels";
import { cornerCut, cutAngleDeg, findCorners, type Drawing, type DrawnRun, type P } from "../src/modules/gutters/geometry";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const run = (id: string, a: P, b: P, houseSide?: "L" | "R"): DrawnRun => ({ id, a, b, attrs: { ...attrs }, ...(houseSide ? { houseSide } : {}) });
const opts = (view: ReturnType<typeof fitView>) => ({ view, viewport: { w: 390, h: 700 }, fontSize: 11, padX: 4, gap: 4, dsText: (n: number) => `DS ${n}`, storyText: (n: number) => `эт ${n}`, dsPad: 10, faceOff: 8, cornerText: (_k: string, _s: boolean, deg: number) => `${deg}°` });
// an L: a runs 0,0 → 300,0; b runs 300,0 → 300,200 (a right-angle turn: the walls make 90°)
const L: Drawing = { runs: [run("a", [0, 0], [300, 0]), run("b", [300, 0], [300, 200])], downspouts: [] };
// a wide margin: the room on both sides of every gutter is free (a label is kept inside the screen — at the very edge the other side wins)
const scene = (d: Drawing = L) => buildScene(d, opts(fitView(d.runs.flatMap((r) => [r.a, r.b]), { w: 390, h: 700 }, 120)));

describe("a corner is written as its degrees alone, on the bisector (#1275)", () => {
  it("the bisector points INTO the angle: for the L it is the diagonal between the two pieces", () => {
    const [bx, by] = bisector([-1, 0], [0, 1]); // from the joint: back along a, along b
    expect(bx).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(by).toBeCloseTo(Math.SQRT1_2, 6);
    expect(bisector([1, 0], [-1, 0])).toEqual([-0, 1]); // a straight line: the normal of the first
  });
  it("the corner's label has no word, only «90°», and sits on the bisector outside the arc", () => {
    const s = scene();
    const k = s.corners[0]!;
    const lab = s.labels.find((l) => l.kind === "corner")!;
    expect(lab.text).toBe("90°");
    // the label's centre is along the bisector from the joint, farther than the arc's radius
    const dx = lab.x - k.at[0], dy = lab.y - k.at[1];
    expect(Math.hypot(dx, dy)).toBeGreaterThan(k.arc!.r);
    expect(Math.abs((dx * k.bis[1] - dy * k.bis[0]) / Math.hypot(dx, dy))).toBeLessThan(0.45); // within ~25° of the bisector (it may slide to be free)
    expect(dx * k.bis[0] + dy * k.bis[1]).toBeGreaterThan(0); // on the side of the angle
  });
  it("the angle is between the walls: 180° − the turn (a right turn: 90°; a 45° turn: 135°)", () => {
    expect(cornerCut(L, findCorners(L)[0]!).angleDeg).toBe(90);
    const V: Drawing = { runs: [run("a", [0, 0], [300, 0]), run("b", [300, 0], [300 + 212, 212])], downspouts: [] }; // turns 45°
    const t = findCorners(V)[0]!;
    expect(cornerCut(V, t).angleDeg).toBe(135);
    expect(scene(V).labels.find((l) => l.kind === "corner")!.text).toBe("135°");
  });
});

describe("the cut of a piece at a corner is half the turn (#1275)", () => {
  it("(180° − the angle between the walls) / 2: 45° for a right angle, 22.5° for 135°", () => {
    expect(cutAngleDeg(90)).toBe(45);
    expect(cutAngleDeg(45)).toBe(22.5);
    for (const turn of [20, 45, 70, 90, 120]) expect(cutAngleDeg(turn)).toBeCloseTo((180 - (180 - turn)) / 2, 9);
  });
});

describe("a gutter's length stands outside from the house (#1275)", () => {
  it("the preferred side of the label is tried first: the label sits on the side given", () => {
    const l = { id: "x", a: [50, 200] as [number, number], b: [350, 200] as [number, number], w: 40, h: 16, priority: 1 };
    const up = candidates({ ...l, side: [0, -1] }, 4)[0]!;
    const down = candidates({ ...l, side: [0, 1] }, 4)[0]!;
    expect(up[1]).toBeLessThan(200);
    expect(down[1]).toBeGreaterThan(200);
  });
  it("buildScene: the length label is on the side of the face line (away from the house), not on the house's", () => {
    // the face runs 8 px to the side away from the house (the scene's own face offset)
    const s = scene();
    for (const r of s.runs) {
      const lab = s.labels.find((l) => l.id === `len:${r.id}`)!;
      const mid: P = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2];
      const toFace: P = [r.face[0][0] - r.a[0], r.face[0][1] - r.a[1]];
      expect((lab.x - mid[0]) * toFace[0] + (lab.y - mid[1]) * toFace[1]).toBeGreaterThan(0);
    }
  });
});

describe("«· эт N» only with more than one storey (#1275)", () => {
  const two: Drawing = { runs: [run("a", [0, 0], [300, 0]), { ...run("b", [0, 300], [300, 300]), attrs: { ...attrs, story: 2 } }], downspouts: [] };
  const lens = (d: Drawing) => buildScene(d, { ...opts(fitView(d.runs.flatMap((r) => [r.a, r.b]), { w: 390, h: 700 }, 24)), lenWithStory: true }).labels.filter((l) => l.kind === "len").map((l) => l.text);
  it("one storey: the length alone", () => {
    expect(lens(L).every((t) => !t.includes("эт"))).toBe(true);
  });
  it("two storeys: each length with its storey", () => {
    expect(lens(two).every((t) => t.includes("эт"))).toBe(true);
  });
});
