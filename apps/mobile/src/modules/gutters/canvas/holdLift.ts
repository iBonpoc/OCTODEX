/**
 * The hold that picks something up (#1272, founder 12.11: «не чувствую момента, когда можно тянуть»; review of the director) as a pure
 * state machine, so the order of events can be tested: a finger held still on an end, a corner or a downspout for the long-press time
 * picks it up AT ONCE (`light` + the lifted look) before it moves; the drag after it has no second «взял»; a move before the time is
 * the ordinary action (drawing) without one; a touch that lifted something is not a tap; letting go or a second finger cancels the timer.
 *   idle → (touch) armed → (time ran out, something to take) lifted | (moved / let go / second finger) idle
 */
export type Hold = "idle" | "armed" | "lifted";

export interface HoldResult { hold: Hold; /** play `light` now */ light: boolean }

/** a finger touched down: the timer starts */
export const holdBegin = (): HoldResult => ({ hold: "armed", light: false });

/** the long-press time ran out with the finger still: if there is something to take it is picked up now, before any move */
export function holdFire(hold: Hold, target: boolean): HoldResult {
  if (hold !== "armed") return { hold, light: false };
  return target ? { hold: "lifted", light: true } : { hold: "idle", light: false };
}

/**
 * The finger moved far enough to start the pan. `takesAtOnce`: the thing under it is dragged at once without a hold (a downspout) —
 * its «взял» is at this first move, once, unless the hold already did it.
 */
export function holdMove(hold: Hold, takesAtOnce: boolean): HoldResult {
  if (hold === "lifted") return { hold, light: false }; // picked up already: no second «взял»
  return { hold: "idle", light: takesAtOnce };
}

/** let go without a move, a second finger, or the screen left: the timer is off; a lifted touch stays lifted until the next one (it is not a tap) */
export const holdCancel = (hold: Hold): HoldResult => ({ hold: hold === "lifted" ? "lifted" : "idle", light: false });

/** a touch that picked something up is not a tap */
export const holdIsTap = (hold: Hold): boolean => hold !== "lifted";
