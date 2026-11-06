/**
 * History of a job (docs/specs/13 §3.4 «История», 17-job §7.1): visits (cancelled ones with the reason), the signed
 * estimate, invoices and payments, status and assignment events, notes, calls and messages — newest first.
 * Filters: Всё · Действия · Заметки · Звонки. Amounts only for roles that see job money (canSeeProfit); the technician
 * sees the events of his job without sums. Private notes of others are left out.
 */
import type { DB, Role, Visit } from "@/data/types";
import type { DictKey } from "@/i18n";
import type { IconKey } from "@/ui/primitives";
import { findJob } from "@/data/jobs";
import { canSeeProfit } from "@/nav/roles";

export type JobHistoryFilter = "all" | "action" | "note" | "call";
export interface JobHistoryItem {
  id: string;
  at: string;
  kind: Exclude<JobHistoryFilter, "all">;
  icon: IconKey;
  title: DictKey;
  detail?: string;
  /** a reason word key (cancelled visit) shown after the detail */
  reason?: DictKey;
  href?: string;
  cents?: number;
}

type D = Pick<DB, "jobs" | "cancelledJobs" | "visits" | "cancelledVisits" | "estimates" | "invoices" | "payments" | "notes" | "activities" | "me">;

export function jobHistory(db: D, jobId: string, role: Role): JobHistoryItem[] {
  const job = findJob(db, jobId);
  if (!job) return [];
  const money = canSeeProfit(role);
  const out: JobHistoryItem[] = [];
  const est = job.estimateId ? db.estimates.find((e) => e.id === job.estimateId) : undefined;
  if (est?.approvedAt) out.push({ id: `est-${est.id}`, at: est.approvedAt, kind: "action", icon: "signature", title: "job3.h.estimateSigned", detail: est.number, href: role === "tech" ? undefined : `/estimate/${est.id}`, cents: money ? est.totalCents : undefined });
  for (const v of db.visits.filter((x) => x.jobId === job.id)) {
    out.push({ id: `visit-${v.id}`, at: v.start, kind: "action", icon: "route", title: v.step === "paid" || v.step === "done" ? "job3.h.visitDone" : "job3.h.visit", href: `/visit/${v.id}` });
  }
  for (const v of (db.cancelledVisits ?? []).filter((x) => x.jobId === job.id)) {
    out.push({ id: `vcan-${v.id}`, at: v.cancelledAt, kind: "action", icon: "close", title: "job3.h.visitCancelled", detail: v.cancelText, reason: `vc.r.${v.cancelReason}` as DictKey });
  }
  for (const i of db.invoices.filter((x) => x.jobId === job.id && x.sentAt)) {
    out.push({ id: `inv-${i.id}`, at: i.sentAt!, kind: "action", icon: "invoice", title: "job3.h.invoice", detail: i.number, href: `/invoice/${i.id}`, cents: money ? i.totalCents : undefined });
  }
  const invIds = new Set(db.invoices.filter((x) => x.jobId === job.id).map((x) => x.id));
  for (const p of db.payments.filter((x) => invIds.has(x.invoiceId))) {
    out.push({ id: `pay-${p.id}`, at: p.at, kind: "action", icon: "dollar", title: "job3.h.payment", detail: p.receiptNumber, href: `/receipt/${p.id}`, cents: money ? p.amountCents : undefined });
  }
  for (const n of db.notes.filter((x) => x.subjectType === "job" && x.subjectId === job.id)) {
    if (n.visibility === "private" && n.authorId !== db.me) continue;
    out.push({ id: `note-${n.id}`, at: n.at, kind: "note", icon: "note", title: "job3.h.note", detail: n.body });
  }
  for (const a of db.activities.filter((x) => x.subjectType === "job" && x.subjectId === job.id)) {
    if (a.kind === "call" || a.kind === "sms" || a.kind === "email") {
      out.push({ id: `act-${a.id}`, at: a.at, kind: "call", icon: a.kind === "call" ? "phone" : a.kind === "sms" ? "sms" : "mail", title: `job3.h.${a.kind}`, detail: a.body });
    } else if (a.kind === "status" || a.kind === "assigned" || a.kind === "edited") {
      out.push({ id: `act-${a.id}`, at: a.at, kind: "action", icon: a.kind === "assigned" ? "userCheck" : "history", title: `job3.h.${a.kind}`, detail: a.body });
    }
  }
  return out.filter((x) => !!x.at).sort((a, b) => b.at.localeCompare(a.at));
}

export const filterJobHistory = (items: JobHistoryItem[], f: JobHistoryFilter) => (f === "all" ? items : items.filter((x) => x.kind === f));

/** the next visit of the job that is not finished yet (actions of the job go by it, 13 §3.4 п. 2) */
export function nextOpenVisit(db: Pick<DB, "visits">, jobId: string): Visit | undefined {
  return db.visits
    .filter((v) => v.jobId === jobId && v.step !== "paid" && v.step !== "done")
    .sort((a, b) => a.start.localeCompare(b.start))[0];
}

