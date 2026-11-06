/**
 * The one list of the app's sections (docs/specs/13 §2.1, §2.3, §4; 13а §3): the 5 bottom tabs and the ☰ menu.
 * Replaces roleNav. Pure (no React) — unit-tested in test/sections.test.ts.
 * Only what works: a section without a screen (Tasks, Payments, Reports, Map, Phone, Modules) is not listed
 * until its screen exists (the test checks every href has a route file).
 */
import type { Role } from "@/data/types";
import type { DictKey } from "@/i18n";
import type { IconKey } from "@/ui/primitives";
import { canOpen, roleHome, routeKey } from "./roles";

export type SectionId =
  | "home"
  | "plan"
  | "messages"
  | "calls"
  | "clients"
  | "leads"
  | "jobs"
  | "estimates"
  | "invoices"
  | "catalog"
  | "money"
  | "team"
  | "company"
  | "settings";
export type MenuGroup = "top" | "work" | "docs" | "money" | "bottom";

export interface Section {
  id: SectionId;
  label: DictKey;
  icon: IconKey;
  group: MenuGroup;
  /** a bottom tab (phone) — the same 5 for every role */
  tab?: boolean;
  /** listed in ☰ only on 820/1280 (on the phone it is a bottom tab; 13 v2 §2.3 «Верх» = Создать · Главная) */
  wideOnly?: boolean;
  /** who sees it (13 §4); undefined = everyone */
  roles?: readonly Role[];
}

/**
 * The «Звонки» tab (13 v2 §2.1; open question to the founder, 06.11): 4 tabs until the company has its own number?
 * One switch: false hides the tab and the ☰ item; «Записать звонок» stays in the lead and client actions.
 */
export const SHOW_CALLS_TAB = true;

const OFFICE: readonly Role[] = ["director", "dispatcher", "sales"];
const PLANNERS: readonly Role[] = ["director", "dispatcher"];

/** Order = menu order inside a group (13 §2.3). */
export const SECTIONS: readonly Section[] = [
  { id: "home", label: "nav.home", icon: "home", group: "top", tab: true },
  { id: "plan", label: "nav.plan", icon: "calendar", group: "work", tab: true },
  { id: "messages", label: "nav.messages", icon: "sms", group: "top", tab: true, wideOnly: true },
  ...(SHOW_CALLS_TAB ? [{ id: "calls" as const, label: "nav.calls" as const, icon: "phone" as const, group: "top" as const, tab: true, wideOnly: true }] : []),
  { id: "leads", label: "nav.leads", icon: "inbox", group: "work", roles: OFFICE },
  { id: "jobs", label: "nav.jobs", icon: "wrench", group: "work" },
  { id: "clients", label: "nav.clients", icon: "users", group: "work", tab: true },
  { id: "estimates", label: "nav.estimates", icon: "invoice", group: "docs" },
  { id: "invoices", label: "nav.invoices", icon: "wallet", group: "docs", roles: OFFICE },
  { id: "catalog", label: "nav.catalog", icon: "note", group: "docs" },
  // sales: without Payments and Reports (13 §4) — «Money» holds them today
  { id: "money", label: "nav.money", icon: "wallet", group: "money", roles: PLANNERS },
  { id: "team", label: "nav.team", icon: "users", group: "bottom", roles: ["director"] },
  { id: "company", label: "nav.companySettings", icon: "home2", group: "bottom", roles: ["director"] },
  { id: "settings", label: "nav.mySettings", icon: "sliders", group: "bottom" },
];

/** Where a section opens for this role. Home = the role's own home screen; Sales lists live on /leads. */
export function sectionHref(id: SectionId, role: Role): string {
  switch (id) {
    case "home":
      return `/${roleHome[role]}`;
    case "leads":
      return "/leads?tab=leads";
    case "estimates":
      // the technician has no Sales lists: his own estimates screen
      return role === "tech" ? "/estimates" : "/leads?tab=estimates";
    case "invoices":
      return "/leads?tab=invoices";
    default:
      return `/${id}`;
  }
}

const visible = (s: Section, role: Role) => (!s.roles || s.roles.includes(role)) && canOpen(role, sectionHref(s.id, role));

/** The 5 bottom tabs: the same set for every role (13 §2.1) — what is inside is filtered by rights. */
export const tabs = (_role: Role): Section[] => SECTIONS.filter((s) => s.tab);

/** ☰ groups for this role, in order; a group with nothing the role may open is left out (13 §2.3). `wide` = 820/1280. */
export function menuGroups(role: Role, wide = false): { group: MenuGroup; items: Section[] }[] {
  const order: MenuGroup[] = ["top", "work", "docs", "money", "bottom"];
  return order
    .map((group) => ({ group, items: SECTIONS.filter((s) => s.group === group && (wide || !s.wideOnly) && visible(s, role)) }))
    .filter((g) => g.items.length > 0);
}

/** the three home screens (one per role) light the «Главная» tab */
const HOME_ROUTES = new Set(["today", "triage", "visits", ""]);

/** the role has this section as a tab or in its ☰ */
export const hasSection = (role: Role, id: SectionId) => tabs(role).some((s) => s.id === id) || menuGroups(role, true).some((g) => g.items.some((s) => s.id === id));

/** Which section a top-level route belongs to (the tab or menu item lit for it). */
export function sectionOfRoute(route: string): SectionId | undefined {
  if (HOME_ROUTES.has(route) || route === "figures") return "home";
  if (route === "inbox") return "leads";
  return SECTIONS.some((s) => s.id === route) ? (route as SectionId) : undefined;
}

/** the section of an address like "/leads?tab=invoices" (the menu item it opens) */
export function sectionOfHref(href: string): SectionId | undefined {
  const route = routeKey(href);
  if (route === "leads" || route === "inbox") {
    const tab = new URLSearchParams(href.split("?")[1] ?? "").get("tab");
    return tab === "estimates" ? "estimates" : tab === "invoices" ? "invoices" : "leads";
  }
  return sectionOfRoute(route);
}
