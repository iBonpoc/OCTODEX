/**
 * Editing the drawing with a finger (docs/specs/33-gutters-canvas.md П20.4 M4b). Pure: plan inches in, a new drawing
 * out. Tolerances come from the screen (a finger is ~22 px whatever the zoom) and are passed in as inches.
 * Prilipanie (snapping) is geometry.ts: to the ends of other lines first, else the direction to 45° steps.
 */
import { findCorners, runEnds, wouldDuplicate, overlapsRun, chainOf, houseSides, sameStory, nearestRun, projectOnRun, runLengthIn, MIN_TURN_DEG, SNAP_ANGLE_DEG, snapDirection, snapPoint, type CornerChoice, type Drawing, type DrawnDownspout, type DrawnRun, type FoundCorner, type P } from "../geometry";
import type { Story } from "./scene";
import { changeDs, changeRun, MAX_RUN_IN, MILL_ONLY, type DsAttrs } from "./attrs";
import type { Choices } from "../settings";
import { DENOM } from "./format";

/** shorter than this is a slip of the finger, not a line */
export const MIN_RUN_IN = 12;

export const endsOf = (d: Pick<Drawing, "runs">, except?: string): P[] => d.runs.filter((r) => r.id !== except).flatMap((r) => [r.a, r.b]);

/** where a line starts: on an existing end if the finger is near one */
export const startAt = (d: Drawing, p: P, tolIn: number): P => snapPoint(p, endsOf(d), tolIn);

/** where a line being drawn ends: an existing end wins, else the direction snaps to 45° steps */
export function endAt(d: Drawing, a: P, p: P, tolIn: number, except?: string): P {
  const ends = endsOf(d, except).filter((e) => e[0] !== a[0] || e[1] !== a[1]);
  const s = snapPoint(p, ends, tolIn);
  const snapped = ends.some((e) => e[0] === s[0] && e[1] === s[1]);
  return snapped ? s : snapDirection(a, s);
}

/**
 * What a line being drawn is held by right now (for the tick under the finger, DS §15.6): another gutter's end (its point as the key),
 * a step of 45° from the start (the step as the key), or nothing (null). The same rules as `endAt`, but decided by the finger's
 * DISTANCE / ANGLE with a hysteresis (`prev` — the key of the last frame: left only past 1.5 × the window), not by whether the rounded
 * point equals a snapped one — a wobble of an inch at the edge of a window gave a tick every other frame.
 */
/** the angle between two directions, 0…π, across the cut at ±180° */
const angDiff = (a: number, b: number): number => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);

export function drawSnap(d: Drawing, a: P, p: P, tolIn: number, except?: string, prev: string | null = null): string | null {
  const ends = endsOf(d, except).filter((e) => e[0] !== a[0] || e[1] !== a[1]);
  let best: P | null = null, bd = Infinity;
  for (const e of ends) {
    const dist = Math.hypot(e[0] - p[0], e[1] - p[1]);
    const lim = prev === `e:${e[0]},${e[1]}` ? tolIn * SNAP_LEAVE_RATIO : tolIn;
    if (dist <= lim && dist < bd) { best = e; bd = dist; }
  }
  if (best) return `e:${best[0]},${best[1]}`;
  const v: P = [p[0] - a[0], p[1] - a[1]];
  if (Math.hypot(v[0], v[1]) < 1) return null;
  const raw = Math.atan2(v[1], v[0]);
  const step = Math.PI / 4;
  const m = Math.round(raw / step) * step;
  const deg = Math.round((m * 180) / Math.PI);
  const key = `s:${deg === -180 ? 180 : deg}`; // west is one step: −180° and 180° are the same key (a wobble across the cut gave a tick every frame)
  const win = ((prev === key ? SNAP_ANGLE_DEG + 2 : SNAP_ANGLE_DEG) * Math.PI) / 180;
  return angDiff(raw, m) <= win ? key : null;
}

export function addRun(d: Drawing, id: string, a: P, b: P, attrs: DrawnRun["attrs"]): Drawing {
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_RUN_IN) return d;
  const next: Drawing = { ...d, runs: [...d.runs, { id, a, b, attrs: { ...attrs } }] };
  // joined to a line whose face side was set by hand: the new gutter takes the same face (founder 09.11: «две левые
  // заглушки» — it took its own side from the drawing's centre, the line had two faces)
  const chain = chainOf(next, id);
  const set = next.runs.find((r) => r.id !== id && chain.has(r.id) && r.houseSide);
  return set ? alongChain(next, set.id, set.houseSide!) : next;
}

const near1 = (p: P, q: P) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 1;
const otherSide = (s: "L" | "R"): "L" | "R" => (s === "L" ? "R" : "L");

/**
 * One face along a joined line: from `runId` (face side `side`) out through the joins, each gutter takes the side that
 * keeps the face on the same side of the line — the same when it goes on the same way (an end to a start), the other
 * when it is drawn the other way (start to start, end to end).
 */
export function alongChain(d: Drawing, runId: string, side: "L" | "R"): Drawing {
  const sides = new Map<string, "L" | "R">([[runId, side]]);
  const todo = [runId];
  while (todo.length) {
    const id = todo.pop()!;
    const r = d.runs.find((x) => x.id === id);
    if (!r) continue;
    const s = sides.get(id)!;
    for (const o of d.runs) {
      if (sides.has(o.id) || !sameStory(o, r)) continue;
      join: for (const theirs of [0, 1] as const) {
        for (const mine of [0, 1] as const) {
          if (near1(theirs ? r.b : r.a, mine ? o.b : o.a)) {
            sides.set(o.id, theirs !== mine ? s : otherSide(s));
            todo.push(o.id);
            break join;
          }
        }
      }
    }
  }
  return { ...d, runs: d.runs.map((r) => (sides.has(r.id) ? { ...r, houseSide: sides.get(r.id)! } : r)) };
}

export type Hit = { kind: "ds"; id: string } | { kind: "end"; id: string; end: 0 | 1 } | { kind: "run"; id: string };

/**
 * What is under the finger: the nearest of a downspout and a line's end (a downspout wins a tie), then a line. The nearest, not
 * «a downspout first»: an automatic downspout stands 12″ from the end (#1246) and must not take the touch that goes on from the end.
 */
export function hitTest(d: Drawing, p: P, tolIn: number): Hit | null {
  let best: { h: Hit; dist: number } | null = null;
  const take = (h: Hit, dist: number) => {
    if (dist <= tolIn && (!best || dist < best.dist)) best = { h, dist };
  };
  const byId = new Map(d.runs.map((r) => [r.id, r]));
  for (const s of d.downspouts) {
    const r = byId.get(s.runId);
    if (!r) continue;
    const t = Math.min(1, Math.max(0, s.atIn / (runLengthIn(r) || 1)));
    take({ kind: "ds", id: s.id }, Math.hypot(p[0] - (r.a[0] + (r.b[0] - r.a[0]) * t), p[1] - (r.a[1] + (r.b[1] - r.a[1]) * t)));
  }
  for (const r of d.runs) {
    take({ kind: "end", id: r.id, end: 0 }, Math.hypot(p[0] - r.a[0], p[1] - r.a[1]));
    take({ kind: "end", id: r.id, end: 1 }, Math.hypot(p[0] - r.b[0], p[1] - r.b[1]));
  }
  if (best) return (best as { h: Hit }).h;
  const n = nearestRun(d, p, tolIn);
  return n ? { kind: "run", id: n.runId } : null;
}

/** drag one end of a line; it sticks to other lines' ends; a typed length no longer matches, so it is dropped */
export function moveEnd(d: Drawing, runId: string, end: 0 | 1, p: P, tolIn: number): Drawing {
  const r = d.runs.find((x) => x.id === runId);
  if (!r) return d;
  const fixed = end === 0 ? r.b : r.a;
  const at = endAt(d, fixed, p, tolIn, runId);
  if (Math.hypot(at[0] - fixed[0], at[1] - fixed[1]) < MIN_RUN_IN) return d;
  // the end dropped so that the gutter lies exactly on another one (both ends shared) is no move: that would be a duplicate (#1256)
  if (lineRefused({ runs: d.runs.filter((x) => x.id !== runId) } as Drawing, fixed, at, Number(r.attrs.story) || 1, tolIn)) return d;
  const { lengthIn: _typed, ...rest } = r;
  const moved: DrawnRun = closeEnd(end === 0 ? { ...rest, a: at } : { ...rest, b: at }, end);
  // downspouts stay on the line: at most its new length
  const L = Math.round(Math.hypot(moved.b[0] - moved.a[0], moved.b[1] - moved.a[1]));
  return {
    ...d,
    runs: d.runs.map((x) => (x.id === runId ? moved : x)),
    downspouts: d.downspouts.map((s) => (s.runId === runId && s.atIn > L ? { ...s, atIn: L } : s)),
  };
}

/** a long press on a cap pulls the end when the finger goes along the gutter within this angle of its axis (either way), else it draws a new gutter from the end */
export const PULL_AXIS_DEG = 30;
/** `p` is far enough from `a` (more than `tolIn`) and its direction from `a` is within PULL_AXIS_DEG of the run's axis */
export function alongAxis(r: Pick<DrawnRun, "a" | "b">, a: P, p: P, tolIn: number): boolean {
  const vx = p[0] - a[0], vy = p[1] - a[1];
  const v = Math.hypot(vx, vy);
  const ax = r.b[0] - r.a[0], ay = r.b[1] - r.a[1];
  const L = Math.hypot(ax, ay);
  if (v <= tolIn || L === 0) return false;
  return Math.abs(vx * ax + vy * ay) / (v * L) >= Math.cos((PULL_AXIS_DEG * Math.PI) / 180);
}

/**
 * Pull a free end along its own gutter (#504, founder 11.11: «тяну за край — увеличиваю, оттягиваю дальше»): the other
 * end stays, the direction stays, the finger sets the length (the finger's distance along the gutter), from MIN_RUN_IN to
 * MAX_RUN_IN — longer and shorter. A typed length no longer matches, so it is dropped; downspouts stay on the line.
 */
export function moveEndAlong(d: Drawing, runId: string, end: 0 | 1, p: P): Drawing {
  const r = d.runs.find((x) => x.id === runId);
  if (!r) return d;
  const fixed = end === 0 ? r.b : r.a;
  const was = end === 0 ? r.a : r.b;
  const ux = was[0] - fixed[0], uy = was[1] - fixed[1];
  const L = Math.hypot(ux, uy);
  if (L === 0) return d;
  const along = ((p[0] - fixed[0]) * ux + (p[1] - fixed[1]) * uy) / L;
  const len = Math.min(MAX_RUN_IN, Math.max(MIN_RUN_IN, Math.round(along)));
  const at: P = [Math.round(fixed[0] + (ux / L) * len), Math.round(fixed[1] + (uy / L) * len)];
  if (at[0] === was[0] && at[1] === was[1]) return d;
  // a taped length grows or shrinks by what the finger pulled (as drawing on straight does, extendRun), not forgotten
  const { lengthIn: typed, ...rest } = r;
  const shift = Math.hypot(at[0] - fixed[0], at[1] - fixed[1]) - L;
  const keep = typed !== undefined ? { lengthIn: Math.min(MAX_RUN_IN, Math.max(MIN_RUN_IN, Math.round((typed + shift) * DENOM) / DENOM)) } : {};
  const moved: DrawnRun = closeEnd(end === 0 ? { ...rest, ...keep, a: at } : { ...rest, ...keep, b: at }, end);
  // never ends on another gutter's end by rounding (a corner only by the user's own act — drawing a line to it)
  if (d.runs.some((x) => x.id !== runId && sameStory(x, r) && [x.a, x.b].some((q) => Math.hypot(q[0] - at[0], q[1] - at[1]) <= 1.5))) return d;
  const n = Math.round(Math.hypot(moved.b[0] - moved.a[0], moved.b[1] - moved.a[1]));
  const was0 = Math.round(L);
  return {
    ...d,
    runs: d.runs.map((x) => (x.id === runId ? moved : x)),
    // a downspout's place is measured from the gutter's start `a`: when the start moves it keeps its place on the house
    downspouts: d.downspouts.map((s) => {
      if (s.runId !== runId) return s;
      const atIn = end === 0 ? s.atIn + (n - was0) : s.atIn;
      return { ...s, atIn: Math.min(n, Math.max(0, atIn)) };
    }),
  };
}

/**
 * «Разъединить угол» (#933): the corner is made two free ends — NOT by moving anything: both gutters keep their points
 * and lengths (a measured length is the estimate's input), and carry `openEnds` at the meeting ends, so the corner is not
 * found there and each end is an end cap. Moving that end later drops the mark (`closeEnd`).
 */
export function splitCorner(d: Drawing, corner: Pick<FoundCorner, "runs">, offsetIn = 0): Drawing {
  const ids = new Map(corner.runs.map((x) => [x.id, x.end] as const));
  if (!corner.runs.every((x) => d.runs.some((r) => r.id === x.id))) return d;
  const marked = d.runs.map((r) => (ids.has(r.id) ? { ...r, attrs: { ...r.attrs, openEnds: { ...r.attrs.openEnds, [ids.get(r.id) ? "b" : "a"]: true } } } : r));
  if (offsetIn <= 0) return { ...d, runs: marked };
  // #1282: a freed end that still lies on a point where another gutter of the storey has an end (a third end at the joint) is
  // set back along its OWN gutter, so it can be seen, taken and pulled; the measured length stays what it was. Set back `offsetIn`,
  // at most a share of the gutter (SET_BACK_SHARE): a short gutter is freed too — never left on the joint (#1338 review: at a small
  // scale `offsetIn` is tens of inches)
  const others = (r: DrawnRun, q: P) => marked.some((o) => !ids.has(o.id) && sameStory(o, r) && [o.a, o.b].some((e) => Math.hypot(e[0] - q[0], e[1] - q[1]) <= SAME_POINT_IN));
  /** the share of its drawn length each moved end went back (by run id), and which end */
  const moved = new Map<string, { end: 0 | 1; k: number }>();
  const runs = marked.map((r) => {
    const end = ids.get(r.id);
    if (end === undefined) return r;
    const at = end ? r.b : r.a, far = end ? r.a : r.b;
    const len = Math.hypot(far[0] - at[0], far[1] - at[1]);
    if (len <= 0 || !others(r, at)) return r;
    const k = Math.min(offsetIn, len * SET_BACK_SHARE) / len;
    moved.set(r.id, { end, k });
    const to: P = [at[0] + (far[0] - at[0]) * k, at[1] + (far[1] - at[1]) * k];
    return { ...r, lengthIn: runLengthIn(r), ...(end === 0 ? { a: to } : { b: to }) };
  });
  // a downspout stays at the same POINT of the plan: its place along the gutter is a share of the length (`atIn` ÷ the measured length)
  const downspouts = d.downspouts.map((s) => {
    const m = moved.get(s.runId);
    const r = d.runs.find((x) => x.id === s.runId);
    if (!m || !r) return s;
    const len = runLengthIn(r) || 1;
    const t = Math.min(1, Math.max(0, s.atIn / len));
    const t2 = m.end === 0 ? (t - m.k) / (1 - m.k) : t / (1 - m.k);
    return { ...s, atIn: Math.round(Math.min(1, Math.max(0, t2)) * len * 1000) / 1000 };
  });
  return { ...d, runs, downspouts };
}

/** two ends are one point when they are within this many inches (the tolerance the corners and the magnets use) */
export const SAME_POINT_IN = 1.5;
/** a freed end goes back at most this share of its gutter: even a short gutter leaves the joint */
export const SET_BACK_SHARE = 1 / 3;

/** #1282: is `p` a point where two ends of a storey already meet (a corner)? An end let go there would make a joint of three ends (П35, not done) */
export function onCornerPoint(d: Drawing, story: DrawnRun, skip: Set<string>, p: P, tolIn: number): boolean {
  const near = (q: P) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= tolIn;
  const ends = d.runs.filter((x) => !skip.has(x.id) && sameStory(x, story)).flatMap((x) => [x.a, x.b]).filter(near);
  return ends.length >= 2 && ends.every((q) => Math.hypot(q[0] - ends[0]![0], q[1] - ends[0]![1]) <= SAME_POINT_IN);
}

export interface Swing {
  drawing: Drawing;
  /** the angle shown by the chip: between the neighbouring gutter (else the gutter's old direction) and the gutter now, whole degrees, 0–180 */
  deg: number;
  /** the direction is held at a step of 45° (the haptic tick is on entering it) */
  snapped: boolean;
  /** the step held, radians from the reference (a multiple of 45°), else null: given back to the next frame so the window has a hysteresis */
  step: number | null;
  /** the end snapped onto another gutter's end (the point of it): given back to the next frame so the snap has a hysteresis */
  end?: P;
}

/**
 * The windows of the magnets (45° steps, the gutter's own direction) are WIDTHS across the ray, in the finger's pixels (the caller
 * gives `tolIn` = px / scale), not angles at the far end: an angle of 7° is 4 ft wide on a 30 ft gutter and nothing on a 3 ft one
 * (founder 12.11: «стоит на месте, потом прыгает»). The angle is only capped, so that the windows of two steps never touch.
 */
export const SNAP_MAX_DEG = 12;
/** a magnet already held is left only past this much more than it is entered (no jitter at its edge, #818) */
export const SNAP_LEAVE_RATIO = 1.5;
/** the width of a window in plan inches when the caller gives none (tests, ≈ 7° at 400″; the screen passes its own: pixels ÷ scale) */
export const SNAP_TOL_DEFAULT_IN = 50;

/** the finger `dist` from the standing end, `diff` rad off a magnet's direction: inside its window? (`leave`: it is held already) */
export function inWindow(diff: number, dist: number, tolIn: number, leave = false): boolean {
  if (diff > Math.PI / 2) return false;
  const k = leave ? SNAP_LEAVE_RATIO : 1;
  return diff <= (SNAP_MAX_DEG * k * Math.PI) / 180 && dist * Math.sin(diff) <= tolIn * k;
}

/**
 * The end of ANOTHER gutter (same storey) the finger is near — an end is a magnet in every mode: along, across, and a corner's joint
 * (founder 12.11: «прилипает всегда»). Entered within `tolIn`, a held one (`held`) is left only past SNAP_LEAVE_RATIO × that.
 * `skip` — gutters that move (their own ends are no magnet), `stand` — the standing ends of the moving gutters: no magnet themselves,
 * nor the other end of a gutter that touches one (spec 33 П35 review: an end lay on the neighbour's far end, a double count).
 */
export function endNear(d: Drawing, story: DrawnRun, skip: Set<string>, p: P, tolIn: number, held: P | null, stand: P[] = []): P | null {
  let best: P | null = null, bd = Infinity;
  const at = (q: P, e: P) => Math.hypot(e[0] - q[0], e[1] - q[1]) <= 1.5;
  for (const x of d.runs) {
    if (skip.has(x.id) || !sameStory(x, story)) continue;
    // a gutter that touches a standing end: its OTHER end is no magnet either (the moving gutter would lie on it — two gutters with both ends shared)
    const partner = stand.some((e) => at(x.a, e) || at(x.b, e));
    for (const q of [x.a, x.b]) {
      if (partner || stand.some((e) => at(q, e))) continue;
      const dist = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const lim = held && at(q, held) ? tolIn * SNAP_LEAVE_RATIO : tolIn;
      if (dist <= lim && dist < bd) { best = q; bd = dist; }
    }
  }
  return best;
}

/** `Swing.step` of a side held in its OWN old direction (the end only grows or shrinks; a typed length keeps its fraction, as moveEndAlong) */
export const HELD_ORIGINAL = Infinity;

/** where the end goes: it moves by the finger's move from where the finger touched down — it never jumps to the finger (a cap is taken within a finger's radius) */
export function grabbedEnd(d: Drawing, runId: string, end: 0 | 1, from: P | undefined, p: P): P {
  const r = d.runs.find((x) => x.id === runId);
  if (!r || !from) return p;
  const was = end === 0 ? r.a : r.b;
  return [was[0] + (p[0] - from[0]), was[1] + (p[1] - from[1])];
}
/** the same for a corner's joint */
export function grabbedCorner(d: Drawing, cornerId: string, from: P | undefined, p: P): P {
  const c = from ? findCorners(d).find((x) => x.id === cornerId) : undefined;
  return c && from ? [c.at[0] + (p[0] - from[0]), c.at[1] + (p[1] - from[1])] : p;
}

/**
 * A free end taken and swung (#818, founder 12.11: «свободно перемещалась и прилипала под 90°»): the gutter turns round its
 * OTHER end (it stays), the end follows the finger — the length is the finger's distance (whole inches, as moveEndAlong), the
 * direction free, but held at a step of 45° relative to the neighbouring gutter at the standing end (else to the gutter's old
 * direction) within ±SNAP_ANGLE_DEG. The length is kept as the finger's distance in whole inches (`lengthIn`): the point is rounded to an inch on the plan, a diagonal's hypotenuse would not be. Downspouts stay on the line.
 */
export function swingEnd(d: Drawing, runId: string, end: 0 | 1, p: P, held: number | null = null, tolIn: number = SNAP_TOL_DEFAULT_IN, onEnd: P | null = null): Swing | null {
  const r = d.runs.find((x) => x.id === runId);
  if (!r) return null;
  const fixed = end === 0 ? r.b : r.a;
  const was = end === 0 ? r.a : r.b;
  const vx = p[0] - fixed[0], vy = p[1] - fixed[1];
  const dist = Math.hypot(vx, vy);
  if (dist === 0) return null;
  // the reference: a gutter that ends where this one stands (a corner), else this gutter's own old direction
  const nb = d.runs.find((x) => x.id !== runId && sameStory(x, r) && [x.a, x.b].some((q) => Math.hypot(q[0] - fixed[0], q[1] - fixed[1]) <= 1.5));
  const refTo: P = nb ? (Math.hypot(nb.a[0] - fixed[0], nb.a[1] - fixed[1]) <= 1.5 ? nb.b : nb.a) : was;
  const ref = Math.atan2(refTo[1] - fixed[1], refTo[0] - fixed[0]);
  const raw = Math.atan2(vy, vx);
  let delta = ((raw - ref + Math.PI * 3) % (Math.PI * 2)) - Math.PI; // (−180°, 180°]
  const step = Math.PI / 4;
  const m0 = Math.round(delta / step) * step;
  const m = m0 <= -Math.PI + 1e-9 ? Math.PI : m0; // west is one step (180°), whichever side of the cut the finger is on
  // entered within a width of `tolIn` across the ray; one already held is kept a little further (hysteresis)
  const put = (at: P, len: number, delta1: number, snapped: boolean, step: number | null, snapEnd?: P): Swing => {
    const moved: DrawnRun = closeEnd(end === 0 ? { ...r, a: at, lengthIn: len } : { ...r, b: at, lengthIn: len }, end);
    const n = Math.round(Math.hypot(moved.b[0] - moved.a[0], moved.b[1] - moved.a[1]));
    const was0 = Math.round(Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]));
    return {
      drawing: {
        ...d,
        runs: d.runs.map((x) => (x.id === runId ? moved : x)),
        downspouts: d.downspouts.map((s) => {
          if (s.runId !== runId) return s;
          const atIn = end === 0 ? s.atIn + (n - was0) : s.atIn;
          return { ...s, atIn: Math.min(n, Math.max(0, atIn)) };
        }),
      },
      deg: Math.round((Math.abs(delta1) * 180) / Math.PI),
      snapped,
      step,
      ...(snapEnd ? { end: snapEnd } : {}),
    };
  };
  // another gutter's end beats every direction: the end lands exactly on it (a corner forms on release)
  const tgt = endNear(d, r, new Set([runId]), p, tolIn, onEnd, [fixed]);
  // a joint of two ends takes no third (П35, #1282): the end is not taken there — the caller says why (`onCornerPoint`); the last frame stays
  if (tgt && onCornerPoint(d, r, new Set([runId]), tgt, SAME_POINT_IN)) return null;
  if (tgt) {
    const len = Math.round(Math.hypot(tgt[0] - fixed[0], tgt[1] - fixed[1]));
    if (len >= MIN_RUN_IN && len <= MAX_RUN_IN) {
      const dl = ((Math.atan2(tgt[1] - fixed[1], tgt[0] - fixed[0]) - ref + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      return put(tgt, len, dl, true, null, tgt);
    }
  }
  // the gutter's OWN old direction is a magnet too (founder 12.11: it stays straight while pulled along; no corridor of pixels): within
  // the window the end only grows or shrinks, as before — the finger's wobble does not bend it. It holds while it is held (the start
  // of a pull is held in it: nothing jumps at the touch); a step of 45° wins when the end comes from the free air
  const origAng = Math.atan2(was[1] - fixed[1], was[0] - fixed[0]);
  const offOrig = Math.abs(((raw - origAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const alongNow = () => {
    const dOrig = Math.abs(((origAng - ref + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return { drawing: moveEndAlong(d, runId, end, p), deg: Math.round((dOrig * 180) / Math.PI), snapped: true, step: HELD_ORIGINAL };
  };
  if (held === HELD_ORIGINAL && inWindow(offOrig, dist, tolIn, true)) return alongNow();
  const stay = held !== null && held !== HELD_ORIGINAL && inWindow(angDiff(delta, held), dist, tolIn, true);
  const stepIn = stay || inWindow(angDiff(delta, m), dist, tolIn);
  if (!stepIn && inWindow(offOrig, dist, tolIn)) return alongNow();
  const snapped = stepIn;
  const stepHeld = stay ? held : snapped ? m : null;
  if (snapped) delta = stepHeld!;
  // laid back onto the neighbour at the standing end (a turn under MIN_TURN_DEG from it, a step of 0° too): the gutters would overlap and a second, false corner would be found — no frame, as in moveCorner
  if (nb && Math.abs(delta) < (MIN_TURN_DEG * Math.PI) / 180) return null;
  const ang = ref + delta;
  const len = Math.min(MAX_RUN_IN, Math.max(MIN_RUN_IN, Math.round(dist)));
  const at: P = [Math.round(fixed[0] + Math.cos(ang) * len), Math.round(fixed[1] + Math.sin(ang) * len)];
  if (at[0] === was[0] && at[1] === was[1]) return { drawing: d, deg: Math.round((Math.abs(delta) * 180) / Math.PI), snapped, step: stepHeld };
  // never ends on another gutter's end by rounding (a corner only by the user's own act — drawing a line to it): no new frame — the caller keeps the last one
  if (d.runs.some((x) => x.id !== runId && sameStory(x, r) && [x.a, x.b].some((q) => Math.hypot(q[0] - at[0], q[1] - at[1]) <= 1.5))) return null;
  // the finger's distance is the length, whole inches, whatever the rounding of the point to an inch does to the hypotenuse
  return put(at, len, delta, snapped, stepHeld);
}

/**
 * The haptic ticks of a drag (DS §15.6, table «место → вибрация» in spec 33): `selection` on EVERY snap on entering it — a step of 45°,
 * the gutter's own direction, another gutter's end — and never twice at the edge of one (the windows have a hysteresis).
 * `prev` is the state the last frame gave back (held step, held end), `next` the frame now.
 */
export const pullTick = (next: Pick<Swing, "snapped" | "step" | "end">, prev: { held?: number | null; onEnd?: P | null }): boolean =>
  next.end ? !samePt(next.end, prev.onEnd) : next.snapped && next.step !== (prev.held ?? null);
export const cornerTick = (next: Pick<CornerMove, "held" | "end">, prev: { held: [boolean, boolean]; onEnd?: P | null }): boolean =>
  (next.held[0] && !prev.held[0]) || (next.held[1] && !prev.held[1]) || (!!next.end && !samePt(next.end, prev.onEnd));
/** a line being drawn: the key of what holds it (`drawSnap`) changed to a snap */
export const drawTick = (key: string | null, prev: string | null): boolean => !!key && key !== prev;
const samePt = (a: P, b: P | null | undefined): boolean => !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1.5;

export interface CornerMove {
  drawing: Drawing;
  /** the angle between the two sides at the joint, whole degrees 0–180 (the chip) */
  deg: number;
  /** which of the two sides (the corner's runs[0], runs[1]) is held at a step of 45° now — given back to the next frame (hysteresis) */
  held: [boolean, boolean];
  /** the joint snapped onto another gutter's end (its point): given back to the next frame (hysteresis) */
  end?: P;
}

/**
 * A corner taken and moved (#818, П35, founder 12.11 «оттягивать угол»): the joint of two gutters follows the finger, both
 * gutters stay fixed at their far ends. Each side's direction (far end → joint) is held at a step of 45° of the plan, or in its own
 * direction, within a window `tolIn` wide across the ray (`inWindow`; once held SNAP_LEAVE_RATIO × that); both held — the joint is the crossing of the two rays (a
 * right angle between walls along the axes), one — on its ray, none — free. Lengths: the distance to the joint, whole inches,
 * written as `lengthIn`. null — no corner of that id, a side would be shorter than MIN_RUN_IN, a turn under MIN_TURN_DEG
 * (in one line) or folded back on itself, or the sides would be parallel with no way to cross (the caller keeps the last frame).
 * The joint lands exactly on another gutter's end (`endNear`, `end` of the result) — never on a far end of a gutter that meets the pair.
 */
/** a corner that can be taken: two ends and no third one of the same storey at the joint (spec П35) */
export function cornerMovable(d: Drawing, cornerId: string): boolean {
  const f = findCorners(d).find((c) => c.id === cornerId);
  if (!f) return false;
  const ids = new Set(f.runs.map((x) => x.id));
  const a = d.runs.find((r) => r.id === f.runs[0].id);
  return !!a && !d.runs.some((x) => !ids.has(x.id) && sameStory(x, a) && [x.a, x.b].some((q) => Math.hypot(q[0] - f.at[0], q[1] - f.at[1]) <= 1.5));
}

/** the run points the same way before and after (a pull along it, not a swing) */
export function sameDirection(before: Pick<Drawing, "runs">, next: Pick<Drawing, "runs">, id: string): boolean {
  const u = before.runs.find((r) => r.id === id), v = next.runs.find((r) => r.id === id);
  if (!u || !v) return false;
  const [ux, uy, vx, vy] = [u.b[0] - u.a[0], u.b[1] - u.a[1], v.b[0] - v.a[0], v.b[1] - v.a[1]];
  return Math.abs(ux * vy - uy * vx) <= 1e-6 * Math.hypot(ux, uy) * Math.hypot(vx, vy) + 1e-9 && ux * vx + uy * vy > 0;
}

export function moveCorner(d: Drawing, cornerId: string, p: P, held: [boolean, boolean] = [false, false], tolIn: number = SNAP_TOL_DEFAULT_IN, onEnd: P | null = null): CornerMove | null {
  const f = findCorners(d).find((c) => c.id === cornerId);
  if (!f) return null;
  const rs = f.runs.map((x) => ({ x, r: d.runs.find((r) => r.id === x.id)! }));
  if (rs.some((q) => !q.r)) return null;
  // a third end of the same storey at the joint: moving the pair would tear it off (spec П35: «стык с тремя концами не двигается»)
  if (d.runs.some((x) => !rs.some((q) => q.r.id === x.id) && sameStory(x, rs[0]!.r) && [x.a, x.b].some((q) => Math.hypot(q[0] - f.at[0], q[1] - f.at[1]) <= 1.5))) return null;
  const far = rs.map((q) => (q.x.end === 0 ? q.r.b : q.r.a));
  const step = Math.PI / 4;
  // each side's ray: its own old direction, else the nearest step of 45°, when the finger is within the window of it
  // a side's OWN old direction is a magnet too: pulled along a wall it stays straight, only the other side swings. A side held keeps
  // it first (the start of a pull holds both: nothing jumps at the touch); a free one is caught by a step of 45° first
  const rays = far.map((q, i) => {
    const ang = Math.atan2(p[1] - q[1], p[0] - q[0]);
    const orig = Math.atan2(f.at[1] - q[1], f.at[0] - q[0]);
    const dOrig = Math.abs(((ang - orig + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const m = Math.round(ang / step) * step;
    const dist = Math.hypot(p[0] - q[0], p[1] - q[1]);
    const onStep = inWindow(Math.abs(ang - m), dist, tolIn, held[i]);
    const onOrig = inWindow(dOrig, dist, tolIn, held[i]);
    const ray = (a: number) => [Math.cos(a), Math.sin(a)] as P;
    if (held[i] && onOrig) return ray(orig);
    if (onStep) return ray(m);
    return onOrig ? ray(orig) : null;
  });
  // another gutter's end beats the rays: the joint lands exactly on it (a three-ended joint forms on release)
  const tgt = endNear(d, rs[0]!.r, new Set(rs.map((q) => q.r.id)), p, tolIn, onEnd, far);
  let at: P = p;
  if (tgt) at = tgt;
  else if (rays[0] && rays[1]) {
    // the crossing of the two rays: far[0] + t·u0 = far[1] + s·u1
    const [u0, u1] = [rays[0], rays[1]];
    const den = u0[0] * u1[1] - u0[1] * u1[0];
    if (Math.abs(den) > 1e-9) {
      const t = ((far[1]![0] - far[0]![0]) * u1[1] - (far[1]![1] - far[0]![1]) * u1[0]) / den;
      at = [far[0]![0] + u0[0] * t, far[0]![1] + u0[1] * t];
    } else {
      at = project(far[0]!, u0, p); // parallel sides: the first one's ray
    }
  } else if (rays[0]) at = project(far[0]!, rays[0], p);
  else if (rays[1]) at = project(far[1]!, rays[1], p);
  at = [Math.round(at[0]), Math.round(at[1])];
  const lens = far.map((q) => Math.round(Math.hypot(at[0] - q[0], at[1] - q[1])));
  if (lens.some((n) => n < MIN_RUN_IN || n > MAX_RUN_IN)) return null;
  // a side never turns inside out: the joint stays on the finger's side of each far end (the crossing of two rays may land behind one)
  if (!tgt && far.some((q) => (at[0] - q[0]) * (p[0] - q[0]) + (at[1] - q[1]) * (p[1] - q[1]) < 0)) return null;
  const same = at[0] === f.at[0] && at[1] === f.at[1];
  // never ends on another gutter's end of the same storey by rounding (a corner only by the user's own act — drawing a line to it)
  if (!same && !tgt && d.runs.some((x) => !rs.some((q) => q.r.id === x.id) && sameStory(x, rs[0]!.r) && [x.a, x.b].some((q) => Math.hypot(q[0] - at[0], q[1] - at[1]) <= 1.5))) return null;
  const angle = Math.round((Math.abs(Math.atan2(cross2(sub2(far[0]!, at), sub2(far[1]!, at)), dot2(sub2(far[0]!, at), sub2(far[1]!, at)))) * 180) / Math.PI);
  // a corner stays a corner: the frame that would lay the two sides almost in one line (a turn under MIN_TURN_DEG) is not drawn — it would
  // stop being found, and its method and splash guard would be orphaned
  if (180 - angle < MIN_TURN_DEG || angle < MIN_TURN_DEG) return null; // laid in one line, or folded back on itself
  const nowHeld: [boolean, boolean] = tgt ? [false, false] : [!!rays[0], !!rays[1]];
  if (same) return { drawing: d, deg: angle, held: nowHeld, ...(tgt ? { end: tgt } : {}) };
  const ids = new Map(rs.map((q, i) => [q.r.id, { end: q.x.end, len: lens[i]! }]));
  const runs = d.runs.map((r) => {
    const m = ids.get(r.id);
    if (!m) return r;
    return closeEnd(m.end === 0 ? { ...r, a: at, lengthIn: m.len } : { ...r, b: at, lengthIn: m.len }, m.end);
  });
  return {
    drawing: {
      ...d,
      runs,
      downspouts: d.downspouts.map((s) => {
        const m = ids.get(s.runId);
        if (!m) return s;
        const r = runs.find((x) => x.id === s.runId)!;
        const n = Math.round(Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]));
        const was0 = Math.round(Math.hypot(d.runs.find((x) => x.id === s.runId)!.b[0] - d.runs.find((x) => x.id === s.runId)!.a[0], d.runs.find((x) => x.id === s.runId)!.b[1] - d.runs.find((x) => x.id === s.runId)!.a[1]));
        const atIn = m.end === 0 ? s.atIn + (n - was0) : s.atIn;
        return { ...s, atIn: Math.min(n, Math.max(0, atIn)) };
      }),
    },
    deg: angle,
    held: nowHeld,
    ...(tgt ? { end: tgt } : {}),
  };
}
const sub2 = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const dot2 = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const cross2 = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
/** the point of the ray `from + t·u` nearest to `p` */
const project = (from: P, u: P, p: P): P => {
  const t = (p[0] - from[0]) * u[0] + (p[1] - from[1]) * u[1];
  return [from[0] + u[0] * t, from[1] + u[1] * t];
};

/** the split mark of an end that moved away is gone (the end is its own again) */
const closeEnd = (r: DrawnRun, end: 0 | 1): DrawnRun => {
  const k = end ? "b" : "a";
  if (!r.attrs.openEnds?.[k]) return r;
  const { [k]: _gone, ...rest } = r.attrs.openEnds;
  const { openEnds: _old, ...attrs } = r.attrs;
  return { ...r, attrs: Object.keys(rest).length ? { ...attrs, openEnds: rest } : attrs };
};

/** the drawing as the finger sees it: with the downspouts layer off the downspouts are not there to pick, move or tap (#930 review) */
export const withoutDs = (d: Drawing, hidden: boolean): Drawing => (hidden && d.downspouts.length ? { ...d, downspouts: [] } : d);

/** a downspout on the nearest line under the finger (none if no line is near) */
export function addDownspout(d: Drawing, id: string, p: P, tolIn: number, attrs: Omit<DrawnDownspout, "id" | "runId" | "atIn">, ch?: Choices): Drawing {
  const n = nearestRun(d, p, tolIn);
  if (!n) return d;
  const r = d.runs.find((x) => x.id === n.runId)!;
  // a 6″ gutter takes a 3×4 downspout by default (founder 11.11, #767); the default 2×3 only — a size the company set itself (even 2×3) stays; 5″ is the company's size
  if (r.attrs.size === "6" && attrs.shape === "rect" && attrs.size === "2x3" && (!ch || (!ch.dsSizeSet && ch.offer.dsSizes.rect.includes("3x4")))) attrs = { ...attrs, size: "3x4" };
  const L = runLengthIn(r);
  const atIn = Math.min(L, Math.max(0, Math.round(projectOnRun(r, p).atIn)));
  // the colour of its gutter by default (founder 09.11), unless it is copper or zinc
  const paint = MILL_ONLY.has(attrs.material) || MILL_ONLY.has(r.attrs.material) ? {} : { finish: r.attrs.finish ?? (r.attrs.color ? "painted" : "mill"), ...(r.attrs.color ? { color: r.attrs.color } : {}) };
  return { ...d, downspouts: [...d.downspouts, { ...attrs, ...paint, id, runId: n.runId, atIn } as DrawnDownspout] };
}

/** remove a line (with its downspouts) or a downspout */
export function removeElement(d: Drawing, id: string): Drawing {
  const line = d.runs.find((r) => r.id === id);
  if (line) {
    // the count of removed automatic downspouts does not go with the gutter: a gutter of its chain that is left takes it (#1246)
    const n = Number(line.attrs.dsAutoOff) || 0;
    const heir = n ? [...chainOf(d, id)].find((x) => x !== id) : undefined;
    return {
      ...d,
      runs: d.runs.filter((r) => r.id !== id).map((r) => (r.id === heir ? { ...r, attrs: { ...r.attrs, dsAutoOff: (Number(r.attrs.dsAutoOff) || 0) + n } } : r)),
      downspouts: d.downspouts.filter((s) => s.runId !== id),
    };
  }
  // a downspout the program had put, taken off by hand: the chain wants one less (a count on its gutter, #1246)
  const gone = d.downspouts.find((s) => s.id === id);
  const runs = gone?.auto ? d.runs.map((r) => (r.id === gone.runId ? { ...r, attrs: { ...r.attrs, dsAutoOff: (Number(r.attrs.dsAutoOff) || 0) + 1 } } : r)) : d.runs;
  return { ...d, runs, downspouts: d.downspouts.filter((s) => s.id !== id) };
}

/** the same drawing back when nothing changes (no empty «назад» step) */
export function setStory(d: Drawing, id: string, story: Story): Drawing {
  const r = d.runs.find((x) => x.id === id);
  if (!r || r.attrs.story === story) return d;
  return { ...d, runs: d.runs.map((x) => (x.id === id ? { ...x, attrs: { ...x.attrs, story } } : x)) };
}

/** a run's attributes changed in the panel (П21.8): the same drawing back when nothing changes */
export function setRunAttrs(d: Drawing, id: string, patch: Partial<DrawnRun["attrs"]>, ch?: Choices): Drawing {
  const r = d.runs.find((x) => x.id === id);
  if (!r) return d;
  const attrs = changeRun(r.attrs, patch, ch);
  if (attrs === r.attrs) return d;
  // its downspouts «как у желоба» follow its colour (founder 09.11): those that had the gutter's colour take the new one
  const paint = (x: { finish?: string; color?: string }) => ((x.finish ?? (x.color ? "painted" : "mill")) === "mill" ? "@mill" : `c:${x.color}`);
  const was = paint(r.attrs), now = paint(attrs);
  const downspouts = was === now ? d.downspouts : d.downspouts.map((s) =>
    s.runId === id && paint(s) === was && !MILL_ONLY.has(s.material) ? { ...s, finish: attrs.finish ?? (attrs.color ? "painted" : "mill"), ...(attrs.color ? { color: attrs.color } : {}) } : s);
  return { ...d, runs: d.runs.map((x) => (x.id === id ? { ...x, attrs } : x)), downspouts };
}

/** a downspout's attributes changed in the panel */
export function setDsAttrs(d: Drawing, id: string, patch: Partial<DsAttrs>, ch?: Choices): Drawing {
  const s = d.downspouts.find((x) => x.id === id);
  if (!s) return d;
  const { id: _id, runId, atIn, ...was } = s;
  const attrs = changeDs(was, patch, ch);
  // changed by hand it is the user's own now (no more `auto`): the program does not move it or count it as its own
  return attrs === was ? d : { ...d, downspouts: d.downspouts.map((x) => (x.id === id ? { ...attrs, auto: undefined, id, runId, atIn } : x)) };
}

/**
 * The tape: the typed length wins over the drawn one (confidence `taped`) and the line is redrawn to it; null drops
 * the tape (the line stays where it is — «по рисунку»).
 * A downspout stays where it is drawn: its distance along the run scales with the new length.
 */
export function setLength(d: Drawing, id: string, lengthIn: number | null): Drawing {
  const r = d.runs.find((x) => x.id === id);
  if (!r) return d;
  const want = lengthIn === null ? undefined : Math.round(lengthIn * DENOM) / DENOM;
  if (r.lengthIn === want) return d;
  const { lengthIn: _was, ...rest } = r;
  if (want === undefined) return { ...d, runs: d.runs.map((x) => (x.id === id ? rest : x)) };
  // the line takes the typed length on the drawing too (founder 08.11: 500 ft and 40 ft were the same size): its end
  // b moves along the line; what is joined beyond it moves along, so the corners hold
  const vx = r.b[0] - r.a[0], vy = r.b[1] - r.a[1];
  const D = Math.hypot(vx, vy) || 1;
  const nb: P = [Math.round(r.a[0] + (vx / D) * want), Math.round(r.a[1] + (vy / D) * want)];
  const near = (p: P, q: P) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 1;
  const at = (p: P) => near(p, r.b);
  const next: DrawnRun = { ...rest, b: nb, lengthIn: want };
  const was = runLengthIn(r) || 1;
  // what hangs on end b (joined end to end, not through this run): it moves as a whole, keeping its shape — unless it
  // comes round to end a (a closed line), then only the joined ends move
  const beyond = new Set<string>();
  const todo = d.runs.filter((x) => x.id !== id && sameStory(x, r) && (at(x.a) || at(x.b))).map((x) => x.id);
  todo.forEach((x) => beyond.add(x));
  while (todo.length) {
    const cid = todo.pop();
    const cur = d.runs.find((x) => x.id === cid)!;
    for (const o of d.runs) {
      if (o.id === id || beyond.has(o.id) || !sameStory(o, cur)) continue;
      if ([o.a, o.b].some((p) => near(p, cur.a) || near(p, cur.b))) {
        beyond.add(o.id);
        todo.push(o.id);
      }
    }
  }
  const closed = d.runs.some((x) => beyond.has(x.id) && (near(x.a, r.a) || near(x.b, r.a)));
  const dx = nb[0] - r.b[0], dy = nb[1] - r.b[1];
  const shift = (p: P): P => [p[0] + dx, p[1] + dy];
  return {
    ...d,
    runs: d.runs.map((x) => {
      if (x.id === id) return next;
      if (!closed && beyond.has(x.id)) return { ...x, a: shift(x.a), b: shift(x.b) };
      if (!sameStory(x, r)) return x;
      return at(x.a) ? { ...x, a: nb } : at(x.b) ? { ...x, b: nb } : x;
    }),
    downspouts: d.downspouts.map((s) => (s.runId === id ? { ...s, atIn: Math.min(want, Math.round((s.atIn * want) / was)) } : s)),
  };
}

/** «Отменить» after a delete: put back what the delete took (a run and its downspouts), keep everything drawn since */
export function restoreRemoved(cur: Drawing, before: Drawing, removedId: string): Drawing {
  const run = before.runs.find((r) => r.id === removedId);
  const back = { runs: run ? [run] : [], downspouts: before.downspouts.filter((s) => s.id === removedId || (run && s.runId === run.id)) };
  const haveR = new Set(cur.runs.map((r) => r.id));
  const haveD = new Set(cur.downspouts.map((s) => s.id));
  const runs = back.runs.filter((r) => !haveR.has(r.id));
  const ids = new Set([...cur.runs, ...runs].map((r) => r.id));
  const downspouts = back.downspouts.filter((s) => !haveD.has(s.id) && ids.has(s.runId));
  // an automatic downspout taken off and brought back: its gutter's count of removed ones goes down by one (removeElement had raised it);
  // a gutter brought back with its own count: the gutter that took the count over gives it back
  const asked = before.downspouts.find((s) => s.id === removedId);
  const dec = (rs: DrawnRun[], runId: string, n: number): DrawnRun[] => rs.map((r) => {
    if (r.id !== runId) return r;
    const left = (Number(r.attrs.dsAutoOff) || 0) - n;
    const { dsAutoOff: _o, ...rest } = r.attrs;
    return { ...r, attrs: left > 0 ? { ...rest, dsAutoOff: left } : rest };
  });
  let base = cur.runs;
  if (asked?.auto && downspouts.some((s) => s.id === removedId)) base = dec(base, asked.runId, 1);
  const back0 = run && runs.length ? Number(run.attrs.dsAutoOff) || 0 : 0;
  if (back0) {
    const heir = [...chainOf({ runs: [...base, ...runs] }, run!.id)].find((x) => x !== run!.id && (Number(base.find((r) => r.id === x)?.attrs.dsAutoOff) || 0) >= back0);
    if (heir) base = dec(base, heir, back0);
  }
  return runs.length || downspouts.length ? { ...cur, runs: [...base, ...runs], downspouts: [...cur.downspouts, ...downspouts] } : cur;
}

/**
 * What a finger held still on `p` for the long-press time picks up (#1272, founder 12.11): a downspout, a free end (a cap), or a corner
 * that can be moved — with the id to select (the picked ring is the visible «поднято»); a joint of three ends, a line, nothing — null.
 */
export type Lift = { kind: "ds"; id: string } | { kind: "end"; id: string; end: 0 | 1 } | { kind: "corner"; id: string; cornerId: string };
export function liftTarget(d: Drawing, p: P, tolIn: number): Lift | null {
  const h = hitTest(d, p, tolIn);
  if (!h) return null;
  if (h.kind === "ds") return { kind: "ds", id: h.id };
  if (h.kind !== "end") return null;
  const found = findCorners(d);
  const corner = found.find((c) => c.runs.some((x) => x.id === h.id && x.end === h.end));
  if (corner) return cornerMovable(d, corner.id) ? { kind: "corner", id: h.id, cornerId: corner.id } : null;
  return runEnds(d, found)[h.id]?.[h.end]?.kind === "cap" ? { kind: "end", id: h.id, end: h.end } : null;
}

/** a one-finger stroke in progress */
export type Stroke = { kind: "line"; a: P; /** a long press on a free cap: along the gutter's axis it turns into a pull (#504) */ pullable?: { id: string; end: 0 | 1; before: Drawing } } | { kind: "end"; id: string; end: 0 | 1; before: Drawing } | { kind: "ds"; id: string; before: Drawing } | { kind: "corner"; cornerId: string; before: Drawing; /** where the finger touched down: the joint moves by the finger's move from it, never jumps to it */ from?: P; /** the sides held (at 45° steps or in their own direction) by the last frame */ held: [boolean, boolean]; /** the width of the magnets' windows in plan inches (pixels ÷ scale, taken with the corner) and the end snapped to by the last frame */ tol?: number; onEnd?: P | null } | { kind: "pull"; id: string; end: 0 | 1; before: Drawing; /** begun with «Желоб»: like drawing on straight, the length window opens after it */ fromLine?: boolean; /** where the finger touched down: the end moves by the finger's move from it */ from?: P; /** the step of 45° held by the last frame (the window's hysteresis) */ held?: number | null; /** as the corner's: the window's width in plan inches, the end snapped to by the last frame */ tol?: number; onEnd?: P | null };

/** a downspout dragged by the finger (founder 08.11): it slides along its own run only */
export function moveDs(d: Drawing, id: string, p: P): Drawing {
  const s = d.downspouts.find((x) => x.id === id);
  const r = s && d.runs.find((x) => x.id === s.runId);
  if (!s || !r) return d;
  const atIn = Math.min(runLengthIn(r), Math.max(0, projectOnRun(r, p).atIn));
  // moved by hand it is the user's own now (no more `auto`): the program does not take it away or count it as its own
  return atIn === s.atIn ? d : { ...d, downspouts: d.downspouts.map((x) => (x.id === id ? { ...x, atIn, auto: undefined } : x)) };
}

/**
 * The finger lifted (or the stroke was cancelled — a second finger came for the zoom): the drawing to keep.
 * The final point comes from the lift event itself, not from the last frame drawn. Cancelled: a line is dropped,
 * a dragged end goes back.
 */
export function finishStroke(g: Stroke, d: Drawing, p: P, tolIn: number, canceled: boolean, newRun: { id: string; attrs: DrawnRun["attrs"] }): Drawing {
  if (g.kind === "end") return canceled ? g.before : moveEnd(g.before, g.id, g.end, p, tolIn);
  if (g.kind === "ds") return canceled ? g.before : moveDs(g.before, g.id, p);
  if (g.kind === "corner") return canceled ? g.before : (moveCorner(g.before, g.cornerId, grabbedCorner(g.before, g.cornerId, g.from, p), g.held, g.tol, g.onEnd ?? null)?.drawing ?? d);
  if (g.kind === "pull") return canceled ? g.before : (swingEnd(g.before, g.id, g.end, grabbedEnd(g.before, g.id, g.end, g.from, p), g.held ?? null, g.tol, g.onEnd ?? null)?.drawing ?? d);
  if (canceled) return d;
  const b = endAt(d, g.a, p, tolIn);
  // a line drawn over a gutter from one of its ends to the other is no new gutter (#1256): the same drawing back, the caller says why (`lineRefused`)
  if (lineRefused(d, g.a, b, Number(newRun.attrs.story) || 1, tolIn)) return d;
  return extendRun(d, g.a, b, newRun.attrs) ?? addRun(d, newRun.id, g.a, b, newRun.attrs);
}

/** the line `a`→`b` is refused (`dup`: exactly on a gutter that is there; `overlap`: along a stretch of one, #1318): the one place that says so — `finishStroke` drops it, the screen tells why */
export const lineRefused = (d: Drawing, a: P, b: P, story: number, fingerIn = 1): "dup" | "overlap" | null =>
  wouldDuplicate(d, a, b, story) ? "dup" : overlapsRun(d, a, b, story, Math.min(OVERLAP_ACROSS_MAX_IN, Math.max(1, fingerIn))) ? "overlap" : null;

/** how far across a gutter's line a drawn line may lie and still count as lying along it: a finger's reach (the caller's `tolIn`), at most this (#1318 review: a touch is never exact) */
export const OVERLAP_ACROSS_MAX_IN = 6;

/** a turn under this (degrees) from a gutter's free end is the same gutter going on, not a new one with a corner */
export const STRAIGHT_ON_DEG = 10;

/**
 * Drawn on from a gutter's free end (an end cap), straight on (founder 09.11: «45 ft and 10 ft — two lines; must be one,
 * 55 ft»): that gutter grows — one line. Its end moves to the new point along its own line; a taped length grows by
 * the drawn bit. Another storey, a turn, a joined end or a short bit → null (a new gutter, a corner as before).
 */
export function extendRun(d: Drawing, a: P, b: P, attrs: DrawnRun["attrs"]): Drawing | null {
  const add = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (add < MIN_RUN_IN) return null;
  const near = (p: P, q: P) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 1;
  const at = d.runs.filter((r) => near(r.a, a) || near(r.b, a));
  if (at.length !== 1) return null; // a corner or a join there already
  const r = at[0]!;
  if ((Number(r.attrs.story) || 1) !== (Number(attrs.story) || 1)) return null;
  const end: 0 | 1 = near(r.b, a) ? 1 : 0;
  const from = end ? r.a : r.b;
  const ux = a[0] - from[0], uy = a[1] - from[1];
  const L = Math.hypot(ux, uy) || 1;
  const cos = (ux * (b[0] - a[0]) + uy * (b[1] - a[1])) / (L * add);
  if (cos < Math.cos((STRAIGHT_ON_DEG * Math.PI) / 180)) return null;
  const nb: P = [Math.round(a[0] + (ux / L) * add), Math.round(a[1] + (uy / L) * add)];
  const grown: DrawnRun = {
    ...(end ? { ...r, b: nb } : { ...r, a: nb }),
    ...(r.lengthIn !== undefined ? { lengthIn: Math.round((r.lengthIn + add) * DENOM) / DENOM } : {}),
  };
  const was = runLengthIn(r) || 1;
  const now = runLengthIn(grown);
  return {
    ...d,
    runs: d.runs.map((x) => (x.id === r.id ? grown : x)),
    // downspouts stay where they are on the wall: from the start they keep their distance; grown at the start, they shift
    downspouts: d.downspouts.map((s) => (s.runId === r.id && end === 0 ? { ...s, atIn: Math.min(now, Math.round(s.atIn + (now - was))) } : s)),
  };
}

/** the own «назад» of the canvas (П14.2 №5): snapshots, at most `max` back */
export interface History { past: Drawing[]; future: Drawing[] }
export const HISTORY_MAX = 50;
export const pushHistory = (h: History, prev: Drawing): History => ({ past: [...h.past, prev].slice(-HISTORY_MAX), future: [] });
export function undo(h: History, cur: Drawing): { h: History; d: Drawing } | null {
  const prev = h.past[h.past.length - 1];
  return prev ? { h: { past: h.past.slice(0, -1), future: [cur, ...h.future] }, d: prev } : null;
}
export function redo(h: History, cur: Drawing): { h: History; d: Drawing } | null {
  const next = h.future[0];
  return next ? { h: { past: [...h.past, cur], future: h.future.slice(1) }, d: next } : null;
}

/**
 * How a corner is made (M7c, spec 33 П22.2 №15): stored on both runs that meet there (each at its own end); it counts
 * only while both hold it (cornerChoiceOf), so a deleted run leaves no live choice behind. `null` — the company's default.
 */
export function setCornerMethod(d: Drawing, corner: Pick<FoundCorner, "runs">, method: CornerChoice["method"] | null): Drawing {
  let changed = false;
  const runs = d.runs.map((r) => {
    const end = corner.runs.find((x) => x.id === r.id);
    if (!end) return r;
    const key = end.end ? "b" : "a";
    const cur = r.attrs.cornerMethod ?? {};
    if ((cur[key] ?? null) === method) return r;
    changed = true;
    const next = { ...cur };
    if (method) next[key] = method;
    else delete next[key];
    const { cornerMethod: _old, ...rest } = r.attrs;
    return { ...r, attrs: Object.keys(next).length ? { ...rest, cornerMethod: next } : rest };
  });
  return changed ? { ...d, runs } : d;
}

/**
 * Flip the gutter's face (founder 08.11): a tap on an end cap swaps left ↔ right, a corner inside ↔ outside. The face
 * is one side of the whole line round the house, so every run joined to this one flips with it; the caps and the
 * corners follow (they are read from the house side).
 */
export function flipFace(d: Drawing, runId: string): Drawing {
  if (!d.runs.some((r) => r.id === runId)) return d;
  // the whole line turns with this gutter: one face along it (each flipped on its own could keep two faces)
  const r = d.runs.find((x) => x.id === runId)!;
  return alongChain(d, runId, otherSide(houseSides(d)(r)));
}

/**
 * Set the angle between the walls at a corner (founder 08.11: measured by a triangle on site). The first run stays;
 * the second turns about the corner — the same way it turns now — and what hangs on its far end turns with it.
 * A closed line: only the second run's far end moves (its neighbours keep the join). Same drawing back when nothing
 * changes or the angle is out of 20°…180°.
 */
export function setCornerAngle(d: Drawing, f: Pick<FoundCorner, "runs" | "at">, angleDeg: number): Drawing {
  if (!(angleDeg >= 20 && angleDeg <= 180)) return d;
  const A = d.runs.find((x) => x.id === f.runs[0].id);
  const B = d.runs.find((x) => x.id === f.runs[1].id);
  if (!A || !B) return d;
  const c = f.at;
  const aFar = f.runs[0].end ? A.a : A.b;
  const bFar = f.runs[1].end ? B.a : B.b;
  const vin: P = [c[0] - aFar[0], c[1] - aFar[1]];
  const vout: P = [bFar[0] - c[0], bFar[1] - c[1]];
  const cur = (Math.atan2(vin[0] * vout[1] - vin[1] * vout[0], vin[0] * vout[0] + vin[1] * vout[1]) * 180) / Math.PI;
  const want = (cur >= 0 ? 1 : -1) * (180 - angleDeg);
  const rad = ((want - cur) * Math.PI) / 180;
  if (Math.abs(rad) < 1e-6) return d;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const rot = (p: P): P => {
    const x = p[0] - c[0], y = p[1] - c[1];
    return [Math.round(c[0] + x * cos - y * sin), Math.round(c[1] + x * sin + y * cos)];
  };
  const near = (p: P, q: P) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 1;
  // what hangs on B's far end, not through the corner
  const hang = new Set<string>();
  const todo = [bFar];
  const seenPts: P[] = [];
  while (todo.length) {
    const pt = todo.pop()!;
    if (seenPts.some((q) => near(q, pt)) || near(pt, c)) continue;
    seenPts.push(pt);
    for (const o of d.runs) {
      if (o.id === B.id || hang.has(o.id) || !sameStory(o, B)) continue;
      if (near(o.a, pt) || near(o.b, pt)) {
        hang.add(o.id);
        todo.push(near(o.a, pt) ? o.b : o.a);
      }
    }
  }
  const closed = hang.has(A.id);
  const nb = rot(bFar);
  return {
    ...d,
    runs: d.runs.map((x) => {
      if (x.id === B.id) return f.runs[1].end ? { ...x, a: nb } : { ...x, b: nb };
      if (!closed && hang.has(x.id)) return { ...x, a: rot(x.a), b: rot(x.b) };
      if (closed && x.id !== A.id && sameStory(x, B)) return near(x.a, bFar) ? { ...x, a: nb } : near(x.b, bFar) ? { ...x, b: nb } : x;
      return x;
    }),
  };
}

/** how a gutter's length is shown on the drawing (founder 09.11): a view only — the length stays in inches */
export function setRunUnit(d: Drawing, id: string, unit: "ftin" | "in" | "m" | "cm" | "mm"): Drawing {
  const r = d.runs.find((x) => x.id === id);
  if (!r || (r.unit ?? "ftin") === unit) return d;
  const { unit: _u, ...rest } = r;
  return { ...d, runs: d.runs.map((x) => (x.id === id ? (unit === "ftin" ? rest : { ...rest, unit }) : x)) };
}

/** the inside corner's splash guard on / off (founder 09.11): written on both runs at their meeting ends */
export function setCornerSplash(d: Drawing, corner: Pick<FoundCorner, "runs">, on: boolean): Drawing {
  let changed = false;
  const runs = d.runs.map((r) => {
    const end = corner.runs.find((x) => x.id === r.id);
    if (!end) return r;
    const key = end.end ? "b" : "a";
    const cur = r.attrs.noSplash ?? {};
    if (!!cur[key] === !on) return r;
    changed = true;
    const next = { ...cur };
    if (on) delete next[key];
    else next[key] = true;
    const { noSplash: _old, ...rest } = r.attrs;
    return { ...r, attrs: Object.keys(next).length ? { ...rest, noSplash: next } : rest };
  });
  return changed ? { ...d, runs } : d;
}
