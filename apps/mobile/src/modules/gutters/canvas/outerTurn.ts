/**
 * The turn of the canvas view by two fingers (#2988, founder 27.11: «должен быть поворот на 360 на чертеже… двумя пальцами… не только
 * приближать-отдалять, но и крутить»; spec 33 П39, stage 1). Only the VIEW turns (founder 19.11): the drawing and every PDF stay as they are.
 *
 * How it is wired (simpler than turning every step of `gestureState.ts`, which stays as tested): the canvas layer — the drawing and the grid
 * — is turned as a whole by θ about the canvas's centre C. Inside it everything is as before (the «inner» frame: the view k, ox, oy and the
 * live scale + shift). A screen point s and an inner point p: s = C + R(θ)(p − C).
 *  - a finger's point on the screen goes into the inner frame first (`toInner`), then `toPlan` as before: drawing and picking work turned;
 *  - the pinch's focal point and the pan's shift come into the inner frame the same way (`toInner`, `innerDelta`);
 *  - a turn by d about the fingers' anchor A is: θ → θ + d, and the inner frame shifted by `turnShift` — the point under the fingers stays
 *    under them, every frame (tested);
 *  - «Север вверх» turns about C itself: θ → 0, no shift at all — the point at the centre stays.
 * The threshold, the right angles and the tick are `rotFrame` of `viewRotate.ts` (stage 0, tested there). Every function is a worklet
 * (the UI thread; #1390). Angles are radians, the screen's y goes down: a positive angle turns clockwise, as RNGH's `rotation`.
 */

/** the live shift of the inner frame */
export interface Shift { Tx: number; Ty: number }
/** a point or a shift on the screen (px) */
export interface XY { x: number; y: number }

/** a screen point of the canvas → the inner (unturned) frame: p = C + R(−θ)(s − C) */
export function toInner(th: number, cx: number, cy: number, x: number, y: number): XY {
  "worklet";
  const c = Math.cos(th);
  const n = Math.sin(th);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + c * dx + n * dy, y: cy - n * dx + c * dy };
}

/** an inner point → the screen: s = C + R(θ)(p − C) (where a chip over the canvas stands for a plan point) */
export function toOuter(th: number, cx: number, cy: number, x: number, y: number): XY {
  "worklet";
  const c = Math.cos(th);
  const n = Math.sin(th);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + c * dx - n * dy, y: cy + n * dx + c * dy };
}

/** a shift on the screen (the pan's change) in the inner frame: R(−θ)·d */
export function innerDelta(th: number, dx: number, dy: number): XY {
  "worklet";
  const c = Math.cos(th);
  const n = Math.sin(th);
  return { x: c * dx + n * dy, y: -n * dx + c * dy };
}

/**
 * The view turns by d about the screen point A (the fingers' anchor): the layer goes θ → θ + d about C, and the inner frame shifts by this —
 * so that A shows the same plan point after the turn as before: shift = R(−(θ + d))·(I − R(d))·(A − C).
 */
export function turnShift(th: number, d: number, ax: number, ay: number, cx: number, cy: number): XY {
  "worklet";
  const c = Math.cos(d);
  const n = Math.sin(d);
  const vx = ax - cx;
  const vy = ay - cy;
  // (I − R(d))·v
  const wx = vx - (c * vx - n * vy);
  const wy = vy - (n * vx + c * vy);
  return innerDelta(th + d, wx, wy);
}

/** the counter-turn of a label (degrees) so its words stay level on the screen: the layer is turned by θ */
export const labelTurnDeg = (th: number): number => (Math.abs(th) < 1e-9 ? 0 : (-th * 180) / Math.PI);

/** the view is turned (the «север вверх» button shows only then) */
export const turned = (th: number): boolean => Math.abs(th) > 1e-6;

/** how far the drawn layers reach past the canvas on each side, so a turned layer still covers the corners: half the diagonal less half the shorter side, rounded up */
export function turnPad(w: number, h: number): number {
  return Math.max(0, Math.ceil(Math.hypot(w, h) / 2 - Math.min(w, h) / 2));
}

/** a pinch frame of RNGH in the inner frame: the focal point turned back (the scale itself does not change with a turn) */
/** the fields of a pinch frame the canvas reads */
export interface PinchE { scaleChange: number; numberOfPointers: number; focalX: number; focalY: number }
/** the fields of a pan frame the canvas reads */
export interface PanE { changeX: number; changeY: number; numberOfPointers: number }

export function pinchIn(th: number, cx: number, cy: number, e: PinchE): PinchE {
  "worklet";
  const f: XY = th === 0 ? { x: e.focalX, y: e.focalY } : toInner(th, cx, cy, e.focalX, e.focalY);
  return { scaleChange: e.scaleChange, numberOfPointers: e.numberOfPointers, focalX: f.x, focalY: f.y };
}

/** a pan frame of RNGH in the inner frame: its change turned back */
export function panIn(th: number, e: PanE): PanE {
  "worklet";
  const d: XY = th === 0 ? { x: e.changeX, y: e.changeY } : innerDelta(th, e.changeX, e.changeY);
  return { changeX: d.x, changeY: d.y, numberOfPointers: e.numberOfPointers };
}

/** one step of the turn: the live shift `st` (the inner frame's Tx, Ty) moved so the anchor A stays; gives the new angle of the layer */
export function turnStep(st: Shift, th: number, d: number, ax: number, ay: number, cx: number, cy: number): number {
  "worklet";
  if (d === 0) return th;
  const s = turnShift(th, d, ax, ay, cx, cy);
  st.Tx += s.x;
  st.Ty += s.y;
  let r = th + d;
  if (r <= -Math.PI) r += 2 * Math.PI;
  else if (r > Math.PI) r -= 2 * Math.PI;
  return r;
}
