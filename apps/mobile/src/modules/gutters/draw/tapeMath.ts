/**
 * The tape's arithmetic, pure (spec 33, #1315): where a pulled tape settles, and when a mark deserves a tick in the hand.
 */

/** the mark a tape settles on: the nearest whole one inside 1..max (a drag or a flick ends between marks; the value never does) */
export const settleAt = (f: number, max: number): number => Math.min(max, Math.max(1, Math.round(f)));

/** the least time between two ticks (ms): a flick runs over a mark every few ms — the hand gets a tick, not a buzz */
export const TICK_GAP_MS = 28;

/** a tick (`haptics.selection`) is due when the value moved to another mark and the last tick was long enough ago */
export const tickDue = (from: number, to: number, lastTickMs: number, nowMs: number): boolean => to !== from && nowMs - lastTickMs >= TICK_GAP_MS;
