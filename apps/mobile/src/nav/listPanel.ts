/**
 * The open card beside a list on 1280 (docs/specs/06-list-cards.md «Панель 1280», 10-nav-wide §1.5):
 * the address `?open=<id>`, ↑/↓ — the neighbour in the list, Esc — closes. Opening, ↑/↓ and Esc REPLACE the address
 * (router.setParams), so «back» leaves the list screen instead of stepping through every card shown.
 * 390/820 have no panel: a tap opens the card's own screen as before.
 */
import { useCallback, useRef } from "react";
import { Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { panelKey } from "./listPanelRule";

export { neighbor, panelId, panelKey } from "./listPanelRule";

/** ↑/↓/Esc on the web while the list screen is in focus and a panel is open */
export function usePanelKeys(on: boolean, act: (k: "up" | "down" | "close") => void) {
  const ref = useRef(act);
  ref.current = act;
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "web" || !on || typeof document === "undefined") return;
      const onKey = (e: KeyboardEvent) => {
        const el = document.activeElement as HTMLElement | null;
        const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
        const k = panelKey(e, { typing, modal: !!document.querySelector('[aria-modal="true"]') });
        if (!k) return;
        e.preventDefault();
        ref.current(k);
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [on]),
  );
}

/** before «⤢ Открыть»: the focus goes to the selected row, so «back» from the card's screen lands on it (spec 10, Н3а) */
export function focusSelectedRow() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  (document.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus?.({ preventScroll: true });
}
