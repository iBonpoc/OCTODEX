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
