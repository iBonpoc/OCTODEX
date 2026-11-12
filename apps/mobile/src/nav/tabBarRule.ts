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

/** creating or editing something, signing, signing in, the client page, the legal texts */
export const NO_TAB_BAR = [
  "auth/company", "auth/invite", "auth/sign-in", "auth/terms", "auth/trade",
  // a catalog item is a form («Новая позиция» / edit, «Сохранить»): a tab would drop what is not saved (review #274)
  "catalog/[id]",
  "client/edit", "client/import",
  "company/[section]", "company/schedule",
  // a checklist template is a form («Сохранить»): a tab would drop what is not saved
  "company/checklist/[id]",
  "estimate/new", "estimate/signature",
  "expense/new",
  // the request page of a company (docs/specs/34): a homeowner without the app — no app menu
  "f/[token]",
  "job/new", "job/schedule",
  "lead/new",
  "legal/[doc]",
  // a module's own screen (spec 33 П20.3): the drawing canvas and its speed check take the whole screen
  "module/[key]/[screen]",
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
  "calls", "catalog", "client/[id]", "client/imports", "clients", "company",
  // a settings page saved from its sheet at once (no form to lose)
  "company/leads",
  "company/intake",
  "company/payments",
  "company/modules",
  "company/checklists",
  "estimate/[id]", "estimate/templates", "estimates", "figures/[metric]", "help",
  "invoice", "invoice/[id]", "job/[id]", "jobs", "lead/[id]", "leads",
  "messages", "messages/[key]", "money", "more", "notifications", "payments", "plan", "property/[id]",
  "receipt/[id]", "reports", "reports/[id]", "search", "settings", "settings/profile", "settings/design-system", "settings/design-system/[section]", "suppliers", "purchase-orders", "tasks", "team", "today", "triage", "visit/[id]", "visits",
] as const;

const hidden = new Set<string>(NO_TAB_BAR);
/**
 * Without the bar, but not a form (founder 08.11, build 373: «Выйти без сохранения?» over «Модули» with nothing to
 * save): a module's own screens save on their own — the canvas a second after each change, its settings and prices at
 * once, the speed check keeps nothing. A tab over them never asks.
 */
export const NOT_A_FORM: readonly string[] = ["module/[key]/[screen]"];
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
