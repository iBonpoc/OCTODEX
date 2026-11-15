import { motion } from "@octo/design-tokens";

/**
 * «Отменить» on a toast works only motion.toastArmMs after the toast showed. With «Уменьшить движение» (and on
 * 820/1280, where the toast sits by the form's button) the toast appears at once under the finger: the second tap of
 * a double tap on «Создать …» undid the client and the job it had just made (found by #261, e2e 64 / 121).
 * ~0.3 s (a double tap is ≤ ~0.25 s) does not get in the way of a deliberate «Отменить» or of a screen reader (focus moves first).
 */
/**
 * The id of the toast a `show` puts on screen (DS §15.2): `grow` names the toast on screen — while it is there it stays (the
 * same toast, new text, 5 fresh seconds); gone or replaced — a new toast (its id is the moment it shows).
 */
export const toastIdFor = (onScreen: number | undefined, grow: number | undefined, now: number): number =>
  grow !== undefined && onScreen === grow ? grow : now;
/** the timer of a show hides the toast only if it is still that show (a grown toast has a later `at`) */
export const toastExpires = (cur: { id: number; at: number } | null, id: number, at: number): boolean => cur?.id === id && cur.at === at;

export const toastArmed = (shownAt: number, now: number): boolean => now - shownAt >= motion.toastArmMs;
