/**
 * #818 / spec 33 П35, rule 15: gaps found in the review of the first tests. Both sides of the joint after a move:
 * the corner keeps its method and splash guard, typed fractions survive a touch, storeys do not mix, a third end at the joint
 * does not move, a downspout on the moved side follows, the lift counts the touch offset (`from`) and the held state, and
 * «Назад» (the snapshot `before`) returns the drawing whole.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { finishStroke, grabbedCorner, grabbedEnd, HELD_ORIGINAL, moveCorner, pushHistory, setCornerMethod, setCornerSplash, swingEnd, undo, type History } from "../src/modules/gutters/canvas/edit";
import { cornerChoiceOf, findCorners, runLengthIn, splashOff, type Drawing, type DrawnDownspout, type DrawnRun, type P } from "../src/modules/gutters/geometry";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const run = (id: string, a: P, b: P, extra: Partial<DrawnRun> = {}, story = 1): DrawnRun => ({ id, a, b, attrs: { ...attrs, story }, ...extra });
const ds = (id: string, runId: string, atIn: number): DrawnDownspout => ({ id, runId, atIn, shape: "rect", size: "2x3", material: "aluminum" } as never);
const V = (): Drawing => ({ runs: [run("A", [0, 0], [310, 290]), run("B", [310, 290], [600, 0])], downspouts: [] });
const ID = "c:A:B";
const NEW = { id: "x", attrs };

describe("the corner after a move keeps what was set on it (both gutters, both sides of the joint)", () => {
  it("method, splash guard off and the far ends' split marks survive; the corner is the same id with the same choice", () => {
    let d = V();
    const f0 = findCorners(d)[0]!;
    d = setCornerMethod(d, f0, "miter" as never);
    d = setCornerSplash(d, f0, false);
    d = { ...d, runs: d.runs.map((r) => (r.id === "A" ? { ...r, attrs: { ...r.attrs, openEnds: { a: true } } } : r)) };
    const before = JSON.stringify(d);
    const mv = moveCorner(d, ID, [250, 100])!;
    const f1 = findCorners(mv.drawing).find((c) => c.id === ID)!;
    expect(f1).toBeTruthy();
    expect(cornerChoiceOf(mv.drawing, f1)).toEqual(cornerChoiceOf(d, f0));
    expect(cornerChoiceOf(mv.drawing, f1)?.method).toBe("miter");
    expect(splashOff(mv.drawing, f1)).toBe(true);
    expect(mv.drawing.runs[0]!.attrs.openEnds).toEqual({ a: true });
    expect(JSON.stringify(d)).toBe(before); // the snapshot is not touched
  });
  it("a touch with no move leaves typed lengths with their 1/16 fractions (nothing is rewritten)", () => {
    const d: Drawing = { runs: [run("A", [0, 0], [300, 300], { lengthIn: 424.3125 }), run("B", [300, 300], [600, 0], { lengthIn: 424.25 })], downspouts: [] };
    const mv = moveCorner(d, ID, grabbedCorner(d, ID, [310, 290], [310, 290]), [true, true])!;
    expect(mv.drawing).toEqual(d);
    expect(mv.drawing.runs.map((r) => r.lengthIn)).toEqual([424.3125, 424.25]);
  });
  it("a real move writes whole inches on both sides, and runLengthIn reads exactly them", () => {
    const d: Drawing = { runs: [run("A", [0, 0], [310, 290], { lengthIn: 424.3125 }), run("B", [310, 290], [600, 0], { lengthIn: 405.0625 })], downspouts: [] };
    const mv = moveCorner(d, ID, [250, 100])!;
    for (const r of mv.drawing.runs) {
      expect(Number.isInteger(r.lengthIn)).toBe(true);
      expect(runLengthIn(r)).toBe(r.lengthIn);
    }
  });
});

describe("storeys and a third end", () => {
  it("a corner of storey 2 moves; the storey-1 gutter that meets it at the same point stays put and is not part of it", () => {
    const d: Drawing = { runs: [run("A", [0, 0], [310, 290], {}, 2), run("B", [310, 290], [600, 0], {}, 2), run("F", [310, 290], [310, 700], {}, 1)], downspouts: [] };
    const mv = moveCorner(d, ID, [250, 100])!;
    expect(mv).not.toBeNull();
    expect(mv.drawing.runs.find((r) => r.id === "F")).toEqual(d.runs[2]);
    expect(mv.drawing.runs[0]!.b).toEqual([250, 100]);
    // the floor-1 gutter alone with one storey-2 gutter is not a corner at all
    expect(findCorners({ runs: [d.runs[0]!, d.runs[2]!] })).toEqual([]);
  });
  it("a third gutter's end at the joint: that joint is not moved (it would tear the third one off)", () => {
    const d: Drawing = { ...V(), runs: [...V().runs, run("C", [310, 290], [310, 700])] };
    for (const c of findCorners(d)) expect(moveCorner(d, c.id, [250, 100]), c.id).toBeNull();
  });
});

describe("a downspout on a moved side", () => {
  it("joint at the START of both gutters (a,a): each downspout shifts with its length change and stays within its gutter", () => {
    const d: Drawing = { runs: [run("A", [310, 290], [0, 0]), run("B", [310, 290], [600, 0])], downspouts: [ds("d1", "A", 100), ds("d2", "B", 100)] };
    const mv = moveCorner(d, ID, [250, 100])!;
    const nA = Math.round(Math.hypot(250, 100)), nB = Math.round(Math.hypot(350, 100));
    const oA = Math.round(Math.hypot(310, 290)), oB = Math.round(Math.hypot(290, 290));
    expect(mv.drawing.downspouts[0]!.atIn).toBe(Math.min(nA, Math.max(0, 100 + (nA - oA))));
    expect(mv.drawing.downspouts[1]!.atIn).toBe(Math.min(nB, Math.max(0, 100 + (nB - oB))));
    for (const s of mv.drawing.downspouts) expect(s.atIn).toBeLessThanOrEqual(Math.round(runLengthIn(mv.drawing.runs.find((r) => r.id === s.runId)!)));
  });
  it("a downspout on another gutter is not touched by the move", () => {
    const d: Drawing = { ...V(), runs: [...V().runs, run("O", [0, 500], [400, 500])], downspouts: [ds("d3", "O", 200)] };
    expect(moveCorner(d, ID, [250, 100])!.drawing.downspouts).toEqual(d.downspouts);
  });
  it("swingEnd at the START end: the downspout keeps its place on the house side (shifts with the length), the other end does not shift it", () => {
    const d: Drawing = { runs: [run("a", [0, 0], [600, 0])], downspouts: [ds("d", "a", 500)] };
    const sw = swingEnd(d, "a", 0, [-100, 0])!; // the start grows by 100 along the line
    expect(sw.drawing.downspouts[0]!.atIn).toBe(600);
    const sw1 = swingEnd(d, "a", 1, [300, 0])!; // the far end shortens past the downspout
    expect(sw1.drawing.downspouts[0]!.atIn).toBe(300);
  });
});

describe("the lift counts the touch offset and the held state (finishStroke)", () => {
  it("corner: the lift moves the joint by the finger's move from `from`, not to the finger", () => {
    const g = { kind: "corner" as const, cornerId: ID, before: V(), from: [318, 280] as P, held: [false, false] as [boolean, boolean] };
    const lift: P = [268, 90]; // the finger moved (-50, -190) from the touch
    const out = finishStroke(g, V(), lift, 20, false, NEW);
    expect(out.runs[0]!.b).toEqual(moveCorner(V(), ID, grabbedCorner(V(), ID, g.from, lift))!.drawing.runs[0]!.b);
    expect(out.runs[0]!.b).not.toEqual([268, 90]);
    expect(out.runs[0]!.b).toEqual([260, 100]);
  });
  it("corner: held [true,true] keeps the side straight where [false,false] snaps it to 45° (the held state reaches the lift)", () => {
    const lift: P = [0 + 420 * Math.cos((48.1 * Math.PI) / 180), 420 * Math.sin((48.1 * Math.PI) / 180)];
    const held = finishStroke({ kind: "corner", cornerId: ID, before: V(), held: [true, true] }, V(), lift, 20, false, NEW);
    const free = finishStroke({ kind: "corner", cornerId: ID, before: V(), held: [false, false] }, V(), lift, 20, false, NEW);
    const angA = (d: Drawing) => (Math.atan2(d.runs[0]!.b[1], d.runs[0]!.b[0]) * 180) / Math.PI;
    expect(angA(held)).toBeCloseTo(43.1, 0);
    expect(angA(free)).toBeCloseTo(45, 0);
  });
  it("pull: the lift moves the end by the finger's move from `from` (a cap taken 20 off the end does not jump)", () => {
    const before: Drawing = { runs: [run("a", [0, 0], [600, 0])], downspouts: [] };
    const g = { kind: "pull" as const, id: "a", end: 1 as const, before, from: [620, 10] as P, held: HELD_ORIGINAL };
    const lift: P = [720, 10]; // +100 along the line
    expect(grabbedEnd(before, "a", 1, g.from, lift)).toEqual([700, 0]);
    expect(finishStroke(g, before, lift, 20, false, NEW).runs[0]!.b).toEqual([700, 0]);
  });
  it("a cancelled corner or pull returns the very snapshot (same object)", () => {
    const pb: Drawing = { runs: [run("a", [0, 0], [600, 0])], downspouts: [] };
    expect(finishStroke({ kind: "pull", id: "a", end: 1, before: pb, from: [600, 0], held: HELD_ORIGINAL }, pb, [650, 50], 20, true, NEW)).toBe(pb);
    expect(finishStroke({ kind: "corner", cornerId: ID, before: V(), held: [true, true] }, V(), [250, 100], 20, true, NEW).runs).toEqual(V().runs);
  });
});

describe("«Назад» returns the drawing whole after a taken end or corner", () => {
  const h0: History = { past: [], future: [] };
  it("corner: one step back gives the point, the lengths, the downspouts and the method as before", () => {
    const base: Drawing = { ...V(), runs: V().runs.map((r) => ({ ...r, lengthIn: 425.5 })), downspouts: [ds("d", "A", 300)] };
    const withM = setCornerMethod(base, findCorners(base)[0]!, "miter" as never);
    const after = finishStroke({ kind: "corner", cornerId: ID, before: withM, held: [false, false] }, withM, [250, 100], 20, false, NEW);
    expect(after).not.toEqual(withM);
    const back = undo(pushHistory(h0, withM), after)!;
    expect(back.d).toEqual(withM);
    expect(back.h.future[0]).toEqual(after);
  });
  it("end: one step back gives the point, the typed length (with its fraction) and the downspout as before", () => {
    const before: Drawing = { runs: [run("a", [0, 0], [600, 0], { lengthIn: 600.0625 })], downspouts: [ds("d", "a", 590)] };
    const after = finishStroke({ kind: "pull", id: "a", end: 1, before, from: [600, 0], held: HELD_ORIGINAL }, before, [300, 300], 20, false, NEW);
    expect(after.runs[0]!.b).not.toEqual([600, 0]);
    expect(after.downspouts[0]!.atIn).toBeLessThanOrEqual(Math.round(Math.hypot(after.runs[0]!.b[0], after.runs[0]!.b[1])));
    const back = undo(pushHistory(h0, before), after)!;
    expect(back.d).toEqual(before);
    expect(back.d.runs[0]!.lengthIn).toBe(600.0625);
  });
});

describe("a neighbour of another storey is not a neighbour", () => {
  it("swingEnd: the end may land on a storey-2 end (not a corner of storey 1), a frame is given", () => {
    const d: Drawing = { runs: [run("a", [0, 0], [600, 0]), run("o", [0, 0], [0, 400], {}, 2)], downspouts: [] };
    expect(swingEnd(d, "a", 1, [0, 400])).not.toBeNull();
  });
});
