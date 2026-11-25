/**
 * Where the phone's bottom bar is shown (docs/specs/28-tabbar-everywhere.md, rule А, founder 07.11).
 * Before, the bar was the tab navigator's own: only the screens in app/(tabs) had it, every card and every «Ещё»
 * section (Jobs, Tasks, Invoices, Catalog, Team, Settings…) opened over it without it. Now it is drawn by the shell
 * on every phone screen — except forms and full-screen flows, where it would only get in the way of the keyboard,
 * the signature or the client.
 * 820/1280: never — the side menu takes its place.
 *
 * Every route of src/app is in exactly one of the two lists (test/tabBarRule.test.ts): a new screen must choose.
 */
import { isTabScreen } from "./roles";
import { sectionOfRoute, type SectionId } from "./sections";

/** creating or editing something, signing, signing in, the client page, the legal texts */
export const NO_TAB_BAR = [
  "auth/company", "auth/invite", "auth/sign-in", "auth/terms", "auth/trade",
  // a catalog item is a form («Новая позиция» / edit, «Сохранить»): a tab would drop what is not saved (review #274)
  "catalog/[id]",
  // draft only (not for merge): question mock-ups of screens that have no tab bar
  "qdraft/q2531-a", "qdraft/q2531-b", "qdraft/q1832-a", "qdraft/q1832-b", "qdraft/q586-a", "qdraft/q586-b", "qdraft/q2364-a", "qdraft/q2364-b", "qdraft/q2364-c", "qdraft/q2533-a", "qdraft/q2533-b",
  // founder 21.11 (#2350): an object's card keeps the tab bar — its next step lives in the «Сейчас» card at the top, no pinned slab
  "client/edit", "client/import",
  "company/[section]", "company/schedule",
  // a checklist template is a form («Сохранить»): a tab would drop what is not saved
  "company/checklist/[id]",
  // an estimate: its one main button is pinned at the bottom (ActionBar, #1412, DS §8.9 «смета»)
  "estimate/[id]", "estimate/new", "estimate/signature",
  // an invoice: «Принять оплату» pinned at the bottom (ActionBar, #1474), as the estimate
  "invoice/[id]",
  // a receipt: its next step pinned at the bottom (ActionBar, #1474), as the estimate
  "receipt/[id]",
  "expense/new",
  // the request page of a company (docs/specs/34): a homeowner without the app — no app menu
  "f/[token]",
  "job/new", "job/schedule",
  "lead/new",
  "legal/[doc]",
  "p/[token]",
  "settings/delete-account",
  // an order is a form («Сохранить», «Отправить», spec 37)
  "purchase-order/[id]",
  // a supplier is a form («Сохранить», spec 36)
  "suppliers/[id]",
  // a wrong address: nothing to switch from (the walk of the fixes chat, 07.11)
  "+not-found",
] as const;

/** lists, cards, sections of «Ещё», settings pages: the bar stays */
export const WITH_TAB_BAR = [
  "index", "inbox",
  "calls", "catalog", "client/imports", "clients", "company",
  // founder 21.11 (#2350): an object's card keeps the bar (no pinned slab); its next step is in the «Сейчас» card
  "client/[id]", "job/[id]", "visit/[id]", "lead/[id]", "property/[id]",
  // a settings page saved from its sheet at once (no form to lose)
  "company/leads",
  "company/intake",
  "company/payments",
  "company/modules",
  "company/checklists",
  "estimate/templates", "estimates", "figures/[metric]", "finance", "help",
  "invoice", "jobs", "leads",
  // a module's own screens (spec 33 П20.3): its lists and cards keep the bar (#1426, design audit: «Замеры» had none, the
  // core's lists have it); the full-screen ones (ModuleDef.fullScreen: the canvas) hide it themselves (useHideTabBar in the route)
  "module/[key]/[screen]",
  "messages", "messages/[key]", "money", "more", "notifications", "payments", "plan",
  "reports", "reports/[id]", "search", "settings", "settings/profile", "settings/design-system", "settings/design-system/[section]", "suppliers", "purchase-orders", "tasks", "team", "today", "triage", "visits",
] as const;

const hidden = new Set<string>(NO_TAB_BAR);
/**
 * Without the bar, but not a form: a tab over them never asks «Выйти без сохранения?». (A module's own screens were here —
 * founder 08.11, build 373 — they now keep the bar, #1426, so they are never «a form above» at all.)
 */
// the estimate's card (#1412): no tab bar for its pinned main button, but nothing typed to lose
export const NOT_A_FORM: readonly string[] = ["estimate/[id]", "invoice/[id]", "receipt/[id]"];
const notAForm = new Set<string>(NOT_A_FORM);

/** "(tabs)/clients" → "clients", "company/index" → "company", "" → "index" */
export function tabRouteKey(route: string): string {
  const k = route
    .split("/")
    .filter((s) => s && !(s.startsWith("(") && s.endsWith(")")))
    .join("/")
    .replace(/(^|\/)index$/, "");
  return k || "index";
}

/** the phone's bottom bar on this route (a route name like "client/[id]", or the segments joined) */
export const showsTabBar = (route: string): boolean => !hidden.has(tabRouteKey(route));

/**
 * The forms a tab would close (review #274): the routes of the root stack above the tabs that are forms. A tab pressed
 * on a card opened from a form (a new lead → «already a client» → the client) would drop what was typed; the bar asks
 * «Выйти без сохранения?» first. `routes` — the root stack's route names, bottom first.
 */
export function formsAbove(routes: readonly string[]): string[] {
  const tabsAt = routes.lastIndexOf("(tabs)");
  return routes.slice(tabsAt + 1).filter((r) => hidden.has(tabRouteKey(r)) && !notAForm.has(tabRouteKey(r)));
}

/**
 * How a tab leaves the current screen (e2e 134): «dismissTo» — a card lies over the tabs, close it down to them;
 * «navigate» — the tabs are on top already (or not in the stack at all), just switch the tab. dismissTo on the tabs
 * themselves is a no-op: after a role change from /settings (navigate pushed a second copy of the tabs) every tab but «＋»
 * stopped answering until the app was restarted (TestFlight 288). `routes` — the root stack's route names, bottom first.
 */
export function tabLeave(routes: readonly string[]): "dismissTo" | "navigate" {
  const tabsAt = routes.lastIndexOf("(tabs)");
  return tabsAt >= 0 && tabsAt < routes.length - 1 ? "dismissTo" : "navigate";
}

export type NavState = { routeNames?: readonly string[]; routes?: readonly { name: string; params?: object; state?: NavState }[]; index?: number } | undefined;
/** the route names of the app's own stack (app/_layout: the one that has «(tabs)»), bottom first; expo-router wraps it
 *  in its «__root» navigator */
export function appStackRoutes(state: NavState): string[] {
  for (let s = state, depth = 0; s && depth < 4; depth++) {
    if (s.routeNames?.includes("(tabs)")) return (s.routes ?? []).map((r) => r.name);
    s = s.routes?.[s.index ?? 0]?.state;
  }
  return [];
}

/** routes that are no place of any tab: they light none (prototype audit 12 §1 — «Поиск» lit «Главная») */
export const LIGHTS_NO_TAB: readonly string[] = ["search"];
/** the bar's own targets that are cards over the tabs, not tabs («Деньги» → /finance, its lists): they light their section, not the tab lying under them */
export const LIGHTS_OWN: readonly string[] = ["finance", "estimates"];

/** the tab a card was opened from: the focused route of the tab navigator lying under the cards; none when the tabs are on top
 *  or not in the stack (a deep link) */
export function tabUnder(state: NavState): string | undefined {
  const s = appStack(state);
  const routes = s?.routes ?? [];
  let at = -1;
  routes.forEach((r, i) => r.name === "(tabs)" && (at = i));
  if (at < 0 || at === routes.length - 1) return undefined;
  const tabs = routes[at]!.state;
  return tabs?.routes?.[tabs.index ?? 0]?.name;
}

/**
 * Which section the phone's bar lights (audit 12 §1, «подсветка вкладки — по источнику»): a search — none; a tab screen — its own;
 * a card over the tabs — the tab it was opened from (a visit from the Plan lights «План», not «Клиенты» of the hierarchy); a card
 * with no tabs under it (a deep link) — its own section. `route` — tabRouteKey of the segments; `own` — the hierarchy's section.
 */
export function litSection(route: string, own: SectionId | undefined, under: string | undefined): SectionId | undefined {
  if (LIGHTS_NO_TAB.includes(route)) return undefined;
  if (isTabScreen(route.split("/")[0] ?? "") || !under || LIGHTS_OWN.includes(route)) return own;
  return under === "index" ? "home" : sectionOfRoute(under) ?? own;
}

/** the app's own stack (app/_layout: the one that has «(tabs)»), or undefined */
function appStack(state: NavState): NavState {
  for (let s = state, depth = 0; s && depth < 4; depth++) {
    if (s.routeNames?.includes("(tabs)")) return s;
    s = s.routes?.[s.index ?? 0]?.state;
  }
  return undefined;
}

/**
 * «‹ Лиды» on a lead card opened from Leads (founder 08.11): the tab right under the cards is that very screen — pop the
 * cards (how many to pop), so the tab keeps its own params. dismissTo('/leads?tab=leads') replaced them and lost
 * `from=more`: Leads opened from «Ещё» came back without «‹ Ещё» and without the back swipe. 0 — not this case
 * (another tab under the cards, the href asks other params, nothing above the tabs): goTo works as before.
 */
export function popsToTab(state: NavState, href: string): number {
  const s = appStack(state);
  const routes = s?.routes ?? [];
  let tabsAt = -1;
  routes.forEach((r, i) => r.name === "(tabs)" && (tabsAt = i));
  if (tabsAt < 0 || tabsAt === routes.length - 1) return 0;
  const tabs = routes[tabsAt]!.state;
  const tab = tabs?.routes?.[tabs.index ?? 0];
  const [path = "", query = ""] = href.split("?");
  const segs = path.split("/").filter(Boolean);
  if (!tab || segs.length !== 1 || segs[0] !== tab.name) return 0;
  const has = (tab.params ?? {}) as Record<string, unknown>;
  for (const [k, v] of new URLSearchParams(query)) if (String(has[k] ?? "") !== v) return 0;
  return routes.length - 1 - tabsAt;
}

/**
 * How goTo (the screen's «‹ up», the role change) reaches a screen: as before — dismissTo when something can be
 * dismissed, else replace; but with the tabs on top and something under them ([a card opened by a link, (tabs)])
 * dismissTo is a no-op (the same as the tabs, e2e 134): switch inside the tabs with navigate.
 */
export function goAction(routes: readonly string[], canDismiss: boolean): "dismissTo" | "navigate" | "replace" {
  if (routes.length > 1 && routes[routes.length - 1] === "(tabs)") return "navigate";
  return canDismiss ? "dismissTo" : "replace";
}
