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
  "estimate/new", "estimate/signature",
  "expense/new",
  "job/new", "job/schedule",
  "lead/new",
  "legal/[doc]",
  "p/[token]",
  "settings/delete-account",
  // a wrong address: nothing to switch from (the walk of the fixes chat, 07.11)
  "+not-found",
] as const;

/** lists, cards, sections of «Ещё», settings pages: the bar stays */
export const WITH_TAB_BAR = [
  "index", "inbox",
  "calls", "catalog", "client/[id]", "clients", "company",
  "estimate/[id]", "estimates", "figures/[metric]", "help",
  "invoice", "invoice/[id]", "job/[id]", "jobs", "lead/[id]", "leads",
  "messages", "messages/[key]", "money", "more", "notifications", "payments", "plan", "property/[id]",
  "receipt/[id]", "reports", "reports/[id]", "search", "settings", "tasks", "team", "today", "triage", "visit/[id]", "visits",
] as const;

const hidden = new Set<string>(NO_TAB_BAR);

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
  return routes.slice(tabsAt + 1).filter((r) => hidden.has(tabRouteKey(r)));
}
