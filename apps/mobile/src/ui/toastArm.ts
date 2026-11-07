import { motion } from "@octo/design-tokens";

/**
 * «Отменить» on a toast works only motion.toastArmMs after the toast showed. With «Уменьшить движение» (and on
 * 820/1280, where the toast sits by the form's button) the toast appears at once under the finger: the second tap of
 * a double tap on «Создать …» undid the client and the job it had just made (found by #261, e2e 64 / 121).
 * ~0.3 s (a double tap is ≤ ~0.25 s) does not get in the way of a deliberate «Отменить» or of a screen reader (focus moves first).
 */
export const toastArmed = (shownAt: number, now: number): boolean => now - shownAt >= motion.toastArmMs;
