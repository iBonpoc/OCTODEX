/**
 * A downspout just put (founder 16.11, #1763: «вначале моргнул, помигал, а потом открылось меню… полсекунды»): it blinks on
 * the canvas, and only after the last beat its sheet opens — on the phone the sheet would cover the blink. Reduce motion: no
 * blink, the sheet at once. Pure: the screen runs it (DrawScreen), the unit test checks the order and the time.
 */
import { motion } from "@octo/design-tokens";

export interface BlinkPlan {
  /** beats of the blink: off, on, off, on … (the mark ends shown) */
  steps: number;
  /** one beat, ms */
  stepMs: number;
  /** when the sheet opens, ms after the downspout is put — after the last beat */
  sheetAtMs: number;
}

export function blinkPlan(reduce: boolean, steps: number = motion.blinkSteps, stepMs: number = motion.blinkStepMs): BlinkPlan {
  if (reduce || steps <= 0 || stepMs <= 0) return { steps: 0, stepMs: 0, sheetAtMs: 0 };
  // an even count: the mark ends on «on», never left dimmed under the sheet
  const n = steps % 2 === 0 ? steps : steps + 1;
  return { steps: n, stepMs, sheetAtMs: n * stepMs };
}

/** the mark at beat `i` (0-based): dimmed on even beats — the first beat already shows the change */
export const dimAt = (i: number) => i % 2 === 0;
