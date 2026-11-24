/** The rules of GroupRow (src/ui/groupedList.tsx, BUILD-SPEC §1 «GroupedList / ListRow 56»). */
import type { SwipeAction } from "./swipeRow";

/** all the row's swiped actions in one list (a long press menu, the screen reader's actions): the left ones first, no repeats */
export function rowActions(swipe: { left?: SwipeAction[]; right?: SwipeAction[] } | undefined): SwipeAction[] {
  const seen = new Set<string>();
  return [...(swipe?.left ?? []), ...(swipe?.right ?? [])].filter((a) => !seen.has(a.key) && !!seen.add(a.key));
}

/** what a screen reader hears on a row: the title, the line, the sum, the status — the empty ones left out */
export function rowSaid(p: { title: string; subtitle?: string; value?: string; status?: { label: string }; when?: string }): string {
  return [p.when, p.title, p.subtitle, p.value, p.status?.label].filter(Boolean).join(", ");
}

/**
 * The role of a pressable thing that holds its own buttons (a ListCard with «Позвонить» / a status chip inside): a phone reads it as
 * a button (VoiceOver / TalkBack, the inner ones are its actions); the web has no button inside a button («<button> cannot contain a
 * nested <button>», react-native-web makes a `button` role a <button>) — there it is a `group` named by its title, opened by Enter.
 * A row whose actions can stand beside it (GroupRow) puts them beside it instead and stays a button everywhere.
 */
export function outerPressRole(os: string, hasInnerButtons: boolean): "button" | "group" {
  return os === "web" && hasInnerButtons ? "group" : "button";
}
