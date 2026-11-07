import { useCallback, useSyncExternalStore } from "react";
import { useFocusEffect } from "expo-router";

/* ---------- «while signing»: a screen hides the bar for a while (rule А: the signature) ----------
 * A signature pad on a card (the client signs on site on an estimate or a visit) hides the bar while that screen is
 * focused — the bar would sit under the client's finger and a tab would leave the half-drawn signature. */
let hiders = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

/** true while a focused screen asks the bar away (useHideTabBar) */
export const useTabBarHidden = () => useSyncExternalStore(subscribe, () => hiders > 0, () => false);

/** call in a component that needs the whole screen (the signature pad): the bar is away while its screen is focused */
export function useHideTabBar() {
  useFocusEffect(
    useCallback(() => {
      hiders += 1;
      emit();
      return () => {
        hiders = Math.max(0, hiders - 1);
        emit();
      };
    }, []),
  );
}
