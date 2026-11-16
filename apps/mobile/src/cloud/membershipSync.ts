/**
 * #1633 A2: the person was removed from a company or given another role — the phone keeps no copy of that company (or of
 * the role before). Pure rules (no React, no storage): test/membershipSync.test.ts. auth.tsx reads the memberships,
 * signOutWipe.ts removes the caches, the store reads the company again without what the role before kept.
 */
import type { Member, Role } from "@/data/types";

export type DbRole = "owner" | "admin" | "office" | "sales" | "tech" | "subcontractor";
export interface Membership {
  companyId: string;
  companyName: string;
  role: DbRole;
  /** when the person joined (memberships.created_at); absent in an older answer — spec 42 S34: the first by date */
  createdAt?: string;
}

/** the company the person last worked in (per person): it stays first when the memberships are read again */
export const lastCompanyKey = (userId: string) => `octo.company.v1.${userId}`;

/**
 * Spec 42 S34 (#1673): which company opens. The one the person is in now stays (a read again never switches it — #1633
 * A2); else the one this phone remembers; else the server's `users.last_active_company_id` (a new phone); else the first
 * they joined (by date, then by id). Each is taken only when it is among the memberships just read: a closed company or
 * one the person left is never opened by a remembered id (security-check С6). null — no memberships.
 */
export function pickActive(
  list: readonly Membership[],
  p: { current?: string | null; phone?: string | null; server?: string | null },
): string | null {
  const has = (id: string | null | undefined): id is string => !!id && list.some((m) => m.companyId === id);
  for (const id of [p.current, p.phone, p.server]) if (has(id)) return id;
  const first = [...list].sort((a, b) => {
    const ta = a.createdAt ?? "\uffff";
    const tb = b.createdAt ?? "\uffff";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.companyId < b.companyId ? -1 : a.companyId > b.companyId ? 1 : 0;
  })[0];
  return first?.companyId ?? null;
}

/**
 * The memberships in a fixed order (by company), the one the person works in first — a read again never switches the
 * company under them (memberships[0] is the store's company). `preferred` not among them — the first by order.
 */
export function orderMemberships(list: readonly Membership[], preferred: string | null | undefined): Membership[] {
  const sorted = [...list].sort((a, b) => (a.companyId < b.companyId ? -1 : a.companyId > b.companyId ? 1 : 0));
  const i = preferred ? sorted.findIndex((m) => m.companyId === preferred) : -1;
  if (i > 0) sorted.unshift(...sorted.splice(i, 1));
  return sorted;
}

/** the same answer as before (order, companies, roles, names): the app keeps the old array — no reload for nothing */
export const sameMemberships = (a: readonly Membership[], b: readonly Membership[]): boolean =>
  a.length === b.length &&
  a.every((m, i) => m.companyId === b[i].companyId && m.role === b[i].role && m.companyName === b[i].companyName && m.createdAt === b[i].createdAt);

/** spec 42 §14 (П3): the switch is to be written to the server (users.last_active_company_id) — kept until it is */
export const pendingLastKey = (userId: string) => `octo.company.pending.v1.${userId}`;

const ROLES: readonly string[] = ["owner", "admin", "office", "sales", "tech", "subcontractor"];
/**
 * the server's memberships rows → the app's. null — not an answer: not a list, or a row that is broken (no company, a
 * role this build does not know) — a list with a row left out would read as «removed» and wipe that company's cache
 * (security-check of #1674: such an answer is not confirmed)
 */
export function parseMemberships(rows: unknown): Membership[] | null {
  if (!Array.isArray(rows)) return null;
  const out: Membership[] = [];
  for (const r of rows) {
    const m = r as { company_id?: unknown; role?: unknown; created_at?: unknown; companies?: { name?: unknown } | { name?: unknown }[] | null };
    if (typeof m?.company_id !== "string" || !m.company_id || typeof m.role !== "string" || !ROLES.includes(m.role)) return null;
    const c = Array.isArray(m.companies) ? m.companies[0] : m.companies;
    out.push({
      companyId: m.company_id,
      role: m.role as DbRole,
      companyName: typeof c?.name === "string" ? c.name : "",
      ...(typeof m.created_at === "string" ? { createdAt: m.created_at } : {}),
    });
  }
  return out;
}

/** how the app shows a server role (repo.ts appRoles): owner and admin are both «director» */
function rolesOf(r: DbRole): Role[] {
  if (r === "owner" || r === "admin") return ["director", "dispatcher", "tech"];
  if (r === "office") return ["dispatcher"];
  if (r === "sales") return ["sales"];
  return ["tech"];
}
/**
 * The company's own read (loadCompanyDB, every 30 s) says who I am there: my row gone, switched off, or another role than
 * the memberships say → the memberships are read again (the person was removed or the role changed). The row shows the
 * server role by roles + owner + kind (tech and subcontractor differ only by kind).
 */
export function memberMatches(me: Member | undefined, role: DbRole): boolean {
  if (!me || me.pending || me.disabled) return false;
  const want = rolesOf(role);
  return (
    me.roles.length === want.length &&
    me.roles.every((r, i) => r === want[i]) &&
    !!me.isOwner === (role === "owner") &&
    me.kind === (role === "subcontractor" ? "sub" : "employee")
  );
}

/** the memberships are read again on a signal (42501, the company's own read) at most once per this */
export const MEMBERSHIP_REREAD_MS = 5 * 60_000;
/**
 * When the next read may go: now (0) or after this many ms — a signal inside the window is moved to its end, never
 * dropped (a refusal a minute after the start is still asked about), and never read more often (no loop on 42501).
 */
export const rereadDelay = (now: number, last: number | null, min = MEMBERSHIP_REREAD_MS): number =>
  last == null || now - last >= min ? 0 : last + min - now;
