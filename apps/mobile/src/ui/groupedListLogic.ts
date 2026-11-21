/** The rules of GroupRow (src/ui/groupedList.tsx, BUILD-SPEC §1 «GroupedList / ListRow 56»). */
import type { SwipeAction } from "./swipeRow";

/** all the row's swiped actions in one list (a long press menu, the screen reader's actions): the left ones first, no repeats */
export function rowActions(swipe: { left?: SwipeAction[]; right?: SwipeAction[] } | undefined): SwipeAction[] {
  const seen = new Set<string>();
  return [...(swipe?.left ?? []), ...(swipe?.right ?? [])].filter((a) => !seen.has(a.key) && !!seen.add(a.key));
}

/** what a screen reader hears on a row: the title, the line, the sum, the status — the empty ones left out */
export function rowSaid(p: { title: string; subtitle?: string; value?: string; status?: { label: string } }): string {
  return [p.title, p.subtitle, p.value, p.status?.label].filter(Boolean).join(", ");
}
