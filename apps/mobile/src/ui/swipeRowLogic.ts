/**
 * The math of the shared row swipe (`./swipeRow`, #2350), without the view: a test runs it (rule 27а).
 * `tx` — how far the row has moved: > 0 to the right (shows the LEFT actions), < 0 to the left (shows the RIGHT actions).
 * A swipe past `fullAt` arms the full swipe: letting go there runs the first action of that side (the one at the outer edge).
 * DS Б13 п.2: the full swipe is only to the RIGHT (the left actions) and only for a reversible action with «Отменить»
 * (`fullLeft`); to the left — the buttons only, by a press (an archive or a delete must not run by a long move in gloves).
 */
export type SwipeSide = "left" | "right";

export interface SwipeGeom {
  /** the row's width, px (0 while not measured yet: no full swipe then) */
  rowW: number;
  /** one action's width (`component.swipeAction.w`) */
  btnW: number;
  /** the part of the row a full swipe needs (`component.swipeAction.full`) */
  full: number;
  /** how many actions each side has */
  nLeft: number;
  nRight: number;
  /** the first left action runs on a full swipe (DS Б13 п.2: reversible, with «Отменить») */
  fullLeft: boolean;
  /** once armed, the full swipe is let go only this far back inside its line (`gesture.swipeFullHysteresis`) */
  hysteresis: number;
}

/** the side the row shows at `tx`; null at rest or toward a side with no actions */
export function sideOf(tx: number, g: Pick<SwipeGeom, "nLeft" | "nRight">): SwipeSide | null {
  "worklet";
  if (tx > 0 && g.nLeft > 0) return "left";
  if (tx < 0 && g.nRight > 0) return "right";
  return null;
}

/**
 * how far a full swipe is, px: `full` of the row, but never before all the buttons of that side are wholly out and half a
 * button more (else a slow open would run the action by itself); Infinity when the row is not measured
 */
export function fullAt(g: SwipeGeom, side: SwipeSide): number {
  "worklet";
  if (g.rowW <= 0) return Infinity;
  const n = side === "left" ? g.nLeft : g.nRight;
  return Math.max(g.rowW * g.full, (n + 0.5) * g.btnW);
}

/** the full swipe is armed at `tx`: the side whose first action letting go would run, or null */
export function armedAt(tx: number, g: SwipeGeom, was: boolean = false): SwipeSide | null {
  "worklet";
  const side = sideOf(tx, g);
  if (side !== "left" || !g.fullLeft) return null;
  const line = fullAt(g, side);
  return Math.abs(tx) >= (was ? line - g.hysteresis : line) ? side : null;
}

/** the buttons open (stay out) when let go past half of the first button */
export const openThreshold = (btnW: number) => btnW / 2;

/** the vibration on a change of the armed state: `light` once on arming (DS §15.6, Б13 п.2); going back is silent */
export function armBuzz(was: SwipeSide | null, now: SwipeSide | null): boolean {
  return now !== null && was !== now;
}

/**
 * the order on screen: the first action stands at the outer edge — the left side as given (first leftmost), the right side
 * reversed (first rightmost), as iOS Mail
 */
export function screenOrder<T>(list: readonly T[], side: SwipeSide): T[] {
  return side === "left" ? [...list] : [...list].reverse();
}

/** one row of a screen is open at a time: opening another closes the first (DS Б13) */
export interface SwipeCloser {
  close: () => void;
}
export function createSwipeGroup() {
  let open: SwipeCloser | null = null;
  return {
    opened: (c: SwipeCloser) => {
      if (open && open !== c) open.close();
      open = c;
    },
    closed: (c: SwipeCloser) => {
      if (open === c) open = null;
    },
  };
}
