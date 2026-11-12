import { useSyncExternalStore } from "react";

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

/** where the bottom of the toast stands: its usual place, or above the pinned bar when there is one */
export const toastBottom = (usual: number, bar: number, gap: number): number => (bar > 0 ? Math.max(usual, bar + gap) : usual);
