import { useEffect } from "react";
import { Platform } from "react-native";
import { useNavigation } from "expo-router";
import { holdBackGesture, type GestureNav } from "./stackBackGesture";

/** the screen's navigation, or none where there is no navigator (the hook throws there; the guard must not) */
function useScreenNavigation(): GestureNav | null {
  try {
    return useNavigation() as unknown as GestureNav;
  } catch {
    return null;
  }
}

/**
 * Put next to a signature field (#2329): while it is on the screen, the screen's native back gesture is off, so a stroke
 * is never a «back». Renders nothing. Not on the web (no such gesture) and not outside a navigator.
 * `own` — the screen's own `gestureEnabled` (default: on). React Navigation does not tell a screen its current options,
 * so a screen that switches the gesture off by its options passes `own={false}` and keeps it off when the field leaves.
 */
export function StackBackGestureOff({ own = true }: { own?: boolean }) {
  const nav = useScreenNavigation();
  useEffect(() => {
    if (Platform.OS === "web" || !nav) return;
    return holdBackGesture(nav, own);
  }, [nav, own]);
  return null;
}
