import { useEffect } from "react";
import { Platform } from "react-native";
import { useNavigation } from "expo-router";
import { backGestureOn, holdCount } from "./stackBackGesture";

/** how many signature fields hold each screen's back gesture (by the screen's navigation object) */
const holds = new WeakMap<object, number>();

/**
 * Put next to a signature field (#2329): while it is on the screen, the screen's native back gesture is off, so a stroke
 * is never a «back». Renders nothing. Not on the web (no such gesture) and not where the field is read-only (`off`).
 */
export function StackBackGestureOff({ off = true }: { off?: boolean }) {
  const nav = useNavigation();
  useEffect(() => {
    if (!off || Platform.OS === "web") return;
    const set = (n: number) => {
      holds.set(nav, n);
      try {
        nav.setOptions({ gestureEnabled: backGestureOn(n) });
      } catch {
        // the screen is already gone: nothing to set
      }
    };
    set(holdCount(holds.get(nav) ?? 0, 1));
    return () => set(holdCount(holds.get(nav) ?? 0, -1));
  }, [nav, off]);
  return null;
}
