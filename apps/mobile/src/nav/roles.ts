import type { Role } from "@/data/types";
import type { DictKey } from "@/i18n";
import type { IconKey } from "@/ui/primitives";

export type TabRoute = "today" | "triage" | "inbox" | "visits" | "plan" | "clients" | "more";
export interface NavItem {
  route: TabRoute;
  label: DictKey;
  icon: IconKey;
}

/** docs/10-build-plan.md §3 — 4 items + center "＋" on phone. */
export const roleNav: Record<Role, NavItem[]> = {
  tech: [
    { route: "visits", label: "tab.visits", icon: "route" },
    { route: "plan", label: "tab.plan", icon: "calendar" },
    { route: "clients", label: "tab.clients", icon: "users" },
    { route: "more", label: "tab.more", icon: "more" },
  ],
  dispatcher: [
    { route: "triage", label: "tab.triage", icon: "check" },
    { route: "inbox", label: "tab.sales", icon: "inbox" },
    { route: "plan", label: "tab.plan", icon: "calendar" },
    { route: "more", label: "tab.more", icon: "more" },
  ],
  // the office without planning: the Plan is to look at only (canPlan is false)
  sales: [
    { route: "inbox", label: "tab.sales", icon: "inbox" },
    { route: "clients", label: "tab.clients", icon: "users" },
    { route: "plan", label: "tab.plan", icon: "calendar" },
    { route: "more", label: "tab.more", icon: "more" },
  ],
  director: [
    { route: "today", label: "tab.today", icon: "home" },
    { route: "inbox", label: "tab.sales", icon: "inbox" },
    { route: "clients", label: "tab.clients", icon: "users" },
    { route: "more", label: "tab.more", icon: "more" },
  ],
};

/** Screens of the bottom/top tab navigator ((tabs)/_layout): they already have the tab bar. */
const TAB_SCREENS = new Set<string>(["index", "visits", "triage", "today", "inbox", "plan", "clients", "more"]);
export const isTabScreen = (routeName: string) => TAB_SCREENS.has(routeName);

export const roleHome: Record<Role, TabRoute> = { tech: "visits", dispatcher: "triage", director: "today", sales: "inbox" };

const ALL: readonly Role[] = ["tech", "dispatcher", "director", "sales"];
const OFFICE: readonly Role[] = ["dispatcher", "director", "sales"];

/**
 * Who may open a screen (route-guard; docs/specs/03 §8.1, docs/specs/05 §2, §4.2).
 * Key = the first part of the address (`/company/hours` → "company"); a screen not listed is open to every role.
 * The technician sees only his own work: no company money (Today, Money, figures), no Sales and lead prices,
 * no Triage; Company settings and Team — director (owner/admin) only. The server limits the data the same way (RLS);
 * this table only keeps the screens closed. Invoices and receipts stay open: the tech takes a payment on site.
 */
export const routeRoles: Record<string, readonly Role[]> = {
  today: OFFICE,
  money: OFFICE,
  figures: OFFICE,
  triage: OFFICE,
  inbox: OFFICE,
  team: ["director"],
  company: ["director"],
};

/** the first part of an address: "/company/hours?x=1" → "company", "/" → "" */
export const routeKey = (path: string) => path.split(/[?#]/)[0]!.split("/").filter(Boolean)[0] ?? "";

/** may this role open the screen at `path` */
export const canOpen = (role: Role, path: string) => (routeRoles[routeKey(path)] ?? ALL).includes(role);

/** the role the app works in: the chosen one if this person has it, else their first role */
export const effectiveRole = (role: Role, available: readonly Role[]): Role =>
  available.includes(role) ? role : (available[0] ?? role);
