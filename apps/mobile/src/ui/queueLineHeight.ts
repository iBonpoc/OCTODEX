import { useSyncExternalStore } from "react";

/* The height of the offline queue's line on screen right now (#2214): the toasts stand above it. A tiny external store — the tab
 * bar mounts the line (`QueueLine docked`), the toasts read it; kept apart so `overlays` and `queueLine` do not import each other. */
let shownH = 0;
const subs = new Set<() => void>();
export const setQueueLineHeight = (h: number) => {
  if (h === shownH) return;
  shownH = h;
  subs.forEach((f) => f());
};
/** how much the offline queue's line adds over the tab bar (0 when it is not on screen) */
export const useQueueLineHeight = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    () => shownH,
    () => 0,
  );
