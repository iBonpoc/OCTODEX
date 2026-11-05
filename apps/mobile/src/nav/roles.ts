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
