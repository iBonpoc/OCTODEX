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
  | "payments"
  | "reports"
  | "money"
  | "team"
  | "company"
  | "settings"
  | "more";
export type MenuGroup = "top" | "work" | "docs" | "money" | "bottom";

export interface Section {
  id: SectionId;
  label: DictKey;
  icon: IconKey;
  group: MenuGroup;
  /** a bottom tab (phone) — the same 5 for every role; a tab is not repeated in «Ещё» */
  tab?: boolean;
  /** the phone's «Ещё» tab itself: never a section in «Ещё» or in the side menu */
  phoneOnly?: boolean;
  /** who sees it (13 §4); undefined = everyone */
  roles?: readonly Role[];
}

const OFFICE: readonly Role[] = ["director", "dispatcher", "sales"];
const PLANNERS: readonly Role[] = ["director", "dispatcher"];

/** Order = menu order inside a group (13 §2.3). */
export const SECTIONS: readonly Section[] = [
  { id: "home", label: "nav.home", icon: "home", group: "top", tab: true },
  { id: "plan", label: "nav.plan", icon: "calendar", group: "work", tab: true },
  { id: "messages", label: "nav.messages", icon: "sms", group: "top", tab: true },
  { id: "leads", label: "nav.leads", icon: "inbox", group: "work", roles: OFFICE },
  { id: "jobs", label: "nav.jobs", icon: "wrench", group: "work" },
  { id: "clients", label: "nav.clients", icon: "users", group: "work", tab: true },
  // «Звонки» is not a tab until the company has its own number (founder 06.11, variant Б; 13 v2 §2.1)
  { id: "calls", label: "nav.calls", icon: "phone", group: "work" },
  { id: "estimates", label: "nav.estimates", icon: "invoice", group: "docs" },
  { id: "invoices", label: "nav.invoices", icon: "wallet", group: "docs", roles: OFFICE },
  { id: "catalog", label: "nav.catalog", icon: "note", group: "docs" },
  // owner, admin, office (13 §4): not the technician, not sales
  { id: "payments", label: "mny.payments.title", icon: "dollar", group: "money", roles: PLANNERS },
  { id: "reports", label: "rpt.title", icon: "chart", group: "money", roles: PLANNERS },
  // «Расходы» (13 §2.3): the /money screen
  { id: "money", label: "nav.expenses", icon: "wallet", group: "money", roles: PLANNERS },
  { id: "team", label: "nav.team", icon: "users", group: "bottom", roles: ["director"] },
  { id: "company", label: "nav.companySettings", icon: "home2", group: "bottom", roles: ["director"] },
  { id: "settings", label: "nav.mySettings", icon: "sliders", group: "bottom" },
  { id: "more", label: "nav.more", icon: "more", group: "bottom", tab: true, phoneOnly: true },
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
      // the one path to debts (18 §1): the list opens on «Не оплачен · Просрочен»
      return "/invoice";
    default:
      return `/${id}`;
  }
}

const visible = (s: Section, role: Role) => (!s.roles || s.roles.includes(role)) && canOpen(role, sectionHref(s.id, role));

/** The 5 bottom tabs: the same set for every role (13 §2.1) — what is inside is filtered by rights. */
export const tabs = (_role: Role): Section[] => SECTIONS.filter((s) => s.tab);

/**
 * The sections by group for this role, in order (13 v2 §2.3); a group with nothing the role may open is left out.
 * Phone (`wide` = false): the tiles of «Ещё» — the tabs are not repeated there. 820/1280: the side menu — everything but «Ещё».
 */
export function menuGroups(role: Role, wide = false): { group: MenuGroup; items: Section[] }[] {
  const order: MenuGroup[] = ["top", "work", "docs", "money", "bottom"];
  return order
    .map((group) => ({ group, items: SECTIONS.filter((s) => s.group === group && !s.phoneOnly && (wide || !s.tab) && visible(s, role)) }))
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
  if (route === "invoice") return "invoices";
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

/* ---------- «＋» by screen (13 v2 §2.4, 13а §9) ---------- */

/** the screens that declare a «＋»: `<Screen fab="client" fabCtx={{ customerId }}>`; «＋ Создать» in ☰ = "home" */
export type FabSet = "home" | "plan" | "calls" | "clients" | "client" | "job" | "visit";
/** what the new thing is tied to (the screen's own object) */
export interface FabCtx {
  customerId?: string;
  propertyId?: string;
  jobId?: string;
  visitId?: string;
  leadId?: string;
  /** the visit is an inspection (estimate from the visit) */
  inspection?: boolean;
}
export type FabId = "lead" | "client" | "job" | "estimate" | "expense" | "visit" | "planAdd" | "planEvent" | "planTimeOff" | "photo";
export interface FabItem {
  id: FabId;
  label: DictKey;
  icon: IconKey;
  /** a screen to open; undefined = an action the screen or the «＋» itself does (`act`) */
  href?: string;
  act?: "planAdd" | "planEvent" | "planTimeOff" | "photo";
}

const TECH: readonly Role[] = ["tech"];

interface FabDef {
  id: FabId;
  roles?: readonly Role[];
  /** undefined = this screen has nothing to tie it to: the item is left out, never «created loose» (13 §2.4) */
  href?: (ctx: FabCtx) => string | undefined;
  act?: FabItem["act"];
  /** the item needs these from the screen */
  needs?: (ctx: FabCtx) => boolean;
}

const q = (o: Record<string, string | undefined>) => {
  const s = Object.entries(o)
    .filter((e): e is [string, string] => !!e[1])
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return s ? `?${s}` : "";
};

const FAB_LOOK: Record<FabId, { label: DictKey; icon: IconKey }> = {
  lead: { label: "quick.lead", icon: "user" },
  client: { label: "clients.new", icon: "users" },
  job: { label: "job3.newJob", icon: "wrench" },
  estimate: { label: "quick.estimate", icon: "invoice" },
  expense: { label: "quick.receipt", icon: "wallet" },
  visit: { label: "sch.title", icon: "calendar" },
  planAdd: { label: "plan.add", icon: "calendar" },
  planEvent: { label: "plan5.addEvent", icon: "clock" },
  planTimeOff: { label: "plan5.addTimeOff", icon: "sun" },
  photo: { label: "quick.photo", icon: "camera" },
};

const lead: FabDef = { id: "lead", href: () => "/lead/new" };
const client: FabDef = { id: "client", roles: OFFICE, href: () => "/client/edit" };
// «Новая работа» one form (S17): tied to the screen's client and property when it has them; not the technician
const job: FabDef = { id: "job", roles: OFFICE, href: (c) => `/job/new${q({ customerId: c.customerId, propertyId: c.propertyId })}` };
const expense = (roles?: readonly Role[]): FabDef => ({ id: "expense", roles, href: () => "/expense/new" });
const estimate = (roles: readonly Role[] | undefined, needs?: FabDef["needs"]): FabDef => ({
  id: "estimate",
  roles,
  needs,
  href: (c) => `/estimate/new${q({ customerId: c.customerId, propertyId: c.propertyId, leadId: c.leadId })}`,
});

/**
 * Only what works (13 §2.4; 14-app-store п. 7): Invoice without a job, Task, Event, Day off, Note, File,
 * Property, «Record a call», «New message» come with waves 3–6. «Lead» from a client — when lead/new takes customerId.
 */
export const FAB_SETS: Record<FabSet, readonly FabDef[]> = {
  home: [lead, client, job, estimate(OFFICE), expense()],
  // the schedule is the planners' (docs/specs/03 Р7): no «＋» on Plan for the technician
  // wave 5 (#187/#188): an event and a day off open the Plan's own EventSheet; the planners' only (Р7)
  plan: [
    job,
    { ...lead, roles: OFFICE },
    { id: "planAdd", roles: PLANNERS, act: "planAdd" },
    { id: "planEvent", roles: PLANNERS, act: "planEvent" },
    { id: "planTimeOff", roles: PLANNERS, act: "planTimeOff" },
  ],
  calls: [lead, client],
  clients: [client],
  client: [{ ...job, needs: (c) => !!c.customerId }, estimate(OFFICE, (c) => !!c.customerId)],
  job: [
    { id: "visit", roles: PLANNERS, needs: (c) => !!c.jobId, href: (c) => `/job/schedule${q({ jobId: c.jobId })}` },
    estimate(OFFICE, (c) => !!c.customerId),
    expense(TECH),
  ],
  visit: [
    { id: "photo", roles: TECH, act: "photo", needs: (c) => !!c.visitId },
    estimate(undefined, (c) => !!c.inspection && !!c.customerId),
    { ...lead, roles: TECH },
    expense(TECH),
  ],
};

/** the «＋» of a screen for this role: filtered by rights and by what the screen can tie it to; [] = no button */
export function fabItems(set: FabSet, role: Role, ctx: FabCtx = {}): FabItem[] {
  const out: FabItem[] = [];
  for (const d of FAB_SETS[set]) {
    if (d.roles && !d.roles.includes(role)) continue;
    if (d.needs && !d.needs(ctx)) continue;
    const href = d.href?.(ctx);
    if (href && !canOpen(role, href)) continue;
    if (!href && !d.act) continue;
    out.push({ id: d.id, ...FAB_LOOK[d.id], href, act: d.act });
  }
  return out;
}
