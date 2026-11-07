/**
 * Which status chips the filter bar shows (founder 07.11 «очень много кнопок сверху», spec: заявка №6).
 * A chip with nothing behind it (count 0) is hidden — except the chosen one:
 * a chosen filter that became empty stays visible, so the person sees why the list is empty and can leave it.
 */
export interface FilterItem<K extends string> {
  key: K;
  label: string;
  /** how many objects the filter shows; undefined — always visible */
  count?: number;
}

export function visibleFilters<K extends string>(items: FilterItem<K>[], value: K): FilterItem<K>[] {
  // the chosen one always stays (also «Все · 0» of an empty company); no «first stays» rule: a lane may start with a
  // status that is empty today (spec 31 §13: «Ждут даты · 0» on «Работы»)
  return items.filter((it) => it.key === value || it.count === undefined || it.count > 0);
}

/** label on the chip: «Должны · 2»; without a count — just the word */
export const filterLabel = (it: FilterItem<string>): string => (it.count === undefined ? it.label : `${it.label} · ${it.count}`);

/* ---------- the «Фильтр» sheet (spec 31 §6 п.5–п.7) ---------- */

/** one option of a group in the sheet: a source, a person, a tag; several can be on */
export interface FilterOption {
  key: string;
  label: string;
  /** how many objects it shows; 0 is shown in mut and can still be picked (the list does not jump when the status changes) */
  count?: number;
  on: boolean;
}
export interface FilterGroup {
  key: string;
  title: string;
  options: FilterOption[];
  onToggle: (key: string) => void;
}

/** what is on in the sheet, in the order of the groups — the line «Google ✕ · Мои ✕ · Сбросить» under the lane */
export function chosenFilters(groups: readonly FilterGroup[]): { group: FilterGroup; option: FilterOption }[] {
  return groups.flatMap((group) => group.options.filter((o) => o.on).map((option) => ({ group, option })));
}

/** the number on the «Фильтр» button */
export const activeFilterCount = (groups: readonly FilterGroup[]): number => chosenFilters(groups).length;

/** where a list keeps its filters on this device, until «Сбросить» (spec 31 §6 п.7); the search is not kept */
export const filterStoreKey = (list: string): string => `octo.filter.${list}.v1`;
