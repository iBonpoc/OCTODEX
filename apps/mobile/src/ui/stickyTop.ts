/**
 * Where the stuck tabs / strip of a `Screen` stand: the sticky row sticks to the top of the scroll view, which on a phone is under
 * the status bar (the clock, the island). While it is stuck it is moved down by the safe-area top — by a transform, so the page
 * below does not jump when it sticks. Unstuck, or on a screen with no safe area (the web), no shift.
 */
export function stickyShift(stuck: boolean, safeTop: number): number {
  return stuck && safeTop > 0 ? safeTop : 0;
}
