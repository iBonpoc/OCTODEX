/**
 * The open card beside a list on 1280 (docs/specs/06-list-cards.md «Панель 1280», 10-nav-wide §1.5):
 * the address `?open=<id>`, ↑/↓ — the neighbour in the list, Esc — closes. Opening, ↑/↓ and Esc REPLACE the address
 * (router.setParams), so «back» leaves the list screen instead of stepping through every card shown.
 * 390/820 have no panel: a tap opens the card's own screen as before.
 */
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useDevice } from "@/theme/ThemeProvider";
import { isOutside, neighbor, panelId, panelKey } from "./listPanelRule";

export { isOutside, neighbor, panelId, panelKey } from "./listPanelRule";

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
        const onList = !el || el === document.body || !!el.closest('[data-testid="list-card"]');
        const k = panelKey(e, { typing, modal: !!document.querySelector('[aria-modal="true"]'), onList });
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
  // the visible open row: hidden screens of the stack stay in the page (another list with its own open row)
  const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="list-card"][aria-current="true"]')];
  rows.find((r) => r.offsetParent !== null)?.focus?.({ preventScroll: true });
}

/** after ↓/↑ (or any change of the open row): the row is scrolled into view if it went past the edge (долги №7) */
export function scrollSelectedRow() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="list-card"][aria-current="true"]')];
  rows.find((r) => r.offsetParent !== null)?.scrollIntoView?.({ block: "nearest" });
}

/**
 * One list's panel: `ids` — the rows in their order on screen now; `href` — the card's own screen; `known` — the id
 * exists for this person at all (a link to someone else's card does nothing).
 * 1280: `open(id)` opens the panel, `full()` — «⤢ Открыть»; 390/820: `open(id)` opens the card's screen.
 */
export function useListPanel(ids: readonly string[], href: (id: string) => string, known: (id: string) => boolean) {
  const { device } = useDevice();
  const desktop = device === "desktop";
  const { open: param } = useLocalSearchParams<{ open?: string }>();
  const raw = typeof param === "string" ? param : undefined;
  const openId = panelId(raw, desktop, known);
  const setOpen = (id: string | undefined) => router.setParams({ open: id });
  usePanelKeys(!!openId, (k) => setOpen(k === "close" ? undefined : neighbor(ids, openId, k === "down" ? 1 : -1)));
  // a link with ?open= opened on a narrower window: the card's own screen, once, as a tap there; the list under it
  // is left clean, so «back» does not bounce into the card again (review #425). Turning the tablet later only hides the panel.
  useEffect(() => {
    if (desktop || !raw || !known(raw)) return;
    router.setParams({ open: undefined });
    router.push(href(raw));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 1280: the card is gone for this person (deleted, another role): the panel closes and the address says so
  const stale = desktop && !!raw && !openId;
  useEffect(() => {
    if (stale) router.setParams({ open: undefined });
  }, [stale]);
  useEffect(() => {
    if (!openId || typeof requestAnimationFrame === "undefined") return;
    // the row is marked on the next render
    const id = requestAnimationFrame(scrollSelectedRow);
    return () => cancelAnimationFrame(id);
  }, [openId]);
  return {
    desktop,
    openId,
    /** the open card is not among the rows now (out of the filter or the search): the panel says so */
    outside: isOutside(ids, openId),
    open: (id: string) => (desktop ? setOpen(id) : router.push(href(id))),
    close: () => setOpen(undefined),
    full: () => {
      if (!openId) return;
      focusSelectedRow();
      router.push(href(openId));
    },
  };
}
