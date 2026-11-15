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
}

/** the company the person last worked in (per person): it stays first when the memberships are read again */
export const lastCompanyKey = (userId: string) => `octo.company.v1.${userId}`;

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
  a.length === b.length && a.every((m, i) => m.companyId === b[i].companyId && m.role === b[i].role && m.companyName === b[i].companyName);

/** the server's memberships rows → the app's; anything broken is left out. null — not an answer (not a list) */
export function parseMemberships(rows: unknown): Membership[] | null {
  if (!Array.isArray(rows)) return null;
  return rows.flatMap((r) => {
    const m = r as { company_id?: unknown; role?: unknown; companies?: { name?: unknown } | { name?: unknown }[] | null };
    if (typeof m?.company_id !== "string" || typeof m.role !== "string") return [];
    const c = Array.isArray(m.companies) ? m.companies[0] : m.companies;
    return [{ companyId: m.company_id, role: m.role as DbRole, companyName: typeof c?.name === "string" ? c.name : "" }];
  });
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
