/**
 * The back swipe on a tab screen (founder 08.11: «с вкладки Лиды я не могу смахнуть назад»).
 * The root Stack has the iOS edge swipe of its own; the tab navigator has none. So a tab screen opened from somewhere
 * (Leads from «Ещё»: «‹ Ещё» in the header; another role's home: «‹ Главная») had a back button but no swipe.
 * Now such a screen has the same swipe from the left edge, and it does exactly what its header button does.
 * Pure (no React) — unit-tested in test/backSwipe.test.ts.
 */
export interface BackSwipeCtx {
  /** the screen lives in the tab navigator (roles.ts isTabScreen) */
  tabScreen: boolean;
  /** 820/1280: the side menu, no back button on a tab root */
  wide: boolean;
  /** Platform.OS */
  os: string;
  /** the header draws a «back» on this screen («‹ Ещё», «‹ Главная») */
  back: boolean;
  /** the keyboard is up: the finger is typing, not leaving (a sheet is a Modal above the screen — it takes the touch itself) */
  keyboard?: boolean;
}

/**
 * Is there a back swipe this screen adds itself: only a tab screen on the phone that has a header «back».
 * Not on a root-Stack screen (the native swipe is there already — two would fire), not on a bottom-bar tab root
 * (nowhere to go back to), not on Android (its system back already walks the tabs' history, docs/specs/28 §3).
 */
export function tabBackSwipe(o: BackSwipeCtx): boolean {
  return o.tabScreen && !o.wide && o.os !== "android" && o.back && !o.keyboard;
}

/**
 * Where the swipe may start: the screen's left margin (shell.ts navInsets.left, 16 or the notch). Nothing of the screen
 * lies there, so a sideways row (the filter lane, at 16) keeps its own scroll — the swipe never takes it.
 */
export const backSwipeEdge = (left: number) => left;
/** how far (points) the finger moves before the swipe takes over: right — the swipe, up or down — the scroll */
export const BACK_SWIPE_START = 10;
/** the share of the screen width, or the speed (points/s), after which letting go goes back — like the native swipe */
export const BACK_SWIPE_DISTANCE = 0.35;
export const BACK_SWIPE_VELOCITY = 500;

/** released at `dx` with speed `vx` on a screen `width` wide: back, or spring back to where it was */
export function swipeGoesBack(dx: number, vx: number, width: number): boolean {
  if (dx <= 0) return false;
  return dx > width * BACK_SWIPE_DISTANCE || vx > BACK_SWIPE_VELOCITY;
}
