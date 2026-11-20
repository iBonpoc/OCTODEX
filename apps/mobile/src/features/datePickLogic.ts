import { addDays, addMonths, type DayKey } from "./calendar";
import { weekdayOf } from "./zone";

/** what a day cell is (DS А7, the state table): each by its shape, not only by weight */
export type DayState = { selected: boolean; today: boolean; off: boolean; before: boolean; other: boolean };
export const dayState = (k: DayKey, o: { value: DayKey | null; today: DayKey; first: DayKey; month: DayKey; workday: (k: DayKey) => boolean }): DayState => ({
  selected: k === o.value,
  today: k === o.today,
  off: !o.workday(k),
  before: k < o.first,
  other: k.slice(0, 7) !== o.month.slice(0, 7),
});
/** the day the arrow keys move to (WAI-ARIA date grid): ←/→ a day, ↑/↓ a week, Home/End the week's ends, PageUp/PageDown a month */
export function dayKeyMove(k: DayKey, key: string, sundayFirst: boolean): DayKey | null {
  const pos = sundayFirst ? weekdayOf(k) : (weekdayOf(k) + 6) % 7;
  switch (key) {
    case "ArrowLeft": return addDays(k, -1);
    case "ArrowRight": return addDays(k, 1);
    case "ArrowUp": return addDays(k, -7);
    case "ArrowDown": return addDays(k, 7);
    case "Home": return addDays(k, -pos);
    case "End": return addDays(k, 6 - pos);
    case "PageUp": return addMonths(k, -1);
    case "PageDown": return addMonths(k, 1);
    default: return null;
  }
}
