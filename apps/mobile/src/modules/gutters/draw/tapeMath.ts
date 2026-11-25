/**
 * The tape's arithmetic, pure (spec 33, #1315): where a pulled tape settles, and when a mark deserves a tick in the hand.
 */

/** the mark a tape settles on: the nearest whole one inside 1..max (a drag or a flick ends between marks; the value never does) */
export const settleAt = (f: number, max: number): number => Math.min(max, Math.max(1, Math.round(f)));

/** the least time between two ticks (ms): a flick runs over a mark every few ms — the hand gets a tick, not a buzz */
export const TICK_GAP_MS = 28;

/** a tick (`haptics.selection`) is due when the value moved to another mark and the last tick was long enough ago */
export const tickDue = (from: number, to: number, lastTickMs: number, nowMs: number): boolean => to !== from && nowMs - lastTickMs >= TICK_GAP_MS;

/** past an end: the share of the pull the tape follows */
export const GIVE = 0.3;
/** past an end the tape gives a little (a third of the pull), as a real one does — the sample's edge */
export const give = (f: number, max: number): number => (f < 1 ? 1 - (1 - f) * GIVE : f > max ? max + (f - max) * GIVE : f);
/**
 * Where the tape is under the finger (marks): from the mark it held when touched (`start`), moved by the finger's path
 * `dx` (px; dragged left, more comes out), one mark per `tick` px. Only the touch and the path: a redraw in between (the
 * value written back by the window, #2414) never moves it.
 */
export const pullAt = (start: number, dx: number, tick: number, max: number): number => give(start - dx / tick, max);
