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
  it("small steps along the long side of an L corner (30′×30′): B (held straight) stands until the finger is 1.5 windows off its line, then the joint catches up: a jump of the window, the same on any length", () => {
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

const TICKS_CORNER = 2, TICKS_DRAW = 3;
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
    // onto the other end (1); [204,84] stays; [260,140] free air (the sides leave their rays); onto the end again (2)... counted exactly below
    expect(ticks).toBe(TICKS_CORNER);
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
    expect(n).toBe(TICKS_DRAW);
    expect(drawTick(keys[3]!, keys[3]!)).toBe(false);
  });
});

describe("review of the director 12.11: no tick on a wobble; no snap onto the neighbour's FAR end", () => {
  it("drawing: a finger wobbling ±1″ at the edge of a step's window for 40 frames — exactly ONE tick (hysteresis, not equality of rounded points)", () => {
    const d: Drawing = { runs: [], downspouts: [] };
    const a: P = [0, 0];
    let prev: string | null = null, ticks = 0;
    for (let i = 0; i < 40; i++) {
      const y = i % 2 ? 50 : 48; // 6.9° / 7.1° at 400″: the edge of the window of ±7°
      const key = drawSnap(d, a, [400, y], TOL, undefined, prev);
      if (drawTick(key, prev)) ticks++;
      prev = key;
    }
    expect(ticks).toBe(1);
  });
  it("drawing: a wobble at the edge of another end's window — exactly one tick; leaving it (past 1.5 ×) and coming back — another", () => {
    const d: Drawing = { runs: [run("o", [300, 300], [300, 900])], downspouts: [] };
    const a: P = [0, 0];
    let prev: string | null = null, ticks = 0;
    const frames: P[] = [];
    for (let i = 0; i < 30; i++) frames.push([300 + (i % 2 ? TOL + 1 : TOL - 1), 300]); // 11″ / 13″ from the end
    frames.push([300 + 3 * TOL, 150], [300 + TOL - 1, 300]); // away (into the free air), back
    for (const f of frames) {
      const key = drawSnap(d, a, f, TOL, undefined, prev);
      if (drawTick(key, prev)) ticks++;
      prev = key;
    }
    expect(ticks).toBe(2);
  });
  it("swingEnd: an end of A does not stick to the FAR end of B, which meets A's standing end (A would lie on B: two corners with one id, a double count)", () => {
    const d: Drawing = { runs: [run("A", [0, 0], [600, 0]), run("B", [0, 0], [0, 300])], downspouts: [] };
    // the finger is at B's far end: A would lie on B — no frame at all (the last one stays), and no snap
    expect(swingEnd(d, "A", 1, [3, 298], null, TOL)).toBeNull();
    // the finger a little to the side: a frame, and it is not on B's end; one corner A–B, no second one
    const sw = swingEnd(d, "A", 1, [150, 250], null, TOL)!;
    expect(sw.end).toBeUndefined();
    expect(sw.drawing.runs[0]!.b).not.toEqual(sw.drawing.runs[1]!.b);
    expect(findCorners(sw.drawing)).toHaveLength(1);
  });
  it("moveCorner: the joint does not stick to the other end of a gutter that meets a far end of the pair", () => {
    // A: (0,0)-(300,300) joint, B: (300,300)-(600,0); C starts at A's far end (0,0) and ends at (0,300)
    const d: Drawing = { runs: [run("A", [0, 0], [300, 300]), run("B", [300, 300], [600, 0]), run("C", [0, 0], [0, 300])], downspouts: [] };
    const mv = moveCorner(d, "c:A:B", [2, 298], [false, false], TOL, null);
    expect(mv).not.toBeNull(); // a frame is drawn (the joint follows the finger)…
    expect(mv!.end).toBeUndefined(); // …but it does not stick to C's other end
    expect(mv!.drawing.runs[0]!.b).not.toEqual([0, 300]);
  });
  it("moveCorner: folded back on itself (the sides within MIN_TURN_DEG) is no frame, as one in a line", () => {
    const d: Drawing = { runs: [run("A", [0, 0], [150, 150]), run("B", [150, 150], [100, 0])], downspouts: [] };
    // the far ends (0,0) and (100,0) seen from (300,5) lie in nearly one direction: the angle at the joint is ~0°
    expect(moveCorner(d, "c:A:B", [300, 5], [false, false], TOL, null)).toBeNull();
  });
});

describe("review 3 of the director: the cut at ±180° (west) and an end laid back onto its neighbour", () => {
  it("drawing to the WEST (180°): a wobble of ±1″ for 40 frames — exactly ONE tick", () => {
    const d: Drawing = { runs: [], downspouts: [] };
    const a: P = [400, 0];
    let prev: string | null = null, ticks = 0;
    for (let i = 0; i < 40; i++) {
      const key = drawSnap(d, a, [0, i % 2 ? 1 : -1], TOL, undefined, prev); // atan2 gives π−ε, then −π+ε
      expect(key === null || key === "s:180").toBe(true);
      if (drawTick(key, prev)) ticks++;
      prev = key;
    }
    expect(ticks).toBe(1);
  });
  it("an end straightened into a line with its neighbour (180° to it), the finger wobbling across the cut: exactly ONE tick", () => {
    // B ends at the standing end (0,0) coming from the east; A goes west: 180° to B
    const d: Drawing = { runs: [run("B", [300, 0], [0, 0]), run("A", [0, 0], [-300, 100])], downspouts: [] };
    const st: { held: number | null; onEnd: P | null } = { held: null, onEnd: null };
    let ticks = 0;
    for (let i = 0; i < 40; i++) {
      const sw = swingEnd(d, "A", 1, [-400, i % 2 ? 1 : -1], st.held, TOL, st.onEnd)!;
      expect(sw).not.toBeNull();
      if (pullTick(sw, st)) ticks++;
      st.held = sw.step;
      st.onEnd = sw.end ?? null;
    }
    expect(ticks).toBe(1);
  });
  it("swingEnd: a step of 0° to the neighbour (A laid on B) is no frame; so is anything under MIN_TURN_DEG; 90° and 180° are", () => {
    const d: Drawing = { runs: [run("B", [300, 0], [0, 0]), run("A", [0, 0], [-300, 100])], downspouts: [] };
    expect(swingEnd(d, "A", 1, [400, 3], null, TOL)).toBeNull(); // along B
    expect(swingEnd(d, "A", 1, [400, 60], null, TOL)).toBeNull(); // ~9° off B
    expect(swingEnd(d, "A", 1, [3, 400], null, TOL)).not.toBeNull(); // 90°
    expect(swingEnd(d, "A", 1, [-400, 3], null, TOL)).not.toBeNull(); // straight on
  });
});
