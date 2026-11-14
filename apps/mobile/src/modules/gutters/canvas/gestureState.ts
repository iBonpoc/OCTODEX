/**
 * The live transform of the canvas's own two gestures (pan, pinch) as PURE steps (spec 33 П35 «жесты», #1271; founder 12.11: «щипком
 * приблизил с 1% до 100%, отпустил — откатилось примерно до 80%»; review of the director on #1278). The three causes, each closed here
 * and each with a test on a sequence of the library's events (test/gestureState.test.ts):
 *  1. a double end — the pan (two fingers) ends at the first lifted finger and commits, the pinch goes on to the last finger, its late
 *     frames made a second commit: now a commit only closes a SEGMENT (a stretch with two fingers down); a segment is closed once;
 *  2. frames with ONE finger (the lift: the span collapses, `scaleChange` < 1, the focal point jumps to the finger left) — dropped, and
 *     the first frame after a change of the finger count is dropped too (its delta is the jump);
 *  3. the race with the redraw — a new segment began before the React render of the last commit, and «drop the live transform» ate its
 *     part: the live transform is CUMULATIVE against the view that is on the screen; a commit is a snapshot of it, and the render of a
 *     commit (`settle`) takes away exactly that commit, not everything.
 * A second finger put down after the first lifted begins a NEW segment (the pinch lives to the last finger): zooming «in several goes»
 * works. The transform is the screen map p' = S·p + T (origin form: no focal point to keep); the canvas draws it as scale + shift.
 * Functions are worklets (they run on the UI thread); plain objects in, the same object changed.
 */

/** the map p' = S·p + T (screen px) */
export interface Tf { S: number; Tx: number; Ty: number }

export const IDENTITY: Tf = { S: 1, Tx: 0, Ty: 0 };

export interface LiveState extends Tf {
  /** a segment (two fingers down) is going on */
  seg: boolean;
  /** the finger count of the last pinch / pan frame (a change makes the next frame a jump: it is dropped) */
  nPinch: number;
  nPan: number;
  /** the pinch is at a limit of the scale: −1 the farthest, 1 the nearest, 0 free (the tick is made when it becomes nonzero). It frees
   *  only when the scale is back inside by EDGE_FREE (a hysteresis): a hand shaking at the limit ticks once, not on every frame (#1403) */
  edge: -1 | 0 | 1;
}
/** how far inside a limit (a share of it) the scale must come back before the next tick (founder 14.11: «тик нравится» — one) */
export const EDGE_FREE = 0.02;

/** the scale the live transform may reach, as a factor of the view on the screen (kMin / k, kMax / k); a little beyond it gives way softly */
export interface ScaleLimit { lo: number; hi: number }
/** how far past a limit the live scale may go (a soft stop, as in Photos): a share of the limit; the commit goes back to the limit */
export const OVERSHOOT = 0.05;

export const idleState = (): LiveState => ({ S: 1, Tx: 0, Ty: 0, seg: false, nPinch: 0, nPan: 0, edge: 0 });

/** a copy of the transform. A WORKLET like its callers: a plain function cannot be called on the UI thread of a phone (the app went down on every pinch, #1390) */
function tf(st: Tf): Tf {
  "worklet";
  return { S: st.S, Tx: st.Tx, Ty: st.Ty };
}

/** the segment (two fingers down) ends: the commit to make, if the live transform moved (defined first: a worklet is a const once compiled) */
function closeSegment(st: LiveState): Tf | null {
  "worklet";
  if (!st.seg) return null;
  st.seg = false;
  st.edge = 0;
  const moved = st.S !== 1 || st.Tx !== 0 || st.Ty !== 0;
  return moved ? tf(st) : null;
}

/** one frame of the pinch: scale about the frame's own focal point (it follows the fingers) while two fingers are down; the commit to make, if the frame closes a segment */
export function pinchFrame(st: LiveState, e: { scaleChange: number; numberOfPointers: number; focalX: number; focalY: number }, lim?: ScaleLimit): Tf | null {
  "worklet";
  const jump = st.nPinch !== 0 && e.numberOfPointers !== st.nPinch;
  st.nPinch = e.numberOfPointers;
  if (e.numberOfPointers < 2) return closeSegment(st);
  st.seg = true;
  if (jump) return null; // the first frame after the count changed: its delta is the jump
  let k = e.scaleChange;
  if (lim) {
    // a soft stop at the limit of the scale: up to OVERSHOOT past it the scale gives way (the further, the less), no further
    const target = st.S * k;
    const room = target > lim.hi ? Math.min(lim.hi * (1 + OVERSHOOT), lim.hi * (1 + (target / lim.hi - 1) * 0.3)) : target < lim.lo ? Math.max(lim.lo / (1 + OVERSHOOT), lim.lo * (1 - (1 - target / lim.lo) * 0.3)) : target;
    if (target > lim.hi) st.edge = 1;
    else if (target < lim.lo) st.edge = -1;
    else if (st.edge === 1 && target < lim.hi * (1 - EDGE_FREE)) st.edge = 0;
    else if (st.edge === -1 && target > lim.lo * (1 + EDGE_FREE)) st.edge = 0;
    k = room / st.S;
  }
  // scale about the focal point f: p' = f + k·(p − f)
  st.Tx = k * st.Tx + (1 - k) * e.focalX;
  st.Ty = k * st.Ty + (1 - k) * e.focalY;
  st.S *= k;
  return null;
}

/** one frame of the pan: the fingers' centre moves (`need` fingers or more: 2 where one finger draws, 1 on a canvas that only looks) */
export function panFrame(st: LiveState, e: { changeX: number; changeY: number; numberOfPointers: number }, need: number): Tf | null {
  "worklet";
  const jump = st.nPan !== 0 && e.numberOfPointers !== st.nPan;
  st.nPan = e.numberOfPointers;
  if (e.numberOfPointers < need) return closeSegment(st);
  st.seg = true;
  if (jump) return null;
  st.Tx += e.changeX;
  st.Ty += e.changeY;
  return null;
}

/** a gesture (pan or pinch) ended: the commit to make if a segment was going on (the second of the two ends finds none) */
export function endGesture(st: LiveState): Tf | null {
  "worklet";
  st.nPinch = 0;
  st.nPan = 0;
  return closeSegment(st);
}


/** a ⊖ b: the map that, after b, gives a — what is left of the live transform when b has been committed (S' = S_a/S_b, T' = T_a − S'·T_b) */
export function sub(a: Tf, b: Tf): Tf {
  "worklet";
  const S = a.S / b.S;
  return { S, Tx: a.Tx - S * b.Tx, Ty: a.Ty - S * b.Ty };
}

/** a view (k, ox, oy: plan → screen) after the live transform `t` is committed */
export interface View { k: number; ox: number; oy: number }
export const applyTf = (v: View, t: Tf): View => ({ k: v.k * t.S, ox: t.S * v.ox + t.Tx, oy: t.S * v.oy + t.Ty });

/** a commit made and not rendered yet: the view it made and the live transform it took */
export interface Pending { view: View; tf: Tf }

/**
 * The render of a view arrived. A commit of ours — the live transform loses exactly that commit (and the later pending ones are
 * re-based on it); a view that is not ours (the «fit» button, a new size) — the live transform is dropped, as before.
 * `last` — the view settled before: the SAME view again is not a new view but only another render of the screen (a blink, a hint,
 * a toast, a new size). It changes nothing: before (#1403, founder 14.11: «прыгает, то больше, то меньше»), every render of the
 * canvas's screen settled again, and «not ours» dropped the live transform to 1 under the fingers in the middle of a pinch.
 */
export function settle(live: Tf, pending: Pending[], view: View, last?: View): { live: Tf; pending: Pending[] } {
  if (last && view === last) return { live: tf(live), pending };
  const r = settleDone(pending, view);
  return { live: settleLive(live, r.done), pending: r.pending };
}

/**
 * `settle` in its two halves (#1403): the JS thread knows the commits (`settleDone`: which commit of ours the render took — null, the view is
 * not ours — and the pending ones re-based on it); the UI thread owns the live transform (`settleLive`). The fingers change the live
 * transform between frames there: read on the JS thread and written back, the frames in between were lost (a jump when a pinch had gone on
 * before the render of its last commit). So the screen hands `done` to the UI thread, and the subtraction is made there, in one step.
 */
export function settleDone(pending: Pending[], view: View): { done: Tf | null; pending: Pending[] } {
  const i = pending.findIndex((p) => p.view === view);
  if (i < 0) return { done: null, pending: [] };
  const done = pending[i]!.tf;
  return { done, pending: pending.slice(i + 1).map((p) => ({ view: p.view, tf: sub(p.tf, done) })) };
}

/** the live transform after the render of the commit `done` (null — a view not ours: the live transform goes whole) */
export function settleLive(live: Tf, done: Tf | null): Tf {
  "worklet";
  return done ? sub(live, done) : { S: IDENTITY.S, Tx: IDENTITY.Tx, Ty: IDENTITY.Ty };
}
