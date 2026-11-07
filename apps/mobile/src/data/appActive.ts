/**
 * «The app is in front again» (React Native's AppState; on the web — the tab is shown again). The outbox stops its
 * pause and sends at once: a phone has no «online» event (review #244 №3). Kept apart so the store's unit tests can
 * stand it in (react-native does not load in node).
 */
import { AppState } from "react-native";

export function onAppActive(cb: () => void): () => void {
  const sub = AppState.addEventListener("change", (s) => {
    if (s === "active") cb();
  });
  return () => sub.remove();
}

/**
 * «The app is leaving»: React Native's AppState goes to the background or inactive (the phone may kill it soon); on the
 * web the tab is hidden, or the page is being left (a reload, a closed tab — `pagehide`). The store writes what waits
 * to be saved right then (persist.flushAllWriters: rule 6, a change in the last 250 ms is not lost).
 */
export function onAppLeave(cb: () => void): () => void {
  const sub = AppState.addEventListener("change", (s) => {
    if (s === "background" || s === "inactive") cb();
  });
  const w = typeof window !== "undefined" && typeof window.addEventListener === "function" ? window : null;
  const d = typeof document !== "undefined" && typeof document.addEventListener === "function" ? document : null;
  const hidden = () => {
    if (d?.visibilityState === "hidden") cb();
  };
  w?.addEventListener("pagehide", cb);
  d?.addEventListener("visibilitychange", hidden);
  return () => {
    sub.remove();
    w?.removeEventListener("pagehide", cb);
    d?.removeEventListener("visibilitychange", hidden);
  };
}
