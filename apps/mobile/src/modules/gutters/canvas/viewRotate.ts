/**
 * The turn of the canvas VIEW (#501, founder 09.11 «поворот по оси», 19.11 «крутить чертёж по оси»; spec 33 П39). Only the view turns —
 * as in Maps or Procreate: two fingers turn the canvas together with the pinch and the pan, «север вверх» brings it back to 0°. The
 * drawing (its data) and every PDF stay as they are: nothing here touches the plan.
 *
 * PURE steps, the same shape as `gestureState.ts` (worklets: they run on the UI thread), so the gesture can be wired to them in the next
 * stage without new math. The tests are `test/gutterViewRotate.test.ts`:
 *  - the point under the fingers stays under the fingers (a turn is about the fingers' anchor, every frame);
 *  - a pinch does not turn the view by itself: the turn begins only past `ROT_START_DEG` of the fingers' own turn, and without a jump
 *    (the threshold is taken away, not caught up);
 *  - the view sticks to 0°, 90°, 180°, 270° (within `SNAP_IN_DEG` it sits on it; up to `SNAP_OUT_DEG` it catches up with the
 *    fingers — continuous, no jump on entry or on leaving; a tick once on entry, a hand shaking at the edge does not tick again). A view
 *    that starts inside a window is not pulled onto its angle: the magnet waits until the view has left the window;
 *  - turning back through the start in one gesture is no jump (the threshold keeps the sign it was passed with);
 *  - a redraw does not move the picture (`rebaseSim`: the same picture against the view that was rendered);
 *  - «север вверх» gives exactly 0°, with the point at the screen's centre kept.
 *
 * The view plan → screen is p' = k·R(rot)·p + o (`ViewR`); the live transform on the screen is a similarity p' = M·p + t with
 * M = [[a, −b], [b, a]] (a = S·cos θ, b = S·sin θ) — `Sim`. Every function is a worklet (the UI thread; #1390, sentinel
 * `workletCalls.test.ts`). Angles are radians inside, the screen's y goes down, so a positive angle
 * turns clockwise on the screen (as RNGH's `rotation`).
 */

/** a similarity on the screen: p' = [[a, −b], [b, a]]·p + (tx, ty) */
export interface Sim { a: number; b: number; tx: number; ty: number }
export const SIM_ID: Sim = { a: 1, b: 0, tx: 0, ty: 0 };

/** a view plan → screen with a turn: p' = k·R(rot)·p + (ox, oy); `rot` in (−π, π] */
export interface ViewR { k: number; ox: number; oy: number; rot: number }

/** the fingers must turn this much (degrees) before the view begins to turn: a pinch with a slight twist stays a pinch (Maps does the same) */
export const ROT_START_DEG = 10;
/** the view sticks to a right angle (0°, 90°, 180°, 270°) when it comes this close (degrees) */
export const SNAP_IN_DEG = 6;
/** … and catches up with the fingers by this far from it (no jump on leaving; the tick does not repeat until the view has left) */
export const SNAP_OUT_DEG = 9;

const RAD = Math.PI / 180;
const QUARTER = Math.PI / 2;

/** an angle into (−π, π] */
export function normAngle(r: number): number {
  "worklet";
  let x = r % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  else if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

/** an angle that is a right angle up to float noise becomes exactly that right angle (0, ±π/2, π): «север вверх» is 0, not 1e-17 */
function cleanAngle(r: number): number {
  "worklet";
  const q = Math.round(r / QUARTER);
  return Math.abs(r - q * QUARTER) < 1e-9 ? normAngle(q * QUARTER) : r;
}

/** the turn of a similarity (radians) */
export function simAngle(s: Sim): number {
  "worklet";
  return Math.atan2(s.b, s.a);
}
/** the scale of a similarity */
export function simScale(s: Sim): number {
  "worklet";
  return Math.hypot(s.a, s.b);
}

/** a point through a similarity */
export function simApply(s: Sim, x: number, y: number): { x: number; y: number } {
  "worklet";
  return { x: s.a * x - s.b * y + s.tx, y: s.b * x + s.a * y + s.ty };
}

/** A after B (first B, then A) */
export function simCompose(A: Sim, B: Sim): Sim {
  "worklet";
  return { a: A.a * B.a - A.b * B.b, b: A.a * B.b + A.b * B.a, tx: A.a * B.tx - A.b * B.ty + A.tx, ty: A.b * B.tx + A.a * B.ty + A.ty };
}

/** the inverse of a similarity */
export function simInverse(s: Sim): Sim {
  "worklet";
  const d = s.a * s.a + s.b * s.b;
  const a = s.a / d;
  const b = -s.b / d;
  return { a, b, tx: -(a * s.tx - b * s.ty), ty: -(b * s.tx + a * s.ty) };
}

/** a turn by `d` (radians) about the screen point (fx, fy), after `s` */
export function rotateAbout(s: Sim, d: number, fx: number, fy: number): Sim {
  "worklet";
  const c = Math.cos(d);
  const n = Math.sin(d);
  // R_f = T(f)·R(d)·T(−f): p' = R(d)·(p − f) + f
  const r: Sim = { a: c, b: n, tx: fx - (c * fx - n * fy), ty: fy - (n * fx + c * fy) };
  return simCompose(r, s);
}

/** a scale by `k` about the screen point (fx, fy), after `s` */
export function scaleAbout(s: Sim, k: number, fx: number, fy: number): Sim {
  "worklet";
  return { a: k * s.a, b: k * s.b, tx: k * s.tx + (1 - k) * fx, ty: k * s.ty + (1 - k) * fy };
}

/** the view as a similarity plan → screen */
export function viewSim(v: ViewR): Sim {
  "worklet";
  return { a: v.k * Math.cos(v.rot), b: v.k * Math.sin(v.rot), tx: v.ox, ty: v.oy };
}

/** a similarity plan → screen as a view (the angle cleaned of float noise at the right angles) */
export function simView(s: Sim): ViewR {
  "worklet";
  return { k: simScale(s), ox: s.tx, oy: s.ty, rot: cleanAngle(simAngle(s)) };
}

/** the view after the live transform `t` is committed */
export function applySim(v: ViewR, t: Sim): ViewR {
  "worklet";
  const r = simView(simCompose(t, viewSim(v)));
  // the turn is the sum of the two: kept exact (atan2 of a product loses the last bits of a right angle)
  return { ...r, rot: cleanAngle(normAngle(v.rot + simAngle(t))) };
}

/** a plan point on the screen */
export function toScreen(v: ViewR, x: number, y: number): { x: number; y: number } {
  "worklet";
  return simApply(viewSim(v), x, y);
}

/** a screen point on the plan (where a finger touches: the hit test of a turned view) */
export function toPlan(v: ViewR, x: number, y: number): { x: number; y: number } {
  "worklet";
  return simApply(simInverse(viewSim(v)), x, y);
}

/**
 * The redraw (as `rebase` of `gestureState.ts`, now with the turn): the live transform `live` is against the view `base`; the render of
 * `ref` has arrived. The live transform that shows the SAME picture against `ref` — the screen does not move by a pixel.
 */
export function rebaseSim(base: ViewR, live: Sim, ref: ViewR): Sim {
  "worklet";
  return simCompose(simCompose(live, viewSim(base)), simInverse(viewSim(ref)));
}

/** the live turn of one gesture of two fingers */
export interface RotState {
  /** the fingers' own turn since they came down (radians, summed from the frames) */
  raw: number;
  /** the turn has begun (past ROT_START_DEG) */
  on: boolean;
  /** the side the fingers passed the threshold to (−1 / 1): the threshold taken away keeps this sign for the whole gesture */
  dir: number;
  /** the magnet of the right angles works: false while the view is still inside the window of the right angle it started near (it would
   *  pull the view onto it on the first frame — a jump); true once the view has been out of every window */
  armed: boolean;
  /** the right angle the view is stuck to (radians), or null */
  snap: number | null;
  /** the turn shown now, against the view the fingers came down on (radians) */
  shown: number;
}
export function idleRot(): RotState {
  "worklet";
  return { raw: 0, on: false, dir: 0, armed: false, snap: null, shown: 0 };
}

/**
 * One frame of the fingers' turn. `base` — the view's turn when the fingers came down (radians); `change` — the frame's turn of the
 * fingers (RNGH `rotationChange`, radians). Gives the turn to make on this frame (radians, about the fingers' anchor: `rotateAbout`)
 * and whether the view has just stuck to a right angle (the tick).
 */
export function rotFrame(st: RotState, base: number, change: number): { d: number; tick: boolean } {
  "worklet";
  st.raw += change;
  const start = ROT_START_DEG * RAD;
  if (!st.on) {
    if (Math.abs(st.raw) < start) return { d: 0, tick: false };
    st.on = true;
    st.dir = Math.sign(st.raw);
    // near a right angle (inside its window) the magnet waits until the view has left the window: it starts from where it stands
    const q0 = Math.round(base / QUARTER) * QUARTER;
    st.armed = Math.abs(base - q0) >= SNAP_OUT_DEG * RAD;
  }
  // the threshold is taken away, not caught up — with the sign it was passed with (turning back through the start is no jump)
  const free = st.raw - st.dir * start;
  const target = base + free;
  // the magnet of the right angle, continuous (no jump on entry or on leaving): within SNAP_IN the view sits on it; from SNAP_IN to
  // SNAP_OUT it catches up with the fingers (a steeper slope); past SNAP_OUT it is free
  const q = Math.round(target / QUARTER) * QUARTER;
  const e = target - q;
  const ae = Math.abs(e);
  const inn = SNAP_IN_DEG * RAD;
  const out = SNAP_OUT_DEG * RAD;
  if (!st.armed && ae >= out) st.armed = true;
  let tick = false;
  let view: number;
  if (!st.armed || ae >= out) {
    st.snap = null;
    view = target;
  } else if (ae <= inn) {
    tick = st.snap !== q;
    st.snap = q;
    view = q;
  } else {
    // a hand shaking at the edge of the window does not tick again until it has left it (the hysteresis)
    if (st.snap !== q) st.snap = null;
    view = q + Math.sign(e) * ((ae - inn) * out) / (out - inn);
  }
  const shown = view - base;
  const d = shown - st.shown;
  st.shown = shown;
  return { d, tick };
}

/** the fingers came up: the next gesture starts from nothing */
export function endRot(st: RotState): void {
  "worklet";
  st.raw = 0;
  st.on = false;
  st.dir = 0;
  st.armed = false;
  st.snap = null;
  st.shown = 0;
}

/** «север вверх»: the view turned back to exactly 0°, the screen point (cx, cy) — the canvas's centre — kept where it is */
export function northUp(v: ViewR, cx: number, cy: number): ViewR {
  "worklet";
  const r = simView(rotateAbout(viewSim(v), -v.rot, cx, cy));
  return { ...r, rot: 0 };
}

/** the view is turned (the «север вверх» button is shown only then) */
export function isTurned(v: ViewR): boolean {
  "worklet";
  return v.rot !== 0;
}

/**
 * A label's angle on the screen kept readable (degrees): a label along a line turned with the view is never upside down — its angle is
 * kept in (−90°, 90°] (a line at 135° reads at −45°, the same line from the other end).
 */
export function uprightDeg(deg: number): number {
  "worklet";
  let x = deg % 360;
  if (x <= -180) x += 360;
  else if (x > 180) x -= 360;
  if (x > 90) x -= 180;
  else if (x <= -90) x += 180;
  return x;
}
