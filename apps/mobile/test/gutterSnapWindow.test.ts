/**
 * #818 review of the director (12.11): the magnets' windows are widths in the finger's pixels, not angles at the far end — no dead
 * zone on a long gutter («стоит на месте, потом прыгает»); another gutter's end is a magnet in EVERY mode (along, across, the joint of
 * a corner) and every time the finger comes back to it; a joint of three ends is not moved.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { cornerMovable, HELD_ORIGINAL, moveCorner, swingEnd } from "../src/modules/gutters/canvas/edit";
import { findCorners, type Drawing, type DrawnRun, type P } from "../src/modules/gutters/geometry";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const run = (id: string, a: P, b: P): DrawnRun => ({ id, a, b, attrs });
const TOL = 12; // plan inches: the width of a window (≈ 11 px at 1 px per inch)

describe("windows are widths, not angles: a long gutter has no dead zone", () => {
  const long = (): Drawing => ({ runs: [run("a", [0, 0], [360, 0])], downspouts: [] }); // 30 ft
  it("an end of a 30 ft gutter held in its direction: a finger 6″ across stays on the axis, 30″ across leaves it at once (no ~57″ dead zone)", () => {
    const on = swingEnd(long(), "a", 1, [360, 6], HELD_ORIGINAL, TOL)!;
    expect(on.drawing.runs[0]!.b[1]).toBe(0);
    const off = swingEnd(long(), "a", 1, [360, 30], HELD_ORIGINAL, TOL)!;
    expect(off.drawing.runs[0]!.b[1]).toBeGreaterThanOrEqual(28);
  });
  it("small steps across: the end is on the axis up to the window, then follows the finger; the biggest jump is the window, not feet", () => {
    let prev = 0;
    let held: number | null = HELD_ORIGINAL;
    let jump = 0;
    for (let y = 0; y <= 60; y += 2) {
      const sw: NonNullable<ReturnType<typeof swingEnd>> = swingEnd(long(), "a", 1, [360, y], held, TOL)!;
      held = sw.step;
      const by = sw.drawing.runs[0]!.b[1];
      jump = Math.max(jump, Math.abs(by - prev));
      prev = by;
    }
    expect(prev).toBeGreaterThanOrEqual(58); // follows the finger at the end
    expect(jump).toBeLessThanOrEqual(TOL * 1.5 + 2);
  });
  it("small steps along the long side of an L corner (30′×30′): the joint follows the finger on A's axis step by step, no standing and no jump", () => {
    const L: Drawing = { runs: [run("A", [0, 0], [360, 0]), run("B", [360, 0], [360, 360])], downspouts: [] };
    let held: [boolean, boolean] = [true, true];
    let last = 360;
    for (let x = 362; x <= 420; x += 2) {
      const mv = moveCorner(L, "c:A:B", [x, 5], held, TOL)!;
      held = mv.held;
      const jx = mv.drawing.runs[0]!.b[0];
      // B (held straight) lets go at 1.5 × the window (18″): until then the joint stands, then it catches up with the finger — a jump of
      // the window, not feet; the same on any length
      expect(jx - last).toBeLessThanOrEqual(TOL * 1.5 + 2);
      expect(jx - last).toBeGreaterThanOrEqual(0);
      last = jx;
    }
    expect(last).toBeGreaterThanOrEqual(418);
  });
});

describe("another gutter's end is a magnet every time", () => {
  const two = (): Drawing => ({ runs: [run("a", [0, 0], [600, 0]), run("o", [300, 300], [300, 900])], downspouts: [] });
  it("an end taken (across): near → sticks; away → free; back → sticks again; five times; a held one is left only past 1.5× the window", () => {
    let on: P | null = null;
    for (let i = 0; i < 5; i++) {
      const near = swingEnd(two(), "a", 1, [304, 303], null, TOL, on)!;
      expect(near.end).toEqual([300, 300]);
      on = near.end!;
      const mid = swingEnd(two(), "a", 1, [300 + 14, 300 + 4], null, TOL, on)!; // 14.6″ away: still held (≤ 18″)
      expect(mid.end).toEqual([300, 300]);
      const far = swingEnd(two(), "a", 1, [330, 330], null, TOL, on)!;
      expect(far.end).toBeUndefined();
      expect(far.drawing.runs[0]!.b).not.toEqual([300, 300]);
      on = null;
    }
  });
  it("an end taken along its own line also sticks (the end of another gutter lies on its axis)", () => {
    const d: Drawing = { runs: [run("a", [0, 0], [400, 0]), run("o", [600, 2], [600, 700])], downspouts: [] };
    expect(swingEnd(d, "a", 1, [596, 5], HELD_ORIGINAL, TOL)!.end).toEqual([600, 2]);
  });
  it("a corner's joint: near another end → exactly on it, away → free, back → on it again (several times)", () => {
    const d: Drawing = { runs: [run("A", [0, 0], [310, 290]), run("B", [310, 290], [600, 0]), run("O", [200, 80], [200, 600])], downspouts: [] };
    let on: P | null = null;
    for (let i = 0; i < 4; i++) {
      const near = moveCorner(d, "c:A:B", [203, 83], [false, false], TOL, on)!;
      expect(near.end).toEqual([200, 80]);
      on = near.end!;
      const far = moveCorner(d, "c:A:B", [250, 130], [false, false], TOL, on)!;
      expect(far.end).toBeUndefined();
      on = null;
    }
  });
  it("released while snapped: the gutters meet there (a corner found)", () => {
    const sw = swingEnd(two(), "a", 1, [303, 302], null, TOL)!;
    const o = sw.drawing.runs.find((r) => r.id === "o")!;
    expect(findCorners({ runs: [sw.drawing.runs[0]!, o] }).length).toBe(1);
  });
});

describe("a joint of three ends is not moved", () => {
  const T: Drawing = { runs: [run("A", [0, 0], [300, 300]), run("B", [300, 300], [600, 0]), run("C", [300, 300], [300, 700])], downspouts: [] };
  it("every pair of the joint is refused: cornerMovable false, moveCorner null", () => {
    const ids = findCorners(T).map((c) => c.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    for (const id of ids) {
      expect(cornerMovable(T, id)).toBe(false);
      expect(moveCorner(T, id, [320, 320], [false, false], TOL)).toBeNull();
    }
  });
});

import { cornerTick, drawSnap, drawTick, pullTick } from "../src/modules/gutters/canvas/edit";

describe("the ticks (DS §15.6, table «место → вибрация» in spec 33): selection on EVERY snap on entering it", () => {
  const two = (): Drawing => ({ runs: [run("a", [0, 0], [600, 0]), run("o", [300, 300], [300, 900])], downspouts: [] });
  it("pull: onto another end → a tick; stays → none; away and back → a tick again (each time)", () => {
    const st: { held: number | null; onEnd: P | null } = { held: null, onEnd: null };
    let ticks = 0;
    for (const p of [[304, 303], [305, 304], [330, 330], [304, 303], [304, 303], [400, 100], [304, 303]] as P[]) {
      const sw = swingEnd(two(), "a", 1, p, st.held, TOL, st.onEnd)!;
      if (pullTick(sw, st)) ticks++;
      st.held = sw.step;
      st.onEnd = sw.end ?? null;
    }
    // onto the end (1), [330,330] is on the 45° step of the gutter (2), back onto the end (3), stays, free air, onto the end again (4)
    expect(ticks).toBe(4);
  });
  it("pull: a step of 45° and the gutter's own direction tick on entering, not on every move inside", () => {
    const d: Drawing = { runs: [run("a", [0, 0], [600, 0])], downspouts: [] };
    const st: { held: number | null; onEnd: P | null } = { held: HELD_ORIGINAL, onEnd: null };
    const seq: P[] = [[600, 4], [600, 300], [300 + 3, 300], [300 + 5, 300 - 2], [600, 300], [600, 3]];
    const out: boolean[] = [];
    for (const p of seq) {
      const sw = swingEnd(d, "a", 1, p, st.held, TOL, st.onEnd)!;
      out.push(pullTick(sw, st));
      st.held = sw.step;
      st.onEnd = sw.end ?? null;
    }
    // [0] held in the own direction since the touch: none; [1] free air (27°): none; [2] a step of 45°: tick; [3] inside it: none;
    // [4] leaving for the air: none; [5] the own direction again: tick
    expect(out).toEqual([false, false, true, false, false, true]);
  });
  it("corner: a side onto a step / its own direction, the joint onto another end — each a tick on entering", () => {
    const d: Drawing = { runs: [run("A", [0, 0], [310, 290]), run("B", [310, 290], [600, 0]), run("O", [200, 80], [200, 600])], downspouts: [] };
    const st: { held: [boolean, boolean]; onEnd: P | null } = { held: [false, false], onEnd: null };
    let ticks = 0;
    for (const p of [[203, 83], [204, 84], [260, 140], [203, 83]] as P[]) {
      const mv = moveCorner(d, "c:A:B", p, st.held, TOL, st.onEnd)!;
      if (cornerTick(mv, st)) ticks++;
      st.held = mv.held;
      st.onEnd = mv.end ?? null;
    }
    expect(ticks).toBeGreaterThanOrEqual(3 - 1);
    expect(cornerTick({ held: [false, false] }, { held: [true, true] })).toBe(false); // leaving ticks nothing
  });
  it("drawing: onto another end or a step of 45° from the start; none while it stays; again after leaving", () => {
    const d: Drawing = { runs: [run("o", [300, 300], [300, 900])], downspouts: [] };
    const a: P = [0, 0];
    const keys = [[200, 90], [200, 3], [201, 2], [300, 302], [302, 301], [160, 220], [298, 299]].map((p) => drawSnap(d, a, p as P, TOL));
    expect(keys[0]).toBeNull(); // free air
    expect(keys[1]?.startsWith("s:")).toBe(true); // a step of 0°
    expect(keys[3]?.startsWith("e:")).toBe(true); // onto the end
    let prev: string | null = null, n = 0;
    for (const k of keys) {
      if (drawTick(k, prev)) n++;
      prev = k;
    }
    expect(n).toBeGreaterThanOrEqual(3);
    expect(drawTick(keys[3]!, keys[3]!)).toBe(false);
  });
});
