/**
 * #2329: a finger signature on a stack screen must not be taken by the system's back swipe. Since iOS 26 the pop gesture
 * of a stack screen starts anywhere on the screen, so a stroke left → right in the signature field (from x ≈ 80) walked
 * the screen back and the signature was lost. While a signature field is on a screen, the screen's own back gesture is
 * off (the header «back» stays); it is back on when the last field is gone.
 *
 * Pure counting here (test/stackBackGesture.test.ts); the hook is in ./StackBackGestureOff.tsx.
 */

/** the screen's back gesture is on only while no signature field holds it */
export const backGestureOn = (holds: number): boolean => holds <= 0;

/** two fields on one screen (the on-site signature and the countersign): the gesture comes back after the LAST one leaves */
export function holdCount(holds: number, delta: 1 | -1): number {
  return Math.max(0, holds + delta);
}
