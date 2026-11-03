import { timing, type StatusName } from "@octo/design-tokens";
import { daysSince, isToday, minutesSince, visitContext } from "@/data/selectors";
import type { DB, ID } from "@/data/types";
import type { DictKey } from "@/i18n";

export type AttentionKind = "lead" | "overdue" | "unassigned" | "estimate" | "late";
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
export function buildAttention(db: DB): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const l of db.leads) {
    if (l.status !== "new") continue;
    const m = minutesSince(l.receivedAt);
    out.push({
      id: `lead-${l.id}`, kind: "lead", refId: l.id, name: l.name, label: "att.lead", params: { m, name: l.name, d: 0 }, chip: "inbox.waiting",
      status: m >= timing.leadReplyBadMin ? "bad" : m >= timing.leadReplyWarnMin ? "warn" : "info",
      score: 1000 + m,
    });
  }
  for (const v of db.visits) {
    if (!isToday(v.start)) continue;
    const { customer, tech } = visitContext(db, v);
    if (!v.techId)
      out.push({ id: `un-${v.id}`, kind: "unassigned", refId: v.id, name: customer?.name ?? "", label: "att.unassigned", params: { name: customer?.name ?? "" }, chip: "st.unassigned", status: "warn", score: 900 });
    else if (v.late && (v.step === "scheduled" || v.step === "en_route"))
      out.push({ id: `late-${v.id}`, kind: "late", refId: v.id, name: tech?.name ?? "", label: "att.late", params: { name: `${tech?.name ?? ""} → ${customer?.name ?? ""}` }, chip: "st.late", status: "warn", score: 850 });
  }
  for (const i of db.invoices) {
    if (i.paidCents >= i.totalCents) continue;
    const d = daysSince(i.dueDate);
    if (new Date(i.dueDate).getTime() > Date.now()) continue;
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
