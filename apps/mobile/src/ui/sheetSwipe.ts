/**
 * Swipe down on the body of a sheet to close it, as on iPhone (#505, #714). Pure: how far the sheet follows the finger
 * and whether letting go closes it. The finger moves the list first: while the list is scrolled down, a downward
 * drag scrolls it back; the sheet follows only from the moment the list is at its top (`base` — the finger's travel
 * then), so one stroke can scroll to the top and go on to close the sheet. Upward never moves the sheet.
 */
export interface SwipeState {
  /** the finger's downward travel when the list reached its top; null — the list is not at its top yet */
  base: number | null;
}

/** one move of the finger: the list's scroll and the finger's travel since it went down */
export function swipeStep(s: SwipeState, scrollTop: number, travel: number): { state: SwipeState; drag: number } {
  if (scrollTop > 0) return { state: { base: null }, drag: 0 };
  const base = s.base ?? travel;
  return { state: { base }, drag: Math.max(0, travel - base) };
}

/** let go: far enough or fast enough (the same thresholds as the grabber); a sheet not moved never closes */
export function swipeCloses(drag: number, velocity: number, far: number, fast: number): boolean {
  if (drag <= 0) return false;
  return drag > far || velocity > fast;
}

/**
 * How long the sheet takes to leave once it is let go (DS Б1, #1163): at the finger's speed — the way left ÷ the speed —
 * but never quicker than `min` (a flick must not look like a cut) nor slower than `max`; no speed (✕, the scrim, Esc) — `rest`.
 */
export function exitDuration(left: number, velocity: number, min: number, max: number, rest: number): number {
  if (!(velocity > 0)) return rest;
  return Math.min(max, Math.max(min, left / velocity));
}

/** The scrim follows the sheet: full while it is in place, gone when it has left (0..1) */
export function scrimLevel(drag: number, height: number): number {
  "worklet";
  if (height <= 0) return 1;
  return 1 - Math.min(1, Math.max(0, drag / height));
}

/**
 * Whether a finger on the body becomes the swipe (the pan is activated by hand, so a child can keep its finger):
 * a child holding it (the tape, a signature) — never; sideways past the slop — never (a slider); down past the slop,
 * mostly down — yes; up, or not far yet — wait (an upward drag is the list's scroll, the pan just never starts).
 */
export function swipeStart(dx: number, dy: number, slop: number, held: boolean): "activate" | "fail" | "wait" {
  if (held) return "fail";
  if (Math.abs(dx) > slop && Math.abs(dx) * 2 >= Math.abs(dy)) return "fail";
  if (dy > slop && dy > Math.abs(dx) * 2) return "activate";
  return "wait";
}
