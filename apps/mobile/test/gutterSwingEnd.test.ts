/**
 * #818 (founder 12.11: «свободно перемещалась и прилипала под 90°»): a free end taken and swung. Along the gutter — it only
 * grows (moveEndAlong); across it (more than the side threshold) — it turns round the other end, free, held at steps of 45°
 * relative to the neighbouring gutter (else its own old direction) within ±SNAP_ANGLE_DEG.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { finishStroke, MIN_RUN_IN, pulledSide, pullSideIn, SNAP_LEAVE_EXTRA_DEG, swingEnd } from "../src/modules/gutters/canvas/edit";
import { SNAP_ANGLE_DEG, runLengthIn, type Drawing, type DrawnRun, type P } from "../src/modules/gutters/geometry";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const run = (id: string, a: P, b: P, extra: Partial<DrawnRun> = {}): DrawnRun => ({ id, a, b, attrs, ...extra });
const one = (extra: Partial<DrawnRun> = {}): Drawing => ({ runs: [run("a", [0, 0], [600, 0], extra)], downspouts: [] });
const deg = (rad: number) => (rad * 180) / Math.PI;
const dirOf = (r: DrawnRun, end: 0 | 1) => {
  const f = end === 0 ? r.b : r.a, m = end === 0 ? r.a : r.b;
  return deg(Math.atan2(m[1] - f[1], m[0] - f[0]));
};
const at = (deg0: number, len: number): P => [len * Math.cos((deg0 * Math.PI) / 180), len * Math.sin((deg0 * Math.PI) / 180)];

describe("along or across", () => {
  const r = one().runs[0]!;
  it("the finger near the axis is along; past the side threshold — across (either side, either end)", () => {
    expect(pulledSide(r, 1, [700, 5], 14)).toBe(false);
    expect(pulledSide(r, 1, [700, 15], 14)).toBe(true);
    expect(pulledSide(r, 1, [700, -15], 14)).toBe(true);
    expect(pulledSide(r, 0, [-100, 13.9], 14)).toBe(false);
    expect(pulledSide(r, 0, [-100, 14.1], 14)).toBe(true);
  });
});

describe("swingEnd: the other end stands, the end follows the finger", () => {
  it("free angle outside the window: the length is the finger's distance, the direction the finger's", () => {
    const s = swingEnd(one(), "a", 1, [300, 450])!; // 56.3° from the old direction: 11° from 45° — free
    expect(s.snapped).toBe(false);
    const nr = s.drawing.runs[0]!;
    expect(nr.a).toEqual([0, 0]);
    expect(runLengthIn(nr)).toBeCloseTo(Math.hypot(300, 450), 0);
    expect(dirOf(nr, 1)).toBeCloseTo(56.3, 0);
  });
  it("held at 45° and 90° of the old direction (no neighbour) within ±7°, not outside", () => {
    for (const [want, finger] of [[45, 41], [45, 49], [90, 84], [90, 96], [135, 129], [0, 5], [-45, -50]] as const) {
      const s = swingEnd(one(), "a", 1, at(finger, 400))!;
      expect(s.snapped, `${finger}° near ${want}°`).toBe(true);
      expect(dirOf(s.drawing.runs[0]!, 1), `${finger}° → ${want}°`).toBeCloseTo(want, 0);
    }
    const out = swingEnd(one(), "a", 1, at(45 + SNAP_ANGLE_DEG + 1.5, 400))!;
    expect(out.snapped).toBe(false);
    expect(dirOf(out.drawing.runs[0]!, 1)).toBeCloseTo(45 + SNAP_ANGLE_DEG + 1.5, 0);
    // the edge of the window: just in, just out
    expect(swingEnd(one(), "a", 1, at(45 + SNAP_ANGLE_DEG - 0.3, 400))!.snapped).toBe(true);
    expect(swingEnd(one(), "a", 1, at(45 + SNAP_ANGLE_DEG + 0.3, 400))!.snapped).toBe(false);
  });
  it("with a neighbour at the standing end the steps are relative to it (a right angle to the neighbour, whatever the old direction)", () => {
    // the neighbour goes up from the standing end (0,0); the gutter's old direction is 30° off the axis
    const d: Drawing = { runs: [run("n", [0, 0], [0, -500]), run("a", [0, 0], at(30, 600))], downspouts: [] };
    const s = swingEnd(d, "a", 1, [480, 20])!; // the finger is ~2.4° from the right angle to the neighbour
    expect(s.snapped).toBe(true);
    expect(s.deg).toBe(90);
    const nr = s.drawing.runs.find((x) => x.id === "a")!;
    expect(nr.b[1]).toBe(0);
    expect(nr.b[0]).toBeGreaterThan(470);
    // straight on (180°) with the neighbour is a step too
    const straight = swingEnd(d, "a", 1, [4, 500])!;
    expect(straight.snapped).toBe(true);
    expect(straight.deg).toBe(180);
  });
  it("the standing end is either end: end 0 swings round b", () => {
    const s = swingEnd(one(), "a", 0, at(180 + 5, 300).map((v, i) => v + [600, 0][i]!) as P)!;
    const nr = s.drawing.runs[0]!;
    expect(nr.b).toEqual([600, 0]);
    expect(nr.a[1]).toBe(0); // 5° off the old direction is held
    expect(nr.a[0]).toBeCloseTo(300, 0);
  });
  it("a short line: the angle follows the finger without jumping (length in whole inches, never below the least)", () => {
    const d: Drawing = { runs: [run("a", [0, 0], [24, 0])], downspouts: [] };
    const s = swingEnd(d, "a", 1, [10, 20])!;
    const nr = s.drawing.runs[0]!;
    expect(runLengthIn(nr)).toBeGreaterThanOrEqual(MIN_RUN_IN);
    expect(Math.round(runLengthIn(nr))).toBe(Math.round(Math.hypot(10, 20)));
  });
  it("a typed length is replaced by the finger's distance (whole inches); the downspout stays on the line, not past the new end", () => {
    const d: Drawing = { runs: [run("a", [0, 0], [600, 0], { lengthIn: 600 })], downspouts: [{ id: "d", runId: "a", atIn: 590, shape: "rect", size: "2x3", material: "aluminum" } as never] };
    const s = swingEnd(d, "a", 1, [150, 260])!;
    expect(s.drawing.runs[0]!.lengthIn).toBe(Math.round(Math.hypot(150, 260)));
    const n = Math.round(runLengthIn(s.drawing.runs[0]!));
    expect(s.drawing.downspouts[0]!.atIn).toBe(n);
  });
});

describe("the stroke: lift keeps the swing; «Отменить» has the drawing from before", () => {
  it("a swung pull ends where the finger lifts (held at 45°); a canceled one keeps nothing", () => {
    const before = one({ lengthIn: 600 });
    const g = { kind: "pull" as const, id: "a", end: 1 as const, before, swung: true };
    const next = finishStroke(g, before, at(44, 400), 20, false, { id: "x", attrs });
    expect(dirOf(next.runs[0]!, 1)).toBeCloseTo(45, 0);
    expect(finishStroke(g, before, at(44, 400), 20, true, { id: "x", attrs })).toBe(before);
    // the snapshot before the gesture is untouched: undo returns the point, the length and the downspout
    expect(before.runs[0]!.b).toEqual([600, 0]);
    expect(before.runs[0]!.lengthIn).toBe(600);
  });
  it("not swung: as before, it only grows along its own line", () => {
    const before = one();
    const g = { kind: "pull" as const, id: "a", end: 1 as const, before };
    const next = finishStroke(g, before, [700, 9], 20, false, { id: "x", attrs });
    expect(next.runs[0]!.b[1]).toBe(0);
    expect(next.runs[0]!.b[0]).toBe(700);
  });
});

describe("review of #1205", () => {
  const r = one().runs[0]!;
  it("the touch itself off the axis is not a sideways move: only the change from it counts", () => {
    const from: P = [600, 18]; // a cap is taken within a finger's radius (22 px), here 18 above the axis
    expect(pulledSide(r, 1, [700, 18], 14, from)).toBe(false); // along, keeping its offset: a pull, the length changes
    expect(pulledSide(r, 1, [700, 30], 14, from)).toBe(false); // 12 more: under the threshold
    expect(pulledSide(r, 1, [700, 33], 14, from)).toBe(true); // 15 more: across
    expect(pulledSide(r, 1, [700, 3], 14, from)).toBe(true); // 15 back across the axis
    expect(pulledSide(r, 1, [700, 18], 14)).toBe(true); // without the touch point (as before) the offset alone would turn it
  });
  it("the threshold is 14 screen px at any zoom", () => {
    expect(pullSideIn(1)).toBe(14);
    expect(pullSideIn(0.5)).toBe(28);
    expect(pullSideIn(2)).toBe(7);
    const from: P = [600, 0];
    expect(pulledSide(r, 1, [700, 27], pullSideIn(0.5), from)).toBe(false);
    expect(pulledSide(r, 1, [700, 29], pullSideIn(0.5), from)).toBe(true);
    expect(pulledSide(r, 1, [700, 6], pullSideIn(2), from)).toBe(false);
    expect(pulledSide(r, 1, [700, 8], pullSideIn(2), from)).toBe(true);
  });
  it("on another gutter's end there is no new frame; the lift keeps the last one, not the drawing from before", () => {
    // another gutter ends at (300, 300): the end swung to it would land on it
    const d: Drawing = { runs: [run("a", [0, 0], [600, 0]), run("o", [300, 300], [300, 900])], downspouts: [] };
    expect(swingEnd(d, "a", 1, [300, 300])).toBeNull();
    const last = swingEnd(d, "a", 1, [200, 200])!.drawing; // the previous frame
    const g = { kind: "pull" as const, id: "a", end: 1 as const, before: d, swung: true, held: null };
    expect(finishStroke(g, last, [300, 300], 20, false, { id: "x", attrs })).toBe(last);
  });
  it("the length is the finger's distance, whole: 405″ at 45° is 405″ (not 404.46″ of the rounded point)", () => {
    const s = swingEnd(one(), "a", 1, at(45, 405))!;
    expect(s.snapped).toBe(true);
    expect(s.drawing.runs[0]!.lengthIn).toBe(405);
    expect(runLengthIn(s.drawing.runs[0]!)).toBe(405);
  });
  it("hysteresis: entered within 7°, held to 9°, left beyond; not entered between 7° and 9° from outside", () => {
    const out = SNAP_ANGLE_DEG + 1; // 8° off the step
    expect(swingEnd(one(), "a", 1, at(45 + out, 400))!.snapped).toBe(false); // from outside: not entered
    const entered = swingEnd(one(), "a", 1, at(45 + SNAP_ANGLE_DEG - 0.5, 400))!;
    expect(entered.snapped).toBe(true);
    expect(entered.step).toBeCloseTo(Math.PI / 4, 6);
    const held = swingEnd(one(), "a", 1, at(45 + out, 400), entered.step)!; // 8° off, held: stays
    expect(held.snapped).toBe(true);
    expect(dirOf(held.drawing.runs[0]!, 1)).toBeCloseTo(45, 0);
    const left = swingEnd(one(), "a", 1, at(45 + SNAP_ANGLE_DEG + SNAP_LEAVE_EXTRA_DEG + 0.5, 400), entered.step)!;
    expect(left.snapped).toBe(false);
    expect(left.step).toBeNull();
  });
  it("sideways stays swung until the lift: the finger back on the axis keeps the swing (the stroke's `swung` is sticky)", () => {
    const before = one();
    const g = { kind: "pull" as const, id: "a", end: 1 as const, before, swung: true, held: null };
    const next = finishStroke(g, before, [700, 0], 20, false, { id: "x", attrs });
    // on the axis the end is at the old direction, 700 away: a swung stroke measures from the standing end, as a swing
    expect(next.runs[0]!.b).toEqual([700, 0]);
    expect(next.runs[0]!.lengthIn).toBe(700);
  });
});
