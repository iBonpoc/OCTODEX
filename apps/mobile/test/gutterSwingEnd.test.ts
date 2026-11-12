/**
 * #818 (founder 12.11: «свободно перемещалась и прилипала под 90°»): a free end taken and swung. Along the gutter — it only
 * grows (moveEndAlong); across it (more than the side threshold) — it turns round the other end, free, held at steps of 45°
 * relative to the neighbouring gutter (else its own old direction) within ±SNAP_ANGLE_DEG.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { finishStroke, MIN_RUN_IN, pulledSide, swingEnd } from "../src/modules/gutters/canvas/edit";
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
  it("a typed length is dropped (it no longer matches); the downspout stays on the line, not past the new end", () => {
    const d: Drawing = { runs: [run("a", [0, 0], [600, 0], { lengthIn: 600 })], downspouts: [{ id: "d", runId: "a", atIn: 590, shape: "rect", size: "2x3", material: "aluminum" } as never] };
    const s = swingEnd(d, "a", 1, [150, 260])!;
    expect(s.drawing.runs[0]!.lengthIn).toBeUndefined();
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
