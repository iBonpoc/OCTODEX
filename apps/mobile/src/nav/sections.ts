/**
 * The one list of the app's sections (docs/specs/13 §2.1, §2.3, §4; 13а §3): the 5 bottom tabs and the ☰ menu.
 * Replaces roleNav. Pure (no React) — unit-tested in test/sections.test.ts.
 * Only what works: a section without a screen (Map, Phone, Modules) is not listed
 * until its screen exists (the test checks every href has a route file).
 */
import type { Role } from "@/data/types";
import type { DictKey } from "@/i18n";
import type { IconKey } from "@/ui/primitives";
import { canOpen, isTabScreen, roleHome, routeKey } from "./roles";

export type SectionId =
  | "home"
  | "plan"
  | "messages"
  | "calls"
  | "clients"
  | "tasks"
  | "leads"
  | "jobs"
  | "estimates"
  | "invoices"
  | "catalog"
  | "suppliers"
  | "purchase-orders"
  | "payments"
  | "reports"
  | "money"
  | "team"
  | "company"
  | "settings"
  | "help"
  | "more"
  | "finance";
export type MenuGroup = "top" | "work" | "docs" | "money" | "bottom";

export interface Section {
  id: SectionId;
  label: DictKey;
  icon: IconKey;
  group: MenuGroup;
  /** a bottom tab (phone) — the same 5 for every role (a subcontractor: 4, no Leads); a tab is not repeated in «Ещё» */
  tab?: boolean;
  /** the phone's «Ещё» tab itself: never a section in «Ещё» or in the side menu */
  phoneOnly?: boolean;
  /** who sees it (13 §4); undefined = everyone */
  roles?: readonly Role[];
  /** not for a subcontractor: in the app he is a «tech» (appRoles), so the role alone does not tell (P4c, PushSettings) */
  noSub?: boolean;
}

const OFFICE: readonly Role[] = ["director", "dispatcher", "sales"];
const PLANNERS: readonly Role[] = ["director", "dispatcher"];

/** Order = menu order inside a group (13 §2.3). */
export const SECTIONS: readonly Section[] = [
  { id: "home", label: "nav.home", icon: "home", group: "top", tab: true },
  { id: "plan", label: "nav.plan", icon: "plan", group: "work", tab: true },
  { id: "messages", label: "nav.messages", icon: "sms", group: "top" },
  // the tech sees his own leads — assigned to him or brought by him (13 §2.3, §4; canSeeLead and RLS leads_select);
  // a subcontractor does not (he never gets leads: features/leadAssignee.ts)
  // prototype v2 (BUILD-PLAN §2 п.1): «Лиды» is the fifth tab
  { id: "leads", label: "nav.leads", icon: "leads", group: "work", tab: true, roles: [...OFFICE, "tech"], noSub: true },
  { id: "jobs", label: "nav.jobs", icon: "wrench", group: "work" },
  { id: "clients", label: "nav.clients", icon: "users", group: "work", tab: true },
  // redesign #2348: «Деньги» — estimates, invoices, payments behind one tab (a segment switches them)
  // the tech has no «Деньги» tab (audit 12 §2.6): the company's money is the office's; his own estimates are a tile of «Ещё»
  { id: "finance", label: "nav.money", icon: "money", group: "docs", tab: true, phoneOnly: true, roles: OFFICE },
  // prototype v2: search is an icon in the header (HeaderIcons, /search stays), not a tab
  // «Звонки» is not a tab until the company has its own number (founder 06.11, variant Б; 13 v2 §2.1)
  { id: "calls", label: "nav.calls", icon: "phone", group: "work" },
  // wave 6 (20 §7): every role; the technician sees his own (RLS)
  { id: "tasks", label: "task.title", icon: "check", group: "work" },
  { id: "estimates", label: "nav.estimates", icon: "estimate", group: "docs" },
  { id: "invoices", label: "nav.invoices", icon: "invoice", group: "docs", roles: OFFICE },
  { id: "catalog", label: "nav.catalog", icon: "catalog", group: "docs" },
  // spec 36: owner, admin, office — the account number is not for the tech or sales
  { id: "suppliers", label: "nav.suppliers", icon: "truck", group: "docs", roles: PLANNERS },
  // spec 37: owner, admin, office; the tech sees the orders of his jobs on the job
  { id: "purchase-orders", label: "nav.purchaseOrders", icon: "box", group: "docs", roles: PLANNERS },
  // owner, admin, office (13 §4): not the technician, not sales
  { id: "payments", label: "mny.payments.title", icon: "dollar", group: "money", roles: PLANNERS },
  { id: "reports", label: "rpt.title", icon: "chart", group: "money", roles: PLANNERS },
  // «Расходы» (13 §2.3): the /money screen
  { id: "money", label: "nav.expenses", icon: "wallet", group: "money", roles: PLANNERS },
  { id: "team", label: "nav.team", icon: "crew", group: "bottom", roles: ["director"] },
  // spec 26 §3 (07.11): the office (dispatcher) sees the company settings read-only; only the director changes them
  { id: "company", label: "nav.companySettings", icon: "home2", group: "bottom", roles: ["director", "dispatcher"] },
  { id: "settings", label: "nav.mySettings", icon: "sliders", group: "bottom" },
  // «Помощь и поддержка» (7а-1; App Store 1.5): for everyone, last in the menu
  { id: "help", label: "support.title", icon: "help", group: "bottom" },
  { id: "more", label: "nav.more", icon: "more", group: "bottom", phoneOnly: true },
];

/** Where a section opens for this role. Home = the role's own home screen; Leads, Estimates, Invoices — each its own screen. */
export function sectionHref(id: SectionId, role: Role): string {
  switch (id) {
    case "home":
      return `/${roleHome[role]}`;
    case "leads":
      return "/leads?tab=leads";
    case "estimates":
      // a section of its own for every role (founder 07.11, spec 31 §7а); /leads holds the leads only
      return "/estimates";
    case "finance":
      // visual v2 №6 (#2344): the tab opens its overview; the tech has no «Деньги» tab (his estimates are in «Ещё»)
      return role === "tech" ? "/estimates" : "/finance";
    case "invoices":
      // the one path to debts (18 §1): the list opens on «Не оплачен · Просрочен»
      return "/invoice";
    default:
      return `/${id}`;
  }
}

const visible = (s: Section, role: Role, sub = false) =>
  (!s.roles || s.roles.includes(role)) && !(sub && s.noSub) && canOpen(role, sectionHref(s.id, role));

/** this person works in the company as a subcontractor (Member.kind; the app role is «tech» all the same) */
export const meIsSub = (db: { me: string; members: readonly { id: string; kind: string }[] }) => db.members.some((m) => m.id === db.me && m.kind === "sub");

/** the tab a module's own tab takes the place of (founder 16.11, #1487: «давай план уберём и сделаем замеры»; DS §5.3) —
 *  «План» goes to «Ещё»; the bar stays at 5 */
export const MODULE_TAB_REPLACES: SectionId = "plan";
/** a bottom tab now: `modTab` — the company has a module's tab (moduleTabs), it stands where «План» was */
const isTab = (s: Section, modTab: boolean) => !!s.tab && !(modTab && s.id === MODULE_TAB_REPLACES);

/** the order of the bottom bar (prototype v2, BUILD-SPEC: Главная · План · Клиенты · Деньги · Лиды) */
export const TAB_ORDER: readonly SectionId[] = ["home", "plan", "clients", "finance", "leads"];
const tabRank = (id: SectionId) => TAB_ORDER.indexOf(id);

/** The 5 bottom tabs: the same set for the office (13 §2.1); the tech has no «Деньги» (audit 12 §2.6) — what is inside is filtered by rights. With a module's tab
 *  (`modTab`) «План» is not a tab: the module's tab takes its place (TabBar puts it there), «План» is in «Ещё».
 *  A subcontractor (`sub`) never gets leads (noSub): 4 tabs. */
export const tabs = (role: Role, modTab = false, sub = false): Section[] =>
  SECTIONS.filter((s) => isTab(s, modTab) && !(sub && s.noSub) && (!s.roles || s.roles.includes(role))).sort((a, b) => tabRank(a.id) - tabRank(b.id));

/** the money sections behind the one «Деньги» tab (its segment switches them) */
const FINANCE: ReadonlySet<SectionId> = new Set<SectionId>(["finance", "estimates", "invoices", "payments", "money"]);

/** Which bottom tab is lit for a section: the tab itself, «Деньги» for the money lists, none for a section of «Ещё»
 *  (it opens from the avatar; no tab is it — HIG: the bar never shows a place you are not in). */
export function tabOf(id: SectionId | undefined, role: Role, modTab = false, sub = false): SectionId | undefined {
  if (!id) return undefined;
  const t = FINANCE.has(id) ? "finance" : id;
  return tabs(role, modTab, sub).some((s) => s.id === t) ? t : undefined;
}

/**
 * The sections by group for this role, in order (13 v2 §2.3); a group with nothing the role may open is left out.
 * Phone (`wide` = false): the tiles of «Ещё» — the tabs are not repeated there. 820/1280: the side menu — everything but «Ещё».
 */
export function menuGroups(role: Role, wide = false, sub = false, modTab = false): { group: MenuGroup; items: Section[] }[] {
  const order: MenuGroup[] = ["top", "work", "docs", "money", "bottom"];
  return order
    .map((group) => ({ group, items: SECTIONS.filter((s) => s.group === group && !s.phoneOnly && (wide || !isTab(s, modTab)) && visible(s, role, sub)) }))
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
  // the lists keep their own item (the side menu lights it); the bar maps them to «Деньги» (tabOf)
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
export type FabSet = "home" | "plan" | "calls" | "clients" | "client" | "job" | "visit" | "tasks" | "messages";
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
export type FabId = "lead" | "client" | "job" | "estimate" | "expense" | "visit" | "planAdd" | "planEvent" | "planTimeOff" | "photo" | "task" | "call" | "message";
export interface FabItem {
  /** `module.<key>.<id>` — an item an add-on module adds to «＋» (modules/registry.ts, place "home") */
  id: FabId | `module.${string}`;
  label: DictKey;
  icon: IconKey;
  /** one line under the label in the «＋» sheet: what this makes and when (#1094: the estimate and the job look alike) */
  hint?: DictKey;
  /** a screen to open; undefined = an action the screen or the «＋» itself does (`act`) */
  href?: string;
  act?: "planAdd" | "planEvent" | "planTimeOff" | "photo" | "task" | "call" | "message";
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

const FAB_LOOK: Record<FabId, { label: DictKey; icon: IconKey; hint?: DictKey }> = {
  lead: { label: "path.leadNew", icon: "user" },
  client: { label: "path.clientNew", icon: "users" },
  job: { label: "path.jobNew", icon: "wrench", hint: "path.jobHint" },
  estimate: { label: "path.estimateNew", icon: "estimate", hint: "path.estimateHint" },
  expense: { label: "path.expenseNew", icon: "wallet" },
  visit: { label: "path.visitAdd", icon: "calendar" },
  planAdd: { label: "plan.add", icon: "calendar" },
  planEvent: { label: "plan5.addEvent", icon: "clock" },
  planTimeOff: { label: "plan5.addTimeOff", icon: "sun" },
  photo: { label: "path.photoAdd", icon: "camera" },
  task: { label: "task.new", icon: "check" },
  call: { label: "w6.call.title", icon: "phone" },
  message: { label: "w6.msg.new", icon: "sms" },
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
  home: [lead, client, estimate(OFFICE), expense(), job],
  // the schedule is the planners' (docs/specs/03 Р7): no «＋» on Plan for the technician
  // wave 5 (#187/#188): an event and a day off open the Plan's own EventSheet; the planners' only (Р7)
  plan: [
    { ...lead, roles: OFFICE },
    { id: "planAdd", roles: PLANNERS, act: "planAdd" },
    { id: "planEvent", roles: PLANNERS, act: "planEvent" },
    { id: "planTimeOff", roles: PLANNERS, act: "planTimeOff" },
    // «Работа без сметы» — the last line of every «＋» (main-path spec §2.2 п.4)
    job,
  ],
  // wave 6-2: «Записать звонок» first — the sheet asks «к чему» itself
  calls: [{ id: "call", act: "call" }, lead, client],
  // wave 6-3: the sheet asks «кому» itself
  messages: [{ id: "message", act: "message" }],
  // wave 6: the task form asks «к чему» itself (13 §2.4: nothing loose)
  tasks: [{ id: "task", act: "task" }],
  clients: [client],
  // #1094: the estimate first — it is what a client's card is opened for; the job is «when already agreed»
  client: [estimate(OFFICE, (c) => !!c.customerId), { ...job, needs: (c) => !!c.customerId }],
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

/**
 * Lists (DS §5.3, §12.2; founder 14.11, #1395 variant А): their «＋ <object>» is a secondary button in the screen's header on every width
 * (and the same button in an empty list); the floating yellow «＋» is «Главная»'s alone. Objects (client, job, visit) follow in the next groups.
 */
export const LIST_FABS: readonly FabSet[] = ["clients", "tasks", "plan", "calls", "messages"];

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

/**
 * The address a tile of «Ещё» opens (docs/specs/28 §3, the director's decision 07.11). A section that lives on a tab
 * screen but is not this role's home (office: Leads) gets `from=more`: the screen then shows
 * «‹ Ещё», and with the tabs' history the system back / Android back returns to «Ещё». The role's home (sales: Leads)
 * stays as it is.
 */
export function moreHref(id: SectionId, role: Role): string {
  const href = sectionHref(id, role);
  const route = routeKey(href);
  if (!isTabScreen(route) || route === roleHome[role]) return href;
  return `${href}${href.includes("?") ? "&" : "?"}from=more`;
}
