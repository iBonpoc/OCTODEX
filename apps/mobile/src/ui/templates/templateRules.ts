/**
 * The rules of the five screen templates, pure (BUILD-PLAN §1 поток Г, BUILD-SPEC §0–§1, DS §12.2 «где это всегда находится»).
 * A template asks `templateLayout()` where each part stands and draws exactly that — so the test of this file is the test of
 * the screens' rules:
 * - one main button at most (the `MainAction` is one slot; `mainCount` of a layout is 0 or 1, never 2);
 * - «‹ назад» first in the top row on the left, «⋯» last on the right (after «＋»);
 * - the sections strip (ViewTabs) right under the object's header; the object's main step right under its header and quick actions
 *   (MainStep "top", a 40 button by its words — LAYOUT-RULES П3, the founder 21.11 #2350: no pinned plate on an object, the tab bar
 *   stays seen); a second step of an object always goes into «⋯»; only an editor keeps a pinned bottom (one compact row);
 * - one FILLED accent on a screen (`filledAccents`): an outlined main one (`MainAction.outline`) is not filled;
 * - a list: search is an icon of the header (first of the icons), the chips one strip under the title;
 * - a calendar: the views, the month («Ноябрь ⌄» — it opens the month calendar) and the day strip under them; no strip in the view
 *   «Месяц» (the grid is the days); the Week, the Month and the board stand as the `view` body instead of the day's rows.
 * A second step whose label does not fit the bar's pair goes into «⋯» (mainStepLayout); a dangerous item of «⋯» is the last one.
 */
import type { MenuItem } from "../overlays";
import { mainStepLayout } from "../mainStepRules";
import type { MainAction } from "./types";

export type TemplateKind = "overview" | "list" | "object" | "editor" | "calendar";

/** a part of a screen; «main» is THE main button, wherever it stands */
export type Slot =
  | "back" | "title" | "icons" | "search" | "create" | "more"
  | "header" | "actions" | "sections" | "chips" | "searchField" | "filters" | "views" | "month" | "days" | "unassigned" | "view"
  | "next" | "main" | "second" | "total" | "attention" | "summary" | "details" | "body" | "groups" | "undated" | "empty";

/** top — the header row (left to right); under — what stands under the title / header (stuck tabs, strips);
 *  body — the scrolling content, in order; bottom — the pinned bar (MainStep "bar") */
export interface TemplateLayout {
  top: Slot[];
  under: Slot[];
  body: Slot[];
  bottom: Slot[];
}

export interface LayoutInput {
  back?: boolean;
  icons?: boolean;
  create?: boolean;
  more?: boolean;
  main?: MainAction | null;
  second?: { label: string } | null;
  total?: unknown;
  sections?: boolean;
  chips?: boolean;
  searchOpen?: boolean;
  filters?: boolean;
  views?: boolean;
  unassigned?: boolean;
  attention?: boolean;
  summary?: boolean;
  details?: boolean;
  undated?: boolean;
  /** a calendar: the view is «Месяц» — the grid is the days, no strip */
  monthView?: boolean;
  /** a calendar: the view draws its own body (the Week, the Month, the board by person) instead of the day's rows */
  viewBody?: boolean;
  /** the list / the day has nothing: `empty` instead of the groups */
  empty?: boolean;
  /** the screen's pinned bottom is not there (820/1280, or a route that still has the tab bar): the main step goes to the top of the content */
  noBar?: boolean;
}

const on = <T,>(cond: unknown, x: T): T[] => (cond ? [x] : []);

/** the header row: «‹» · title · icons (search first) · «＋» · «⋯» (DS §12.2, Б4) */
function topRow(kind: TemplateKind, p: LayoutInput): Slot[] {
  return [...on(p.back, "back" as const), "title", ...on(kind === "list", "search" as const), ...on(p.icons, "icons" as const), ...on(p.create, "create" as const), ...on(p.more, "more" as const)];
}

/** the bar: «Итого ˅» or the second one (if it fits the pair), then the main one */
function bar(p: LayoutInput): Slot[] {
  if (!p.main) return [];
  const { layout } = mainStepLayout({ second: p.second, total: p.total, reason: p.main.reason });
  return [...on(layout === "total", "total" as const), ...on(layout === "pair", "second" as const), "main"];
}

export function templateLayout(kind: TemplateKind, p: LayoutInput): TemplateLayout {
  const top = topRow(kind, p);
  if (kind === "overview") {
    // the next step is the card and its button (MainStep "top") — over the attention rows, the summary and the details
    return { top, under: [], body: [...on(p.main, "next" as const), ...on(p.main, "main" as const), ...on(p.attention, "attention" as const), ...on(p.summary, "summary" as const), ...on(p.details, "details" as const), "body"], bottom: [] };
  }
  if (kind === "list") {
    return { top, under: [...on(p.searchOpen, "searchField" as const), ...on(p.chips, "chips" as const), ...on(p.filters, "filters" as const)], body: [p.empty ? "empty" : "groups"], bottom: [] };
  }
  if (kind === "calendar") {
    const rows: Slot = p.viewBody ? "view" : p.empty ? "empty" : "groups";
    return { top, under: [...on(p.views, "views" as const), "month", ...on(!p.monthView, "days" as const)], body: [rows, ...on(p.unassigned, "unassigned" as const), ...on(p.undated, "undated" as const)], bottom: [] };
  }
  if (kind === "object") {
    // the header and its IconRow, the one main step right under them (no pinned plate), then the sections strip
    return { top, under: ["header", "actions", ...on(p.main, "main" as const), ...on(p.sections, "sections" as const)], body: ["body"], bottom: [] };
  }
  const pinned = bar(p);
  // editor: the fields, the summary, the save step pinned at the bottom
  return { top, under: [], body: p.noBar ? ["body", ...on(p.summary, "summary" as const), ...pinned] : ["body", ...on(p.summary, "summary" as const)], bottom: p.noBar ? [] : pinned };
}

/** how many main buttons the layout draws — the rule «одна главная кнопка»: 0 or 1 */
export function mainCount(l: TemplateLayout): number {
  return [...l.top, ...l.under, ...l.body, ...l.bottom].filter((s) => s === "main").length;
}

/**
 * How many FILLED accents (`acc` buttons) the layout draws — the rule «один залитый акцент на экран» (founder 21.11, #2350): 0 or 1.
 * The main step is filled unless it is outlined; the selected tab / day are a choice, not a button, and are not counted.
 */
export function filledAccents(l: TemplateLayout, main?: { outline?: boolean } | null): number {
  return main?.outline ? 0 : mainCount(l);
}

/** the key «⋯» gives a second step that went into it (it did not fit the bar's pair) */
export const SECOND_KEY = "__second";

/**
 * The items of «⋯»: the screen's own, plus the second step when it does not stand in the bar; a dangerous one — the last,
 * after the rest (the Menu draws a line before it). Order of the rest kept.
 */
export function moreItems(items: MenuItem<string>[] | undefined, second?: (MainAction & { icon?: MenuItem<string>["icon"] }) | null, total?: unknown, always?: boolean, reason?: string): MenuItem<string>[] {
  const own = items ?? [];
  // `always` — the object: its main step stands alone under the header, a second one is always in «⋯»
  const extra: MenuItem<string>[] =
    second && (always || mainStepLayout({ second, total, reason }).secondInMore) ? [{ key: SECOND_KEY, label: second.label, icon: second.icon, testID: second.testID }] : [];
  const all = [...own, ...extra];
  return [...all.filter((i) => !i.destructive), ...all.filter((i) => i.destructive)];
}

/** a dangerous item asks first (the template's confirm sheet); the rest run at once */
export const asksFirst = (item: MenuItem<string> | undefined) => !!item?.destructive;

/** «Нужно внимание» on an Overview: at most three rows, the rest behind «Все ›» (BUILD-PLAN §1 Г) */
export const ATTENTION_MAX = 3;
export function attentionRows<T>(rows: T[]): { shown: T[]; more: number } {
  return { shown: rows.slice(0, ATTENTION_MAX), more: Math.max(0, rows.length - ATTENTION_MAX) };
}

/** the groups of a list that have rows (an empty group is not drawn, BUILD-SPEC §1 GroupedList); none — the list is empty */
export function shownGroups<G extends { rows: unknown[] }>(groups: G[]): G[] {
  return groups.filter((g) => g.rows.length > 0);
}

/** DS §12.13 «Шапка» (#2841): the «‹» label is the parent's title; one longer than `BACK_MAX` letters is not cut with «…» — the
 *  parent's KIND word stands instead («‹ Работа», not «‹ Bathroom remodel: vanity…»), as iOS turns a long back title into «Back» */
export const BACK_MAX = 18;
const BACK_KIND: [RegExp, BackKind][] = [
  [/^\/job\//, "job"], [/^\/estimate\//, "estimate"], [/^\/invoice\//, "invoice"], [/^\/client\//, "client"], [/^\/lead\//, "lead"],
  [/^\/property\//, "property"], [/^\/visit\//, "visit"], [/^\/receipt\//, "receipt"], [/^\/purchase-order\//, "order"],
];
export type BackKind = "job" | "estimate" | "invoice" | "client" | "lead" | "property" | "visit" | "receipt" | "order";
/** the label as it is, or the parent's kind (the caller words it) when it is too long; an unknown parent keeps its label */
export function backLabel(label: string, href: string | undefined): { label: string } | { kind: BackKind } {
  if (label.length <= BACK_MAX || !href) return { label };
  const k = BACK_KIND.find(([re]) => re.test(href))?.[1];
  return k ? { kind: k } : { label };
}
