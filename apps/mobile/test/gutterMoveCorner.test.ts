/**
 * #818 second half (spec 33 П35, founder 12.11 «оттягивать угол»): a corner taken and moved. The joint follows the finger,
 * the far ends of both gutters stand, each side held at a step of 45° within a window of the finger's width (default 50″ ≈ 7° at 400″; once held 1.5 × that), both held — the crossing of
 * the two rays; lengths whole inches (`lengthIn`); downspouts stay on their gutter; a joint never lands on another gutter's end.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { cornerMovable, finishStroke, grabbedCorner, moveCorner, sameDirection } from "../src/modules/gutters/canvas/edit";
import { findCorners, runLengthIn, SNAP_ANGLE_DEG, type Drawing, type DrawnRun, type P } from "../src/modules/gutters/geometry";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const run = (id: string, a: P, b: P, extra: Partial<DrawnRun> = {}): DrawnRun => ({ id, a, b, attrs, ...extra });
/** the corner at (310, 290) of two sides: from (0,0) and from (600,0) — a roof's ridge seen from above */
const V = (): Drawing => ({ runs: [run("A", [0, 0], [310, 290]), run("B", [310, 290], [600, 0])], downspouts: [] });
/** like V, but the second far end is off the first side's axis (a joint on that axis would lay the sides in one line: such a frame is blocked) */
const W = (): Drawing => ({ runs: [run("A", [0, 0], [310, 290]), run("B", [310, 290], [200, 600])], downspouts: [] });
const ID = "c:A:B";
const at = (deg: number, len: number, from: P): P => [from[0] + len * Math.cos((deg * Math.PI) / 180), from[1] + len * Math.sin((deg * Math.PI) / 180)];

describe("the corner is found by its id", () => {
  it("the fixture is one corner c:A:B; another id or no corner — null", () => {
    expect(findCorners(V()).map((c) => c.id)).toEqual([ID]);
    expect(moveCorner(V(), "c:X:Y", [300, 300])).toBeNull();
    expect(moveCorner({ runs: [run("A", [0, 0], [100, 0])], downspouts: [] }, ID, [50, 50])).toBeNull();
  });
});

describe("moveCorner", () => {
  it("free: the joint is where the finger is, both far ends stand, both gutters follow", () => {
    const mv = moveCorner(V(), ID, [250, 100])!;
    const [A, B] = mv.drawing.runs;
    expect(A!.a).toEqual([0, 0]);
    expect(B!.b).toEqual([600, 0]);
    expect(A!.b).toEqual([250, 100]);
    expect(B!.a).toEqual([250, 100]);
    expect(mv.held).toEqual([false, false]);
    expect(findCorners(mv.drawing).map((c) => c.id)).toEqual([ID]); // still one corner, the same id (its method, splash guard stay)
  });
  it("both sides within the window of a step: the joint is the crossing of the two rays (a right angle)", () => {
    const mv = moveCorner(V(), ID, [302, 297])!; // A at 44.5°, B at 135.1° from their far ends
    expect(mv.held).toEqual([true, true]);
    expect(mv.drawing.runs[0]!.b).toEqual([300, 300]);
    expect(mv.drawing.runs[1]!.a).toEqual([300, 300]);
    expect(mv.deg).toBe(90);
  });
  it("one side within the window: the joint is on its ray, the other side free", () => {
    const mv = moveCorner(W(), ID, [380, 70])!; // A: atan2(70,380) = 10.4° — no; make A near 0° instead
    expect(mv.held[0]).toBe(false);
    const near0 = moveCorner(W(), ID, [380, 20])!; // A at 3° from (0,0): held at 0°
    expect(near0.held[0]).toBe(true);
    expect(near0.drawing.runs[0]!.b[1]).toBe(0);
    expect(near0.drawing.runs[1]!.a[1]).toBe(0);
    expect(near0.drawing.runs[0]!.b[0]).toBeGreaterThan(370);
  });
  it("the window: in at the default width (7° at 400″), held to 1.5 × it; not entered between from outside", () => {
    const aAt = (deg: number) => at(deg, 400, [0, 0]);
    const out = SNAP_ANGLE_DEG + 1;
    expect(moveCorner(W(), ID, aAt(out))!.held[0]).toBe(false);
    expect(moveCorner(W(), ID, aAt(SNAP_ANGLE_DEG - 0.5))!.held[0]).toBe(true);
    expect(moveCorner(W(), ID, aAt(out), [true, false])!.held[0]).toBe(true);
    expect(moveCorner(W(), ID, aAt(SNAP_ANGLE_DEG + 5), [true, false])!.held[0]).toBe(false);
  });
  it("lengths are the distances from the far ends to the joint in whole inches, written as lengthIn; a typed one is replaced", () => {
    const d: Drawing = { runs: [run("A", [0, 0], [310, 290], { lengthIn: 425.5 }), run("B", [310, 290], [600, 0])], downspouts: [] };
    const mv = moveCorner(d, ID, [250, 100])!;
    const [A, B] = mv.drawing.runs;
    expect(A!.lengthIn).toBe(Math.round(Math.hypot(250, 100)));
    expect(B!.lengthIn).toBe(Math.round(Math.hypot(350, 100)));
    expect(runLengthIn(A!)).toBe(A!.lengthIn);
  });
  it("a downspout stays on its gutter: not past the new end; when the start end moves it keeps its place on the house", () => {
    const ds = { id: "d", runId: "A", atIn: 420, shape: "rect", size: "2x3", material: "aluminum" } as never;
    const d: Drawing = { ...V(), downspouts: [ds] };
    const short = moveCorner(d, ID, [150, 60])!;
    const n = Math.round(Math.hypot(150, 60));
    expect(short.drawing.downspouts[0]!.atIn).toBe(n);
    // B's start end (a) is the corner: a downspout on B keeps its distance from the house end b... measured from a, it shifts with the length change
    const onB: Drawing = { ...V(), downspouts: [{ id: "d2", runId: "B", atIn: 100, shape: "rect", size: "2x3", material: "aluminum" } as never] };
    const was = Math.round(Math.hypot(290, 290));
    const mv = moveCorner(onB, ID, [250, 100])!;
    const nB = Math.round(Math.hypot(350, 100));
    expect(mv.drawing.downspouts[0]!.atIn).toBe(Math.min(nB, Math.max(0, 100 + (nB - was))));
  });
  it("on another gutter's end the joint snaps onto it exactly (a three-ended joint forms on release); the same place — the same drawing", () => {
    const d: Drawing = { ...V(), runs: [...V().runs, run("O", [200, 80], [200, 600])] };
    const mv = moveCorner(d, ID, [203, 83])!;
    expect(mv.end).toEqual([200, 80]);
    expect(mv.drawing.runs[0]!.b).toEqual([200, 80]);
    expect(mv.drawing.runs[1]!.a).toEqual([200, 80]);
    const square: Drawing = { runs: [run("A", [0, 0], [300, 300]), run("B", [300, 300], [600, 0])], downspouts: [] };
    const same = moveCorner(square, ID, [300, 300])!; // both sides already at their steps: nothing moves
    expect(same.drawing).toEqual(square);
  });
  it("a side never shorter than the least (the joint onto a far end)", () => {
    expect(moveCorner(V(), ID, [3, 2])).toBeNull();
  });
  it("two ends of a different storey, or three at a joint, are not corners: nothing to move", () => {
    const other: DrawnRun = { id: "C", a: [310, 290], b: [310, 700], attrs: { ...attrs, story: 2 } };
    expect(findCorners({ runs: [run("A", [0, 0], [310, 290]), other] })).toEqual([]);
  });
});

describe("a side's own old direction is a magnet; the corner moves by the finger's move", () => {
  it("pulled along side A (finger wobble ±5°) A stays straight; the other side swings", () => {
    const mv = moveCorner(V(), ID, at(43.1 + 5, 420, [0, 0]), [true, true])!;
    const A = mv.drawing.runs[0]!;
    expect(Math.abs((Math.atan2(A.b[1], A.b[0]) * 180) / Math.PI - 43.1)).toBeLessThan(0.5); // A keeps its direction
    expect(Math.round(Math.hypot(A.b[0], A.b[1]))).toBeGreaterThan(410);
  });
  it("from the air a step of 45° catches a side that is 1.9° off it (the old direction does not hold it)", () => {
    const mv = moveCorner(V(), ID, [330, 320], [false, false])!; // A at 44.1° from (0,0): the step 45° is 0.9° away
    expect(mv.held[0]).toBe(true);
    expect(Math.abs((Math.atan2(mv.drawing.runs[0]!.b[1], mv.drawing.runs[0]!.b[0]) * 180) / Math.PI - 45)).toBeLessThan(0.5);
  });
  it("the joint moves by the finger's move from the touch, never jumps to the finger", () => {
    expect(grabbedCorner(V(), ID, [318, 280], [338, 280])).toEqual([330, 290]);
    expect(grabbedCorner(V(), ID, undefined, [338, 280])).toEqual([338, 280]);
    // the touch with no move: both sides held in their own directions — nothing changes
    const touch = moveCorner(V(), ID, grabbedCorner(V(), ID, [318, 280], [318, 280]), [true, true])!;
    expect(touch.drawing).toEqual(V());
  });
});

describe("the stroke of a corner", () => {
  it("the lift keeps the last frame when the lift itself would be blocked; at another end it snaps there; a canceled one keeps nothing", () => {
    const d: Drawing = { ...V(), runs: [...V().runs, run("O", [200, 80], [200, 600])] };
    const last = moveCorner(d, ID, [250, 100])!.drawing;
    const g = { kind: "corner" as const, cornerId: ID, before: d, held: [false, false] as [boolean, boolean] };
    expect(finishStroke(g, last, [3, 2], 20, false, { id: "x", attrs })).toBe(last); // a side shorter than the least: no frame
    expect(finishStroke(g, last, [203, 83], 20, false, { id: "x", attrs }).runs[0]!.b).toEqual([200, 80]);
    expect(finishStroke(g, last, [250, 100], 20, true, { id: "x", attrs })).toBe(d);
    expect(finishStroke(g, last, [250, 100], 20, false, { id: "x", attrs }).runs[0]!.b).toEqual([250, 100]);
  });
  it("the snapshot before the gesture is untouched (one step of «Назад»: the point, the lengths, the downspouts)", () => {
    const d = V();
    moveCorner(d, ID, [250, 100]);
    expect(d.runs[0]!.b).toEqual([310, 290]);
    expect(d.runs[1]!.a).toEqual([310, 290]);
    expect(d.runs[0]!.lengthIn).toBeUndefined();
  });
});

describe("blocked frames (review of #1240): the joint is never torn, turned inside out or straightened away", () => {
  it("a side never turns inside out: a finger past a far end (the crossing of two rays behind it) gives no frame", () => {
    // sides from (0,0) and (190,190); the joint at (300,0); the finger far behind the second far end, both sides held to steps
    const d: Drawing = { runs: [run("A", [0, 0], [300, 0]), run("B", [300, 0], [190, 190])], downspouts: [] };
    for (const p of [[-80, 40], [150, 300], [-200, 10]] as P[]) {
      const mv = moveCorner(d, ID, p, [true, true]);
      if (mv) {
        for (const [far, end] of [[[0, 0], mv.drawing.runs[0]!.b], [[190, 190], mv.drawing.runs[1]!.a]] as [P, P][]) expect((end[0] - far[0]) * (p[0] - far[0]) + (end[1] - far[1]) * (p[1] - far[1])).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it("a corner stays a corner: the frame that lays the sides almost in one line (a turn under 20°) is not drawn", () => {
    const d: Drawing = { runs: [run("A", [0, 0], [300, 100]), run("B", [300, 100], [600, 0])], downspouts: [] };
    expect(moveCorner(d, ID, [300, 100])).not.toBeNull();
    // the joint pulled up onto the line between the far ends: 180°
    expect(moveCorner(d, ID, [300, 3], [false, false])).toBeNull();
    // a frame that keeps ≥ 20° of turn is fine
    expect(moveCorner(d, ID, [300, 60], [false, false])).not.toBeNull();
  });
  it("three ends of a storey at a joint: it does not move (and is not offered to the finger)", () => {
    const d: Drawing = { runs: [...V().runs, run("C", [310, 290], [310, 700])], downspouts: [] };
    expect(cornerMovable(d, ID)).toBe(false);
    expect(moveCorner(d, ID, [250, 100])).toBeNull();
    expect(cornerMovable(V(), ID)).toBe(true);
    expect(cornerMovable(V(), "c:X:Y")).toBe(false);
  });
  it("another storey's end near the new joint does not block it (the corner is not found with it anyway)", () => {
    const other: DrawnRun = { id: "O", a: [250, 100], b: [250, 600], attrs: { ...attrs, story: 2 } };
    const d: Drawing = { runs: [...V().runs, other], downspouts: [] };
    expect(moveCorner(d, ID, [250, 100])).not.toBeNull();
  });
});

describe("sameDirection (the length window opens only after a pull along the gutter)", () => {
  const d: Drawing = { runs: [run("a", [0, 0], [600, 0])], downspouts: [] };
  it("longer or shorter on the same line: yes; turned or flipped: no", () => {
    expect(sameDirection(d, { runs: [run("a", [0, 0], [700, 0])] }, "a")).toBe(true);
    expect(sameDirection(d, { runs: [run("a", [0, 0], [300, 0])] }, "a")).toBe(true);
    expect(sameDirection(d, { runs: [run("a", [0, 0], [600, 40])] }, "a")).toBe(false);
    expect(sameDirection(d, { runs: [run("a", [0, 0], [-300, 0])] }, "a")).toBe(false);
    expect(sameDirection(d, { runs: [] }, "a")).toBe(false);
  });
});
