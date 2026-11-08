/**
 * Pure rules of the open card beside a list on 1280 (docs/specs/06-list-cards.md «Панель 1280»); the hook — listPanel.ts.
 * No React here: unit-tested in test/listPanel.test.ts.
 */
/** the next (`1`) or previous (`-1`) id in the list; at the ends — stays; not in the list (filtered out) — the first */
export function neighbor(ids: readonly string[], cur: string | undefined, dir: 1 | -1): string | undefined {
  if (ids.length === 0) return undefined;
  const i = cur ? ids.indexOf(cur) : -1;
  if (i < 0) return ids[0];
  return ids[Math.min(ids.length - 1, Math.max(0, i + dir))];
}

/** the panel is shown only on the desktop and for a card this person may open — also one the list's filter hides now:
 *  an action in the panel (signed, paid) or a link to a closed card must not close it (review #426) */
export function panelId(open: string | string[] | undefined, desktop: boolean, known: (id: string) => boolean): string | undefined {
  const id = Array.isArray(open) ? open[0] : open;
  return desktop && id && known(id) ? id : undefined;
}

/** the open card is not among the rows now (another filter, the search): the panel marks it «Нет в списке» */
export function isOutside(ids: readonly string[], openId: string | undefined): boolean {
  return !!openId && !ids.includes(openId);
}

/** the key that moves the panel, or nothing: a field is typed in, a sheet or menu is open, a modifier is held;
 *  ↑/↓ only when the focus is on the list's rows or nowhere (not in the panel's own scroll, the filter lane, the menu) */
export function panelKey(e: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; isComposing?: boolean; defaultPrevented?: boolean; repeat?: boolean }, ctx: { typing: boolean; modal: boolean; onList: boolean }): "up" | "down" | "close" | undefined {
  if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || ctx.typing || ctx.modal) return undefined;
  if (e.key === "Escape") return e.repeat ? undefined : "close";
  if (!ctx.onList) return undefined;
  return e.key === "ArrowDown" ? "down" : e.key === "ArrowUp" ? "up" : undefined;
}
