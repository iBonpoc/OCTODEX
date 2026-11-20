/**
 * #2329: a finger signature on a stack screen must not be taken by the system's back swipe. Since iOS 26 the pop gesture
 * of a stack screen starts anywhere on the screen, so a stroke left → right in the signature field (from x ≈ 80) walked
 * the screen back and the signature was lost. While a signature field is on a screen, the screen's own back gesture is
 * off (the header «back» stays); it goes back to the screen's own setting when the last field is gone.
 *
 * No React here (test/stackBackGesture.test.ts); the component that calls it is ./StackBackGestureOff.tsx.
 */

/** what the guard needs of a screen's navigation object */
export interface GestureNav {
  setOptions: (o: { gestureEnabled: boolean }) => void;
}

/** the screen's back gesture is on only while no signature field holds it */
export const backGestureOn = (holds: number): boolean => holds <= 0;

/** two fields on one screen (the on-site signature and the countersign): the gesture comes back after the LAST one leaves */
export function holdCount(holds: number, delta: 1 | -1): number {
  return Math.max(0, holds + delta);
}

/** how many signature fields hold each screen's back gesture (by the screen's navigation object) */
const holds = new WeakMap<object, number>();

/**
 * A signature field is on `nav`'s screen: its back gesture goes off. Returns the release (call it when the field leaves):
 * after the LAST field the gesture goes back to `own` — the screen's own setting (default on), never forced on.
 */
export function holdBackGesture(nav: GestureNav, own = true): () => void {
  const set = (n: number) => {
    holds.set(nav, n);
    try {
      nav.setOptions({ gestureEnabled: backGestureOn(n) ? own : false });
    } catch {
      // the screen is already gone: nothing to set
    }
  };
  set(holdCount(holds.get(nav) ?? 0, 1));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    set(holdCount(holds.get(nav) ?? 0, -1));
  };
}
