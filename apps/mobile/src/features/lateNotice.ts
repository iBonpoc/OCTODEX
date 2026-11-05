/**
 * П3c (docs/specs/03 «П3c — этап 0», решение 5): the office notice «{tech} is running late to {client}» — computed in
 * the app from the one rule (schedule.ts lateKind), never stored, not in the server notifications. It lives while the
 * visit is late and goes by itself on «on site» or a ticked checklist item. Only the people who plan see it.
 * Tested in test/notices.test.ts (unit:notices).
 */
import { visitContext } from "@/data/selectors";
import type { DB, Notice, Role } from "@/data/types";
import { canPlan, lateKind } from "./schedule";

export function lateNotices(db: DB, role: Role, now: number = Date.now()): Notice[] {
  if (!canPlan([role])) return [];
  const out: Notice[] = [];
  for (const v of db.visits) {
    const late = lateKind(v, now);
    if (!late) continue;
    const { customer, tech } = visitContext(db, v);
    // an inspection of a lead without a client yet: the lead's name
    const client = customer?.name ?? (v.leadId ? db.leads.find((l) => l.id === v.leadId)?.name : undefined) ?? "";
    out.push({
      id: `late-${v.id}`, kind: "visit.late", visitId: v.id, customer: client, tech: tech?.name ?? "", late,
      // on the way: since when (older data may have no time); not left: the start
      lateAt: late === "en_route" ? v.enRouteAt : v.start,
      at: new Date(now).toISOString(),
    });
  }
  return out.sort((a, b) => (a.lateAt ?? "").localeCompare(b.lateAt ?? ""));
}
