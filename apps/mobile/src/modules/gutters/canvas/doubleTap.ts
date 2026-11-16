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

/** what one tap on the canvas does (#1563): the decision only — DrawScreen does it */
export type TapDo =
  /** «Водосток» on a gutter (or the empty place): put a downspout there if it lands on a gutter (its menu opens at once, as before) */
  | { do: "place" }
  /** nothing (the lift of a drag with «Водосток») */
  | { do: "ignore" }
  /** one tap: pick what is under the finger (null — nothing: the pick is dropped) */
  | { do: "pick"; id: string | null }
  /** two taps on the same thing: open its properties */
  | { do: "open"; id: string }
  /** two taps on the empty place with «Желоб»: the whole drawing */
  | { do: "fit" }
  /** two taps on the empty place with another tool: nothing */
  | { do: "none" };

/**
 * One rule for every tool (#1563, founder 14.11: «если выбран даунспот — меню сразу, если жёлоб — надо два раза»): one tap picks, two taps on the
 * same thing open its properties. «Водосток» on a gutter or the empty place puts a downspout, as before (founder 15.11: «ставится одним
 * нажатием на жёлоб, как сейчас — оставить»); on a downspout that stands it is the common rule — the one change (founder: «одно нажатие на
 * уже поставленный водосток его выбирает, свойства — двойным нажатием»). The lift of a drag with «Водосток» does nothing (as before); with «Желоб» it picks and never counts as
 * the first of two. `last` after the tap: what the next tap compares with — none after a placement (the next tap is a first one, never the
 * second of a tap made before the downspout was put: code-reviewer #1582).
 * `key`: the thing under the finger as the double tap compares it (an end, a corner, a gutter, a downspout); "" — nothing. `id`: its element.
 */
export function tapRule(o: { tool: "line" | "ds"; onDs: boolean; lift: boolean; key: string; id: string | null; last: LastTap | null; now: number; windowMs: number }): { act: TapDo; last: LastTap | null } {
  if (o.tool === "ds" && o.lift) return { act: { do: "ignore" }, last: null };
  if (o.tool === "ds" && !o.onDs) return { act: { do: "place" }, last: null };
  const dbl = !o.lift && isDoubleTap(o.last, o.now, o.key, o.windowMs);
  const last = dbl || o.lift ? null : { at: o.now, id: o.key };
  if (!dbl) return { act: { do: "pick", id: o.id }, last };
  if (!o.id) return { act: o.tool === "line" ? { do: "fit" } : { do: "none" }, last };
  return { act: { do: "open", id: o.id }, last };
}
