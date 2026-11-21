/**
 * The gestures of a folded line of the estimate (visual v2 №5 «Смета, редактор»: no «⋯» and no «≡» on the row — the actions are
 * a swipe and a hold, the drag is a hold). Pure; unit-tested in test/rowGesture.test.ts (rule 27: the phone is not the browser).
 * - a finger: a hold lifts the row (SortableList, `gesture.dragHoldMs`); let go where it was, not moved further than
 *   `gesture.dragStart` — the row's menu opens (as iOS: a held thing that is not carried shows its menu);
 * - a mouse / pen (the web): a move of `dragStart` drags; a long press without a move opens the menu (Pressable onLongPress).
 */
import { gesture } from "@octo/design-tokens";

/** the held row was let go where it was taken: the menu, not a drop */
export function holdStill(o: { canceled: boolean; ty: number; fine: boolean; key: string; open: boolean }): boolean {
  if (o.canceled || o.fine || o.open || !o.key.startsWith("l:")) return false;
  return Math.abs(o.ty) < gesture.dragStart;
}

/** the long press of the row's body opens its menu only for a mouse / pen: a finger's hold is the drag's (one gesture, one meaning) */
export const longPressMenu = (fine: boolean): boolean => fine;

/** the handle «≡» stands on a section and on the OPEN line only; a folded line is taken by its body */
export const showsHandle = (key: string, open: boolean): boolean => !key.startsWith("l:") || open;

/**
 * A drag that ended just now (#2350): the mouse's release over the row it carried is a «click» on the web — the folded row must
 * not open from it (a drop is not a tap). SortableList marks the end of a carried row; the row's tap within `slow` ms is ignored.
 */
export function createDragEnd(now: () => number = Date.now) {
  let last = -Infinity;
  return {
    ended: () => {
      last = now();
    },
    justDragged: (slow: number) => now() - last < slow,
  };
}
export const dragEnd = createDragEnd();
