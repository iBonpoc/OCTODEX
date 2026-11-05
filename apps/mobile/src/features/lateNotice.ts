/**
 * П3c (docs/specs/03 «П3c — этап 0», решение 5): the office notice «{tech} is running late to {client}» — computed in
 * the app from the one rule (schedule.ts lateToday — the same window as «Требует внимания»), never stored, not in the server notifications. It lives while the
 * visit is late and goes by itself on «on site» or a ticked checklist item. Only the people who plan see it.
 * Tested in test/notices.test.ts (unit:notices).
 */
import type { DB, Notice, Role } from "@/data/types";
import { canPlan, lateToday, visitWho } from "./schedule";

/** at most this many «running late» cards on «Today» (the server notices have their own 5) */
export const LATE_NOTICES_MAX = 5;

export function lateNotices(db: DB, role: Role, now: number = Date.now()): Notice[] {
  if (!canPlan([role])) return [];
  const out: Notice[] = [];
  for (const v of db.visits) {
    // the same window as «Требует внимания» (today), so the item and the notice agree
    const late = lateToday(v, now);
    if (!late) continue;
    const { client, tech } = visitWho(db, v);
    out.push({
      id: `late-${v.id}`, kind: "visit.late", visitId: v.id, customer: client, tech, late,
      // on the way: since when (older data may have no time); not left: the start
      lateAt: late === "en_route" ? v.enRouteAt : v.start,
      at: new Date(now).toISOString(),
    });
  }
  return out.sort((a, b) => (a.lateAt ?? "").localeCompare(b.lateAt ?? "")).slice(0, LATE_NOTICES_MAX);
}
