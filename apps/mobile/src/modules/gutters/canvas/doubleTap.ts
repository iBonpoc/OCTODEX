/**
 * The double tap of the canvas (spec 33 §3, #1273). Its own file: `gestureState.ts` holds worklets (they run on the UI thread), this runs
 * where the taps are read.
 */
/** the last tap of the canvas: when, and on what (an object id, or "" for the empty place) */
export interface LastTap { at: number; id: string }

/**
 * Is this tap the SECOND of a double tap (spec 33 §3, #1273)? Only a second tap on the SAME object inside `windowMs` counts; a single tap
 * never waits for it (the caller acts at once and only remembers the tap). `after` = the last tap, or null (none, a pinch since, a
 * selection cleared): then it is a first tap.
 */
export function isDoubleTap(after: LastTap | null, now: number, id: string, windowMs: number): boolean {
  return !!after && after.id === id && now - after.at >= 0 && now - after.at <= windowMs;
}
