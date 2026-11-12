/**
 * The live transform of the canvas's own two gestures (pan, pinch) as pure steps (spec 33 П35 «жесты», #1271; founder 12.11: «щипком
 * приблизил с 1% до 100%, отпустил — откатилось примерно до 80%»). The cause, from the code: the live scale is multiplied by every
 * `scaleChange` of the pinch, including the last frames while the fingers lift (one pointer left, the span jumps: `scaleChange` < 1),
 * and the two gestures (pan with two pointers and pinch) both commit at their end — the first commit resets the live transform, the
 * second one commits what the late frames made of it (0.8 ×). The rule: only frames with TWO pointers count; the first end commits and
 * closes the gesture (`phase` 2), nothing after it counts until a new touch begins; one commit per gesture.
 * Functions are worklets (they run on the UI thread); plain objects in, the same object changed.
 */
export interface LiveState {
  tx: number;
  ty: number;
  s: number;
  /** 0 nothing yet, 1 a gesture is going on, 2 it has ended and committed (late events are ignored) */
  phase: 0 | 1 | 2;
  /** a pinch took part: the single-pointer frames of the lift are not a pan then */
  pinched: boolean;
}

export const idleState = (): LiveState => ({ tx: 0, ty: 0, s: 1, phase: 0, pinched: false });

/** a touch began: a new gesture */
export function beginGesture(st: LiveState): void {
  "worklet";
  if (st.phase !== 1) {
    st.phase = 1;
    st.pinched = false;
  }
}

/** one frame of the pinch: counted while two fingers are down */
export function pinchStep(st: LiveState, e: { scaleChange: number; numberOfPointers: number }): void {
  "worklet";
  if (st.phase !== 1 || e.numberOfPointers < 2) return;
  st.pinched = true;
  st.s *= e.scaleChange;
}

/** one frame of the pan: after a pinch only the frames with two fingers (the lift moves the focal point) */
export function panStep(st: LiveState, e: { changeX: number; changeY: number; numberOfPointers: number }): void {
  "worklet";
  if (st.phase !== 1 || (st.pinched && e.numberOfPointers < 2)) return;
  st.tx += e.changeX;
  st.ty += e.changeY;
}

/** a gesture of the two ended: true — commit the live transform now (once); a second end, or one with nothing moved, is false */
export function endGesture(st: LiveState): boolean {
  "worklet";
  if (st.phase !== 1) return false;
  st.phase = 2;
  return st.tx !== 0 || st.ty !== 0 || st.s !== 1;
}
