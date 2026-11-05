import { timing, type StatusName } from "@octo/design-tokens";
import { daysSince, isOverdue, isToday, minutesSince, visitContext } from "@/data/selectors";
import type { DB, ID, Role } from "@/data/types";
import { canSeeLead, isBackFromSnooze, leadTurn } from "./leads";
import { leadSettingsOf } from "./leadSettings";
import type { DictKey } from "@/i18n";

export type AttentionKind = "lead" | "overdue" | "unassigned" | "estimate" | "late" | "schedule" | "leadIdle" | "leadNoStep" | "leadBack";
export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  refId: ID;
  status: StatusName;
  label: DictKey;
  params: Record<string, string | number>;
  /** short word for the status chip */
  chip: DictKey;
  name: string;
  amountCents?: number;
  /** higher = more urgent */
  score: number;
}

/** "Требует внимания" / triage queue: everything that needs a human decision now, most urgent first. */
export function buildAttention(db: DB, role: Role = "director"): AttentionItem[] {
  const out: AttentionItem[] = [];
  // Leads by "whose turn" (docs/14-leads-spec.md §3.2, §7.4): reply · remind · lost or wait? · no step · back from snooze.
  const st = leadSettingsOf(db.company);
  for (const l of db.leads) {
    if (!canSeeLead(role, db.me, l)) continue;
    const turn = leadTurn(db, l, st);
    if (isBackFromSnooze(l) && turn.kind !== "reply") {
      out.push({ id: `back-${l.id}`, kind: "leadBack", refId: l.id, name: l.name, label: "att.leadBack", params: { name: l.name }, chip: "lead.backChip", status: "info", score: 630 });
    } else if (turn.kind === "reply") {
      const m = turn.minutes;
      out.push({
        id: `lead-${l.id}`, kind: "lead", refId: l.id, name: l.name, label: "att.lead", params: { m, name: l.name, d: 0 }, chip: "inbox.waiting",
        status: turn.status, score: 1000 + m,
      });
    } else if (turn.kind === "wait" && turn.action !== "none") {
      const lost = turn.action === "lostOrWait";
      out.push({
        id: `idle-${l.id}`, kind: "leadIdle", refId: l.id, name: l.name, label: lost ? "att.leadLostOrWait" : "att.leadRemind", params: { d: turn.days, name: l.name },
        chip: "att.noReplyDays", status: turn.status, score: (lost ? 640 : 620) + turn.days,
      });
    } else if (turn.kind === "noStep") {
      out.push({ id: `nostep-${l.id}`, kind: "leadNoStep", refId: l.id, name: l.name, label: "att.leadNoStep", params: { name: l.name }, chip: "lead.noNextStepShort", status: "warn", score: 610 });
    }
  }
  for (const v of db.visits) {
    if (!isToday(v.start)) continue;
    const { customer, tech } = visitContext(db, v);
    if (!v.techId)
      out.push({ id: `un-${v.id}`, kind: "unassigned", refId: v.id, name: customer?.name ?? "", label: "att.unassigned", params: { name: customer?.name ?? "" }, chip: "st.unassigned", status: "warn", score: 900 });
    else if (v.late && (v.step === "scheduled" || v.step === "en_route"))
      out.push({ id: `late-${v.id}`, kind: "late", refId: v.id, name: tech?.name ?? "", label: "att.late", params: { name: `${tech?.name ?? ""} → ${customer?.name ?? ""}` }, chip: "st.late", status: "warn", score: 850 });
  }
  for (const j of db.jobs) {
    if (j.status !== "unscheduled" || db.visits.some((v) => v.jobId === j.id)) continue;
    const p = db.properties.find((x) => x.id === j.propertyId);
    const c = db.customers.find((x) => x.id === p?.customerId);
    out.push({ id: `sch-${j.id}`, kind: "schedule", refId: j.id, name: c?.name ?? "", label: "att.toSchedule", params: { name: c?.name ?? "" }, chip: "st.toSchedule", status: "warn", amountCents: j.amountCents, score: 950 });
  }
  for (const i of db.invoices) {
    if (i.paidCents >= i.totalCents) continue;
    const d = daysSince(i.dueDate);
    if (!isOverdue(i.dueDate)) continue;
    const c = db.customers.find((x) => x.id === i.customerId);
    out.push({ id: `inv-${i.id}`, kind: "overdue", refId: i.id, name: c?.name ?? "", label: "att.overdue", params: { name: c?.name ?? "" }, chip: "st.overdue", status: "bad", amountCents: i.totalCents - i.paidCents, score: 800 + d });
  }
  for (const e of db.estimates) {
    if (e.status !== "sent" || !e.sentAt) continue;
    const d = daysSince(e.sentAt);
    if (d < timing.estimateWarnDays) continue;
    const c = db.customers.find((x) => x.id === e.customerId);
    out.push({ id: `est-${e.id}`, kind: "estimate", refId: e.id, name: c?.name ?? "", label: "att.estimate", params: { d, name: c?.name ?? "" }, chip: "att.noReplyDays", status: d >= timing.estimateBadDays ? "bad" : "warn", amountCents: e.totalCents, score: 700 + d });
  }
  return out.sort((a, b) => b.score - a.score);
}
