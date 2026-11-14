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
  /** where the fingers of the last pinch frame were (screen px): the release at a limit goes back about this point, so the picture does not jump (#1403) */
  fx: number;
  fy: number;
  /** the pinch is past a limit of the scale: −1 the farthest, 1 the nearest, 0 free. It frees only when the scale is back inside by EDGE_FREE (a hysteresis), so a hand shaking at the limit ticks once, not on every frame (#1403, #1406) */
  edge: -1 | 0 | 1;
}
/** how far inside a limit (a share of it) the scale must come back before the next tick may be made */
export const EDGE_FREE = 0.02;

/** the scale the live transform may reach, as a factor of the view on the screen (kMin / k, kMax / k); beyond it the scale gives way as a rubber does */
export interface ScaleLimit { lo: number; hi: number }
/**
 * The rubber past a limit (#1403, founder 14.11: «пальцы отлипают»; the way UIScrollView bounces a zoom — Maps, Photos, Freeform): the
 * visible scale goes on for ever, the further the slower, to RUBBER (a share of the limit) at most, and its slope is 1 at the limit — no
 * step, no wall. The fingers' own scale (`raw`) is what the pinch multiplies; the screen shows `rubber(raw)`; the release goes back to the limit.
 */
export const RUBBER = 0.15;

/** the scale the screen shows for the fingers' scale `raw` */
export function rubber(raw: number, lim: ScaleLimit): number {
  "worklet";
  if (raw > lim.hi) return lim.hi * (1 + RUBBER * (1 - Math.exp(-(raw / lim.hi - 1) / RUBBER)));
  if (raw < lim.lo) return lim.lo / (1 + RUBBER * (1 - Math.exp(-(lim.lo / raw - 1) / RUBBER)));
  return raw;
}

/** the fingers' scale for the scale on the screen (the inverse of `rubber`; a value on the screen is always inside the rubber's reach) */
export function unrubber(vis: number, lim: ScaleLimit): number {
  "worklet";
  if (vis > lim.hi) return lim.hi * (1 - RUBBER * Math.log(1 - Math.min(vis / lim.hi - 1, RUBBER * (1 - 1e-9)) / RUBBER));
  if (vis < lim.lo) return lim.lo / (1 - RUBBER * Math.log(1 - Math.min(lim.lo / vis - 1, RUBBER * (1 - 1e-9)) / RUBBER));
  return vis;
}

export const idleState = (): LiveState => ({ S: 1, Tx: 0, Ty: 0, seg: false, nPinch: 0, nPan: 0, fx: 0, fy: 0, edge: 0 });

/** a copy of the transform. A WORKLET like its callers: a plain function cannot be called on the UI thread of a phone (the app went down on every pinch, #1390) */
function tf(st: Tf): Tf {
  "worklet";
  return { S: st.S, Tx: st.Tx, Ty: st.Ty };
}

/** the segment (two fingers down) ends: the commit to make, if the live transform moved (defined first: a worklet is a const once compiled) */
function closeSegment(st: LiveState, lim?: ScaleLimit): Tf | null {
  "worklet";
  if (!st.seg) return null;
  st.seg = false;
  st.edge = 0;
  const moved = st.S !== 1 || st.Tx !== 0 || st.Ty !== 0;
  if (!moved) return null;
  const t = tf(st);
  // let go past a limit: the commit is the transform GONE BACK to the limit about the fingers' point (the screen animates to it, then commits; no jump)
  if (lim && (st.S > lim.hi || st.S < lim.lo)) {
    const k = (st.S > lim.hi ? lim.hi : lim.lo) / st.S;
    return { S: t.S * k, Tx: k * t.Tx + (1 - k) * st.fx, Ty: k * t.Ty + (1 - k) * st.fy };
  }
  return t;
}

/** one frame of the pinch: scale about the frame's own focal point (it follows the fingers) while two fingers are down; the commit to make, if the frame closes a segment */
export function pinchFrame(st: LiveState, e: { scaleChange: number; numberOfPointers: number; focalX: number; focalY: number }, lim?: ScaleLimit): Tf | null {
  "worklet";
  const jump = st.nPinch !== 0 && e.numberOfPointers !== st.nPinch;
  st.nPinch = e.numberOfPointers;
  if (e.numberOfPointers < 2) return closeSegment(st, lim);
  st.seg = true;
  if (jump) return null; // the first frame after the count changed: its delta is the jump
  st.fx = e.focalX;
  st.fy = e.focalY;
  let k = e.scaleChange;
  // the rubber at a limit of the scale: the fingers' scale goes on, the screen shows it softened, and the factor applied is the screen's own step
  if (lim) k = rubber(unrubber(st.S, lim) * k, lim) / st.S;
  const S1 = st.S * k;
  // the tick when the pinch reaches a limit (founder 14.11: «вибрация на пределах была»): once, then again only after the scale was back inside by EDGE_FREE
  if (lim) {
    if (S1 > lim.hi) st.edge = 1;
    else if (S1 < lim.lo) st.edge = -1;
    else if (st.edge === 1 && S1 < lim.hi * (1 - EDGE_FREE)) st.edge = 0;
    else if (st.edge === -1 && S1 > lim.lo * (1 + EDGE_FREE)) st.edge = 0;
  }
  // scale about the focal point f: p' = f + k·(p − f)
  st.Tx = k * st.Tx + (1 - k) * e.focalX;
  st.Ty = k * st.Ty + (1 - k) * e.focalY;
  st.S *= k;
  return null;
}

/** one frame of the pan: the fingers' centre moves (`need` fingers or more: 2 where one finger draws, 1 on a canvas that only looks) */
export function panFrame(st: LiveState, e: { changeX: number; changeY: number; numberOfPointers: number }, need: number, lim?: ScaleLimit): Tf | null {
  "worklet";
  const jump = st.nPan !== 0 && e.numberOfPointers !== st.nPan;
  st.nPan = e.numberOfPointers;
  if (e.numberOfPointers < need) return closeSegment(st, lim);
  st.seg = true;
  if (jump) return null;
  st.Tx += e.changeX;
  st.Ty += e.changeY;
  return null;
}

/** a gesture (pan or pinch) ended: the commit to make if a segment was going on (the second of the two ends finds none) */
export function endGesture(st: LiveState, lim?: ScaleLimit): Tf | null {
  "worklet";
  st.nPinch = 0;
  st.nPan = 0;
  return closeSegment(st, lim);
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
 */
export function settle(live: Tf, pending: Pending[], view: View): { live: Tf; pending: Pending[] } {
  const i = pending.findIndex((p) => p.view === view);
  if (i < 0) return { live: tf(IDENTITY), pending: [] };
  const done = pending[i]!.tf;
  return { live: sub(live, done), pending: pending.slice(i + 1).map((p) => ({ view: p.view, tf: sub(p.tf, done) })) };
}
