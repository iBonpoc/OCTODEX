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
  /** a search over the rows of the sheet when the group is long (spec 31 §7: «Мастер» of the Plan at 10+ people) */
  searchable?: boolean;
  /** one option at a time («Мастер» of the Plan): round rows; on, it is said with its group — «Мастер: Ivan ✕» */
  single?: boolean;
}

/** the rows of a group as the sheet shows them: with a search only when the group is searchable and longer than 10 */
export const SEARCH_FROM = 10;
export function sheetOptions(g: Pick<FilterGroup, "options" | "searchable">, q: string): FilterOption[] {
  const needle = q.trim().toLowerCase();
  if (!g.searchable || g.options.length <= SEARCH_FROM || !needle) return g.options;
  // what is on stays on screen, so it can be taken off
  return g.options.filter((o) => o.on || o.label.toLowerCase().includes(needle));
}

/** the words of a chosen chip: an option of a one-at-a-time group says its group («Мастер: Ivan»), the others just the option */
export const chosenLabel = (group: Pick<FilterGroup, "title" | "single">, option: Pick<FilterOption, "label">): string =>
  group.single ? `${group.title}: ${option.label}` : option.label;

/** what is on in the sheet, in the order of the groups — the line «Google ✕ · Мои ✕ · Сбросить» under the lane */
export function chosenFilters(groups: readonly FilterGroup[]): { group: FilterGroup; option: FilterOption }[] {
  return groups.flatMap((group) => group.options.filter((o) => o.on).map((option) => ({ group, option })));
}

/** the number on the «Фильтр» button */
export const activeFilterCount = (groups: readonly FilterGroup[]): number => chosenFilters(groups).length;

/** where a list keeps its filters on this device, until «Сбросить» (spec 31 §6 п.7); the search is not kept */
export const filterStoreKey = (list: string): string => `octo.filter.${list}.v1`;

/* ---------- the search as an icon (founder 07.11, spec 31 §6 п.2а) ---------- */

/** closed — the magnifier; open — the field with focus; closedActive — the magnifier framed: a search is on */
export type SearchState = "closed" | "open" | "closedActive";

export function searchState(open: boolean, q: string): SearchState {
  if (open) return "open";
  return q.trim() ? "closedActive" : "closed";
}

/** what a tap / a blur / ✕ does: the field opens on a tap, closes on a blur (empty or not), ✕ empties and closes */
export function searchAfter(ev: "tap" | "blur" | "clear", q: string): { open: boolean; q: string } {
  if (ev === "tap") return { open: true, q };
  if (ev === "clear") return { open: false, q: "" };
  return { open: false, q };
}

/* ---------- an empty list: «nothing yet» or «nothing found» (founder 20.11, #2264; DS §13) ---------- */

/** none — the list has nothing at all (the object's «yet» + the button that makes the first one);
 *  notFound — it has something, but the search, the lane or the sheet hides all of it («Ничего не найдено» + «Сбросить»). */
export type ListEmptyKind = "none" | "notFound";

/**
 * `base` — everything the list could hold, whatever the lane, the search and the sheet say (the biggest lane, e.g. «All»).
 * `narrowed` — the search, a lane other than the default, or a group in the sheet is on.
 * Nothing at all, or nothing narrowing (the default lane is empty by itself) → «none». Something there and narrowed → «notFound»; a reset gives it back.
 */
export function listEmptyKind(base: number, narrowed: boolean): ListEmptyKind {
  return base > 0 && narrowed ? "notFound" : "none";
}
