import { useCallback, useEffect, useRef } from "react";
import { AppState, Linking, Platform } from "react-native";

/** Wait no longer than this for the call to end; then forget it. */
const WAIT_MS = 10 * 60 * 1000;
let pending: { remove: () => void } | null = null;

/**
 * «Позвонить»: open the system dialer, ask «Чем кончился?» after the call (spec 20 §3 «при возврате в приложение»).
 * On a phone the sheet waits until the app went to the background (the call) and came back — so it never slides up
 * under the system dialog; «Отменить» in that dialog (inactive → active) asks nothing. On the web there is no
 * system dialog over the app, so the sheet opens right away.
 */
export function dialThenAsk(phone: string, ask: () => void): () => void {
  pending?.remove();
  pending = null;
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`).catch(() => {});
  if (Platform.OS === "web") {
    ask();
    return () => {};
  }
  let away = false;
  const sub = AppState.addEventListener("change", (s) => {
    if (s === "background") away = true;
    else if (s === "active" && away) {
      done();
      ask();
    }
  });
  const timer = setTimeout(() => done(), WAIT_MS);
  const done = () => {
    clearTimeout(timer);
    sub.remove();
    if (pending === me) pending = null;
  };
  const me = { remove: done };
  pending = me;
  return done;
}

/**
 * dialThenAsk for a screen: the wait is dropped when the screen goes away (no sheet on a screen that is gone),
 * and one call asks once — a second tap replaces the wait instead of adding a second sheet.
 */
export function useDialThenAsk(): (phone: string, ask: () => void) => void {
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  return useCallback((phone: string, ask: () => void) => {
    cancel.current?.();
    cancel.current = dialThenAsk(phone, () => {
      cancel.current = null;
      ask();
    });
  }, []);
}
