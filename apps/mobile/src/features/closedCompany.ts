/**
 * 7а-3 «в» (S22b; docs/specs/22 §3.6): the people of a company its last owner closed with his account. The server says
 * which (my_closed_companies: my memberships gone with the closing, 90 days); the phone tells why there is no company —
 * once at the start (a sheet per company), on «Создать компанию» and in «Профиль и аккаунт» — and names the changes
 * still waiting for that company: the server refuses them now (42501), they are offered to be removed (rule 5).
 * Pure (no React): test/closedCompany.test.ts.
 */
import type { OwnedItem } from "@/data/outboxOwner";

export interface ClosedCompany {
  companyId: string;
  name: string;
  closedAt: string;
}

/** the stored «already shown» list: which closed companies the start sheet has told about on this phone */
export const CLOSED_SEEN_KEY = "octo.closedSeen.v1";

/** the rows of my_closed_companies → the app's shape; anything broken is left out */
export function parseClosed(rows: unknown): ClosedCompany[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r) => {
    const o = r as { company_id?: unknown; name?: unknown; closed_at?: unknown };
    return typeof o?.company_id === "string" && typeof o.closed_at === "string"
      ? [{ companyId: o.company_id, name: typeof o.name === "string" ? o.name : "", closedAt: o.closed_at }]
      : [];
  });
}

/** the stored list of shown companies (a broken value → none) */
export function parseSeen(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** the closed companies the start sheet has not told about yet (one sheet per company, founder 07.11) */
export const unseenClosed = (list: readonly ClosedCompany[], seen: readonly string[]): ClosedCompany[] =>
  list.filter((c) => !seen.includes(c.companyId));

/** the signed-in person's changes still waiting for that company (an op without an owner is not counted: whose is unknown) */
export const unsentIn = (items: readonly OwnedItem[], userId: string | null, companyId: string): OwnedItem[] =>
  userId ? items.filter((o) => o.owner?.userId === userId && o.owner.companyId === companyId) : [];

/** the outbox without them: other people's and other companies' ops stay (rule 6) */
export const withoutUnsentIn = (items: readonly OwnedItem[], userId: string | null, companyId: string): OwnedItem[] =>
  userId ? items.filter((o) => !(o.owner?.userId === userId && o.owner.companyId === companyId)) : [...items];

/** when it was closed, in the US format (rule 7): «Nov 5, 2026» */
const US_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
export const closedDay = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : US_DAY.format(d);
};

/**
 * a late answer of my_closed_companies counts only if it is the newest ask and the same person is still signed in on
 * this phone (security-check #312: else a new person would see the closed company of the one before)
 */
export const closedAnswerCounts = (ticket: number, newest: number, askedFor: string, signedIn: string | null | undefined): boolean =>
  ticket === newest && !!signedIn && signedIn === askedFor;
