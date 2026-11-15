import type { Role } from "@/data/types";

/** The home screen of each role — the «Главная» tab opens it (docs/specs/13 §2.1, §3.1). */
export type HomeRoute = "today" | "triage" | "visits" | "leads";

/** Screens of the bottom/top tab navigator ((tabs)/_layout): they already have the tab bar. */
// inbox and more are redirects (old addresses: «Продажи» → /leads, «Ещё» → ☰)
// calls left the tabs (docs/specs/28): a section of «Ещё» with «‹ Ещё» and the back swipe
const TAB_SCREENS = new Set<string>(["index", "visits", "triage", "today", "leads", "inbox", "plan", "messages", "clients", "more"]);
export const isTabScreen = (routeName: string) => TAB_SCREENS.has(routeName);

export const roleHome: Record<Role, HomeRoute> = { tech: "visits", dispatcher: "triage", director: "today", sales: "leads" };

const ALL: readonly Role[] = ["tech", "dispatcher", "director", "sales"];
const OFFICE: readonly Role[] = ["dispatcher", "director", "sales"];
const PLANNERS: readonly Role[] = ["dispatcher", "director"];

/**
 * Who may open a screen (route-guard; docs/specs/03 §8.1, docs/specs/05 §2, §4.2).
 * Key = the first part of the address (`/company/hours` → "company"); a screen not listed is open to every role.
 * The technician sees only his own work: no company money (Today, Money, figures), no Sales and lead prices,
 * no Triage; Company settings and Team — director (owner/admin) only. The server limits the data the same way (RLS);
 * this table only keeps the screens closed. Invoices and receipts stay open: the tech takes a payment on site
 * (the /invoice list itself shows «Нет доступа» to him — canSeeInvoiceList).
 */
export const routeRoles: Record<string, readonly Role[]> = {
  today: OFFICE,
  money: OFFICE,
  // Payments: owner, admin, office — not the technician, not sales (13 §4)
  payments: PLANNERS,
  // Reports: owner, admin, office (looks) — not sales, not the technician (13 §4; 18 §5)
  reports: PLANNERS,
  figures: OFFICE,
  triage: OFFICE,
  // the tech: his own leads (13 §2.3, §4); /inbox is an old address of the office's «Продажи»
  leads: [...OFFICE, "tech"],
  inbox: OFFICE,
  team: ["director"],
  // the office reads, the director changes (spec 26 §3; companies_update is owner / admin in the database)
  company: ["director", "dispatcher"],
  // spec 36 §8: owner, admin, office (suppliers_select in the database is the same)
  suppliers: PLANNERS,
  // spec 37: the list is the office's; one order (/purchase-order/<id>) opens for the tech of its job too (RLS)
  "purchase-orders": PLANNERS,
  // one order: the office and the tech of its job (RLS); not sales (spec 36 В3) — review SUP2-б
  "purchase-order": [...PLANNERS, "tech"],
};

/** the first part of an address: "/company/hours?x=1" → "company", "/" → "" */
export const routeKey = (path: string) => path.split(/[?#]/)[0]!.split("/").filter(Boolean)[0] ?? "";

/** «Прибыль» of a job (revenue − expenses, margin): owner, admin, office — the technician never sees the company's money,
 *  sales see no expenses of the company (13 §3.4, §4; #868, founder's #1042: «no» by default) */
export const canSeeProfit = (role: Role) => role === "director" || role === "dispatcher";

/** may this role open the screen at `path` */
export const canOpen = (role: Role, path: string) => (routeRoles[routeKey(path)] ?? ALL).includes(role);

/** the role the app works in: the chosen one if this person has it, else their first role */
export const effectiveRole = (role: Role, available: readonly Role[]): Role =>
  available.includes(role) ? role : (available[0] ?? role);
