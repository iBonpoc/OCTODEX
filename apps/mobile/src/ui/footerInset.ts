import { useSyncExternalStore } from "react";
import { size, space } from "@octo/design-tokens";

/**
 * The height of the pinned action bar (ui/actionBar.tsx) of the screen that is open, 0 when there is none. The toast (ui/overlays.tsx) stands
 * above it: a toast with «Отменить» that covers «Сохранить» for five seconds is a trap (review of #1277, DS §8.9).
 */
let height = 0;
const listeners = new Set<() => void>();
export function setFooterInset(h: number): void {
  if (h === height) return;
  height = h;
  listeners.forEach((l) => l());
}
export const useFooterInset = (): number =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => height,
    () => 0,
  );

/**
 * What a screen keeps at its right edge over its whole height (a full-screen canvas's side panel of properties, from 820): the toast
 * stands centred in the rest, never on it (#1895). 0 — nothing; the screen sets it and puts it back to 0 when it goes.
 */
let right = 0;
const rightListeners = new Set<() => void>();
export function setToastRight(r: number): void {
  if (r === right) return;
  right = r;
  rightListeners.forEach((l) => l());
}
export const useToastRight = (): number =>
  useSyncExternalStore(
    (l) => {
      rightListeners.add(l);
      return () => rightListeners.delete(l);
    },
    () => right,
    () => 0,
  );

/** where the bottom of the toast stands: its usual place, or above the pinned bar when there is one */
export const toastBottom = (usual: number, bar: number, gap: number): number => (bar > 0 ? Math.max(usual, bar + gap) : usual);

/** from 820: where the bottom of the toast stands — the window's bottom (safe area) + space[6], bottom centre (DS §15.2) */
export const wideToastBottom = (insetBottom: number): number => insetBottom + space[6];

/**
 * From 820 — the toast lane (DS §15.2, #1701): the bottom reserve of the screen's scroll, so that the end of the page scrolls out from under
 * a one-line toast (its place + its height + a gap above it). On a phone the screen's own bottom (tab bar, pinned bar) is kept.
 */
export const toastLane = (insetBottom: number): number => wideToastBottom(insetBottom) + size.hitMin + space[3];

/** the scroll's bottom reserve: what the screen needs anyway, and on wide screens no less than the toast lane */
export const scrollBottom = (own: number, wide: boolean, insetBottom: number): number => (wide ? Math.max(own, toastLane(insetBottom)) : own);
