/**
 * #1275 (founder 12.11): the canvas writes a corner as «135°» alone — small, on the bisector of its angle, outside the dash-dot arc — and a
 * gutter's length stands OUTSIDE from the house; «· эт N» only when the drawing has more than one storey. The cut of a piece is half the turn.
 */
import { describe, expect, it } from "vitest";
import { bisector, buildScene } from "../src/modules/gutters/canvas/scene";
import { fitView } from "../src/modules/gutters/canvas/scene";
import { candidates, overlaps } from "../src/modules/gutters/canvas/labels";
import { font } from "@octo/design-tokens";
import { cornerCut, cutAngleDeg, findCorners, type Drawing, type DrawnRun, type P } from "../src/modules/gutters/geometry";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const run = (id: string, a: P, b: P, houseSide?: "L" | "R"): DrawnRun => ({ id, a, b, attrs: { ...attrs }, ...(houseSide ? { houseSide } : {}) });
// fontSize — the length labels' size in the app (SvgPainter LABEL_FONT = font.size.caption), not a number of its own
const opts = (view: ReturnType<typeof fitView>) => ({ view, viewport: { w: 390, h: 700 }, fontSize: font.size.caption, padX: 4, gap: 4, dsText: (n: number) => `DS ${n}`, storyText: (n: number) => `эт ${n}`, dsPad: 10, faceOff: 8, cornerText: (_k: string, _s: boolean, deg: number) => `${deg}°` });
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
  it("(180° − the angle between the walls) / 2 — measured from what `cornerCut` says: 45° for a right angle, 22.5° for 135°", () => {
    const turn = (d: Drawing) => findCorners(d)[0]!.turnDeg;
    const V: Drawing = { runs: [run("a", [0, 0], [300, 0]), run("b", [300, 0], [300 + 212, 212])], downspouts: [] };
    for (const d of [L, V]) expect(cutAngleDeg(turn(d))).toBeCloseTo((180 - cornerCut(d, findCorners(d)[0]!).angleDeg) / 2, 9);
    expect(cutAngleDeg(turn(L))).toBe(45);
    expect(cutAngleDeg(turn(V))).toBe(22.5);
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

describe("the degrees and the lengths never lie on each other, and the degrees are not lost (#1352 review)", () => {
  /** two runs from a joint at (300, 0): `a` runs from the left, `b` leaves at `turnDeg` (left turn); an interior angle of 180 − turn */
  const wedge = (turnDeg: number, bLen = 220, houseSide?: "L" | "R"): Drawing => {
    const t = (turnDeg * Math.PI) / 180;
    return { runs: [run("a", [0, 0], [300, 0], houseSide), run("b", [300, 0], [300 + bLen * Math.cos(t), bLen * Math.sin(t)], houseSide)], downspouts: [] };
  };
  const view = (d: Drawing) => fitView(d.runs.flatMap((r) => [r.a, r.b]), { w: 390, h: 700 }, 100);
  const sceneOf = (d: Drawing) => buildScene(d, { ...opts(view(d)), lenWithStory: true });
  const apart = (ls: { x: number; y: number; w: number; h: number }[]) => {
    for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
      const bx = (l: (typeof ls)[0]) => ({ x0: l.x - l.w / 2, y0: l.y - l.h / 2, x1: l.x + l.w / 2, y1: l.y + l.h / 2 });
      if (overlaps(bx(ls[i]!), bx(ls[j]!))) return false;
    }
    return true;
  };

  it.each([30, 60, 90, 135, 150])("a wedge with a %d° interior angle: the degrees are there, the labels are apart", (_i) => {
    const turn = 180 - _i; // the interior angle `_i`
    const s = sceneOf(wedge(turn));
    const corner = s.labels.find((l) => l.kind === "corner");
    expect(corner, `the degrees of ${_i}° are not lost`).toBeDefined();
    expect(corner!.text).toBe(`${_i}°`);
    expect(apart(s.labels)).toBe(true);
  });
  it("a sharp wedge (30°): the degrees' box does not lie over either gutter's line", () => {
    const s = sceneOf(wedge(150));
    const c = s.labels.find((l) => l.kind === "corner")!;
    const bx = { x0: c.x - c.w / 2, y0: c.y - c.h / 2, x1: c.x + c.w / 2, y1: c.y + c.h / 2 };
    const hits = (a: [number, number], b: [number, number]) => {
      const n = 60;
      for (let i = 0; i <= n; i++) { const x = a[0] + ((b[0] - a[0]) * i) / n, y = a[1] + ((b[1] - a[1]) * i) / n; if (x > bx.x0 && x < bx.x1 && y > bx.y0 && y < bx.y1) return true; }
      return false;
    };
    for (const r of s.runs) expect(hits(r.a, r.b), `the gutter ${r.id}`).toBe(false);
  });
  it("a very short gutter (no arc on the screen): the degrees are there, apart from its length", () => {
    const d: Drawing = { runs: [run("a", [0, 0], [300, 0]), run("b", [300, 0], [300, 14])], downspouts: [] };
    const s = sceneOf(d);
    expect(s.corners[0]!.arc).toBeNull();
    expect(s.labels.find((l) => l.kind === "corner")).toBeDefined();
    expect(apart(s.labels)).toBe(true);
  });
  it.each(["L", "R"] as const)("the house on the %s: the face side and the bisector may meet — still apart, the degrees there", (side) => {
    const s = sceneOf(wedge(90, 220, side));
    expect(s.labels.find((l) => l.kind === "corner")).toBeDefined();
    expect(apart(s.labels)).toBe(true);
  });
  it("the corner's box is as small as its text: from `font.size.micro`, not the length labels' size", () => {
    const s = sceneOf(wedge(90));
    const c = s.labels.find((l) => l.kind === "corner")!;
    const len = s.labels.find((l) => l.kind === "len")!;
    expect(c.h).toBe(Math.ceil(font.size.micro * 1.4));
    expect(c.h).toBeLessThan(len.h);
  });
});
