/**
 * #818 (founder 12.11: «свободно перемещалась и прилипала под 90°»): a free end taken and swung. Along the gutter — it only
 * grows (moveEndAlong); across it (more than the side threshold) — it turns round the other end, free, held at steps of 45°
 * relative to the neighbouring gutter (else its own old direction) within ±SNAP_ANGLE_DEG.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { finishStroke, grabbedEnd, HELD_ORIGINAL, MIN_RUN_IN, SNAP_LEAVE_RATIO, swingEnd } from "../src/modules/gutters/canvas/edit";
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

describe("swingEnd: the other end stands, the end follows the finger", () => {
  it("free angle outside the window: the length is the finger's distance, the direction the finger's", () => {
    const s = swingEnd(one(), "a", 1, [300, 450])!; // 56.3° from the old direction: 11° from 45° — free
    expect(s.snapped).toBe(false);
    const nr = s.drawing.runs[0]!;
    expect(nr.a).toEqual([0, 0]);
    expect(runLengthIn(nr)).toBeCloseTo(Math.hypot(300, 450), 0);
    expect(dirOf(nr, 1)).toBeCloseTo(56.3, 0);
  });
  it("held at 45° and 90° of the old direction (no neighbour) within the window (±7° at 400″ with the default width), not outside", () => {
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
    const g = { kind: "pull" as const, id: "a", end: 1 as const, before };
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
  it("another gutter's end is a magnet: the end lands exactly on it, and the lift keeps that (a corner forms)", () => {
    const d: Drawing = { runs: [run("a", [0, 0], [600, 0]), run("o", [300, 300], [300, 900])], downspouts: [] };
    const sw = swingEnd(d, "a", 1, [303, 302])!;
    expect(sw.end).toEqual([300, 300]);
    expect(sw.snapped).toBe(true);
    expect(sw.drawing.runs[0]!.b).toEqual([300, 300]);
    const g = { kind: "pull" as const, id: "a", end: 1 as const, before: d, held: null };
    expect(finishStroke(g, d, [303, 302], 20, false, { id: "x", attrs }).runs[0]!.b).toEqual([300, 300]);
  });
  it("the length is the finger's distance, whole: 405″ at 45° is 405″ (not 404.46″ of the rounded point)", () => {
    const s = swingEnd(one(), "a", 1, at(45, 405))!;
    expect(s.snapped).toBe(true);
    expect(s.drawing.runs[0]!.lengthIn).toBe(405);
    expect(runLengthIn(s.drawing.runs[0]!)).toBe(405);
  });
  it("hysteresis: entered within the window (7° at 400″), held to 1.5 × it, left beyond; not entered between from outside", () => {
    const out = SNAP_ANGLE_DEG + 1; // 8° off the step
    expect(swingEnd(one(), "a", 1, at(45 + out, 400))!.snapped).toBe(false); // from outside: not entered
    const entered = swingEnd(one(), "a", 1, at(45 + SNAP_ANGLE_DEG - 0.5, 400))!;
    expect(entered.snapped).toBe(true);
    expect(entered.step).toBeCloseTo(Math.PI / 4, 6);
    const held = swingEnd(one(), "a", 1, at(45 + out, 400), entered.step)!; // 8° off, held: stays
    expect(held.snapped).toBe(true);
    expect(dirOf(held.drawing.runs[0]!, 1)).toBeCloseTo(45, 0);
    const left = swingEnd(one(), "a", 1, at(45 + SNAP_ANGLE_DEG + 5, 400), entered.step)!;
    expect(left.snapped).toBe(false);
    expect(left.step).toBeNull();
  });
  it("the finger back on the axis: the end is straight again, 700 away (no sticky swing any more: the window of the old direction decides)", () => {
    const before = one();
    const g = { kind: "pull" as const, id: "a", end: 1 as const, before, held: HELD_ORIGINAL };
    const next = finishStroke(g, before, [700, 0], 20, false, { id: "x", attrs });
    expect(next.runs[0]!.b).toEqual([700, 0]);
  });
});

describe("the end is taken by the ring or a long press and follows the finger (#818, 12.11)", () => {
  it("the old direction is a magnet: pulled along (a wobble of ±6°) it stays straight and only grows — a typed length keeps its fraction", () => {
    const d = one({ lengthIn: 600.1875 });
    for (const wob of [0, 3, -4, 6, -6]) {
      const s = swingEnd(d, "a", 1, at(wob, 700), HELD_ORIGINAL)!;
      expect(s.step, `${wob}°`).toBe(HELD_ORIGINAL);
      expect(s.drawing.runs[0]!.b[1], `${wob}°`).toBe(0);
      expect(s.drawing.runs[0]!.b[0], `${wob}°`).toBeGreaterThan(690);
      expect(s.drawing.runs[0]!.lengthIn, `${wob}°`).toBeCloseTo(600.1875 + (s.drawing.runs[0]!.b[0] - 600), 3); // the fraction stays
    }
  });
  it("held in the old direction to ±9°, then it leaves for a step or the air; from the air a step of 45° wins over the old direction", () => {
    expect(swingEnd(one(), "a", 1, at(5, 700), HELD_ORIGINAL)!.step).toBe(HELD_ORIGINAL);
    expect(swingEnd(one(), "a", 1, at(8, 700), HELD_ORIGINAL)!.step).toBeNull();
    // with a neighbour at the standing end the steps are its (a right angle to it), the gutter itself 3° off one: the finger near the
    // step, not held in the old direction, is caught by the STEP
    const slant: Drawing = { runs: [run("n", [0, 0], [0, -500]), run("a", [0, 0], [599, 31])], downspouts: [] };
    const toStep = swingEnd(slant, "a", 1, at(1, 700), null)!;
    expect(toStep.snapped).toBe(true);
    expect(toStep.step).toBeCloseTo(Math.PI / 2, 6);
    const nr = toStep.drawing.runs.find((x) => x.id === "a")!;
    expect(Math.abs(dirOf(nr, 1))).toBeLessThan(0.7); // exactly square to the neighbour
    // …but the touch itself changes nothing (held in the old direction at the start)
    expect(swingEnd(slant, "a", 1, slant.runs[1]!.b, HELD_ORIGINAL)!.drawing).toBe(slant);
  });
  it("it moves by the finger's move from the touch: it never jumps to the finger (a cap is taken within a finger's radius)", () => {
    const d = one();
    expect(grabbedEnd(d, "a", 1, [600, 18], [650, 18])).toEqual([650, 0]);
    expect(grabbedEnd(d, "a", 1, [600, 18], [600, 18])).toEqual([600, 0]);
    expect(grabbedEnd(d, "a", 0, [4, -9], [4, -59])).toEqual([0, -50]);
    // the touch with no move — the same drawing, whatever the offset
    const s = swingEnd(d, "a", 1, grabbedEnd(d, "a", 1, [600, 18], [600, 18]), HELD_ORIGINAL)!;
    expect(s.drawing).toBe(d);
  });
  it("on a short gutter taken off its axis: the move is what counts, so the angle does not jump (it would at 18 px off a 40 px line)", () => {
    const short: Drawing = { runs: [run("a", [0, 0], [40, 0])], downspouts: [] };
    const first = swingEnd(short, "a", 1, grabbedEnd(short, "a", 1, [40, 18], [42, 18]), HELD_ORIGINAL)!;
    expect(first.step).toBe(HELD_ORIGINAL);
    expect(first.drawing.runs[0]!.b[1]).toBe(0);
  });
});
