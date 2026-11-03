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
    { route: "inbox", label: "tab.inbox", icon: "inbox" },
    { route: "plan", label: "tab.plan", icon: "calendar" },
    { route: "more", label: "tab.more", icon: "more" },
  ],
  director: [
    { route: "today", label: "tab.today", icon: "home" },
    { route: "inbox", label: "tab.inbox", icon: "inbox" },
    { route: "clients", label: "tab.clients", icon: "users" },
    { route: "more", label: "tab.more", icon: "more" },
  ],
};

export const roleHome: Record<Role, TabRoute> = { tech: "visits", dispatcher: "triage", director: "today" };
