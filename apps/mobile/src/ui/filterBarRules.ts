/**
 * Which status chips the filter bar shows (founder 07.11 «очень много кнопок сверху», spec: заявка №6).
 * A chip with nothing behind it (count 0) is hidden — except the first one («Все») and the chosen one:
 * a chosen filter that became empty stays visible, so the person sees why the list is empty and can leave it.
 */
export interface FilterItem<K extends string> {
  key: K;
  label: string;
  /** how many objects the filter shows; undefined — always visible */
  count?: number;
}

export function visibleFilters<K extends string>(items: FilterItem<K>[], value: K): FilterItem<K>[] {
  return items.filter((it, i) => i === 0 || it.key === value || it.count === undefined || it.count > 0);
}

/** label on the chip: «Должны · 2»; without a count — just the word */
export const filterLabel = (it: FilterItem<string>): string => (it.count === undefined ? it.label : `${it.label} · ${it.count}`);
