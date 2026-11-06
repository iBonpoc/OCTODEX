/**
 * The bell on «Главная» (docs/specs/13 v2 §3.14): one count and one list from the same notices as «Сегодня»
 * (features/notices.tsx: the server notices + the computed «running late»), no second source. Pure — test/bell.test.ts.
 */
import type { DB, Notice, Role } from "@/data/types";
import { lateNotices } from "@/features/lateNotice";

/** what the bell lists: «running late» first (computed, never «read»), then unread, then the rest (read) */
export function bellNotices(db: DB, role: Role, now: number = Date.now()): { unread: Notice[]; read: Notice[] } {
  // client events and money are for the office only (spec 06 §7.6) — the technician gets his own kinds with the pushes
  if (role === "tech") return { unread: [], read: [] };
  const byNew = (a: Notice, b: Notice) => b.at.localeCompare(a.at);
  return {
    unread: [...lateNotices(db, role, now), ...db.notices.filter((n) => !n.read).sort(byNew)],
    read: db.notices.filter((n) => n.read).sort(byNew),
  };
}

export const unreadCount = (db: DB, role: Role, now: number = Date.now()) => bellNotices(db, role, now).unread.length;

/** where a notice opens: its estimate, invoice, or the late visit; nothing to open — no link */
export function noticeHref(n: Notice): string | undefined {
  if (n.kind === "visit.late") return n.visitId ? `/visit/${n.visitId}` : undefined;
  // invoice.paid → the invoice when notifications.invoice_id comes (wave П); until then its estimate or job
  if (n.estimateId) return `/estimate/${n.estimateId}`;
  if (n.jobId) return `/job/${n.jobId}`;
  return undefined;
}
