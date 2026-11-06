import { timing, type StatusName } from "@octo/design-tokens";
import { daysOverdue, daysSince, isOverdue, minutesSince, visitContext } from "@/data/selectors";
import type { DB, ID, Role } from "@/data/types";
import { canSeeLead, isBackFromSnooze, leadTurn } from "./leads";
import { leadSettingsOf } from "./leadSettings";
import { canCountersign } from "./estimateSign";
import { assigneesOf, canPlan, dayDiffIn, isOpenVisit, lateToday, visitWho } from "./schedule";
import { companyTz, scheduleSettingsOf } from "./scheduleSettings";
import { dayKeyIn } from "./zone";
import { jobAwaitingClose } from "@/features/jobDone";
import type { DictKey } from "@/i18n";

export type AttentionKind = "lead" | "overdue" | "unassigned" | "estimate" | "late" | "schedule" | "leadIdle" | "leadNoStep" | "leadBack"
  /* E2b-2 (docs/specs/07 «E2b — экраны подписи» §3, §7, §8) */
  | "estimateSign" | "estimateExpired" | "estimateDeclined"
  /* wave 3c (S10, S15): the last visit is over — is the job done? (docs/specs/17-job.md §4) */
  | "jobDone";
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

/** Where an attention item opens: its own record, never a general list. */
export function attentionHref(it: AttentionItem): string {
  switch (it.kind) {
    case "schedule": return `/job/schedule?jobId=${it.refId}`;
    case "jobDone": return `/job/${it.refId}`;
    case "overdue": return `/invoice/${it.refId}`;
    case "estimate":
    case "estimateSign":
    case "estimateExpired":
    case "estimateDeclined": return `/estimate/${it.refId}`;
    case "unassigned":
    case "late": return `/visit/${it.refId}`;
    default: return `/lead/${it.refId}`;
  }
}

/** "Требует внимания" / triage queue: everything that needs a human decision now, most urgent first. */
export function buildAttention(db: DB, role: Role = "director", now: number = Date.now()): AttentionItem[] {
  const out: AttentionItem[] = [];
  // Leads by "whose turn" (docs/14-leads-spec.md §3.2, §7.4): reply · remind · lost or wait? · no step · back from snooze.
  const st = leadSettingsOf(db.company);
  // the client signed the estimate: the company owes the next step, «remind the client» would be wrong (E2b-2)
  const clientSignedLead = new Set(db.estimates.filter((e) => e.status === "awaiting_countersign" && e.leadId).map((e) => e.leadId!));
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
    } else if (turn.kind === "wait" && turn.action !== "none" && !clientSignedLead.has(l.id)) {
      const lost = turn.action === "lostOrWait";
      out.push({
        id: `idle-${l.id}`, kind: "leadIdle", refId: l.id, name: l.name, label: lost ? "att.leadLostOrWait" : "att.leadRemind", params: { d: turn.days, name: l.name },
        chip: "att.noReplyDays", status: turn.status, score: (lost ? 640 : 620) + turn.days,
      });
    } else if (turn.kind === "noStep") {
      out.push({ id: `nostep-${l.id}`, kind: "leadNoStep", refId: l.id, name: l.name, label: "att.leadNoStep", params: { name: l.name }, chip: "lead.noNextStepShort", status: "warn", score: 610 });
    }
  }
  // Visits (docs/specs/03 П3c): only the people who plan (director, dispatcher) — a tech or sales has nothing to do here.
  // «Не назначено» today and tomorrow; «Опаздывает» by one rule (schedule.ts lateKind), «on the way» does not clear it.
  // «today» and «tomorrow» are the company's calendar days, not the phone's (П4a); the threshold is the company's
  const tz = companyTz(db.company);
  const sch = scheduleSettingsOf(db.company);
  if (canPlan([role])) {
    for (const v of db.visits) {
      if (!isOpenVisit(v)) continue;
      const dd = dayDiffIn(v.start, now, tz);
      const today = dd === 0;
      if (dd !== 0 && dd !== 1) continue;
      const { client, tech } = visitWho(db, v);
      if (!assigneesOf(v).length) {
        out.push({
          id: `un-${v.id}`, kind: "unassigned", refId: v.id, name: client, label: today ? "att.unassigned" : "late.unassignedTomorrow", params: { name: client },
          chip: today ? "st.unassigned" : "late.unassignedTomorrowChip", status: "warn", score: today ? 900 : 880,
        });
        continue;
      }
      const late = lateToday(v, now, sch, tz);
      if (late)
        out.push({ id: `late-${v.id}`, kind: "late", refId: v.id, name: tech, label: "att.late", params: { name: `${tech} → ${client}` }, chip: late === "en_route" ? "late.enRoute" : "late.notLeft", status: "warn", score: 850 });
    }
  }
  for (const j of db.jobs) {
    if (j.status !== "unscheduled" || db.visits.some((v) => v.jobId === j.id)) continue;
    const p = db.properties.find((x) => x.id === j.propertyId);
    const c = db.customers.find((x) => x.id === p?.customerId);
    out.push({ id: `sch-${j.id}`, kind: "schedule", refId: j.id, name: c?.name ?? "", label: "att.toSchedule", params: { name: c?.name ?? "" }, chip: "st.toSchedule", status: "warn", amountCents: j.amountCents, score: 950 });
  }
  // «Работа выполнена?» — to the office only (owner, admin, office); the technician is never asked (13 §3.4.1)
  if (role === "director" || role === "dispatcher") {
    for (const j of db.jobs) {
      if (!jobAwaitingClose(db, j)) continue;
      const c = db.customers.find((x) => x.id === (j.customerId ?? db.properties.find((p) => p.id === j.propertyId)?.customerId));
      out.push({ id: `done-${j.id}`, kind: "jobDone", refId: j.id, name: c?.name ?? "", label: "job3.att.done", params: { name: c?.name ?? "", title: j.title }, chip: "job3.att.doneChip", status: "info", amountCents: j.amountCents, score: 900 });
    }
  }
  for (const i of db.invoices) {
    if (i.paidCents >= i.totalCents) continue;
    if (!isOverdue(i.dueDate, now, tz)) continue;
    const d = daysOverdue(i.dueDate, now, tz);
    const c = db.customers.find((x) => x.id === i.customerId);
    out.push({ id: `inv-${i.id}`, kind: "overdue", refId: i.id, name: c?.name ?? "", label: "att.overdue", params: { name: c?.name ?? "" }, chip: "st.overdue", status: "bad", amountCents: i.totalCents - i.paidCents, score: 800 + d });
  }
  const office = role === "director" || role === "dispatcher";
  // «valid until» is a calendar day of the company (the server decides by it too)
  const today = dayKeyIn(now, tz);
  for (const e of db.estimates) {
    const c0 = db.customers.find((x) => x.id === e.customerId);
    const who = c0?.name ?? "";
    // the client signed → «sign the contract», only for those who may sign for the company
    if (e.status === "awaiting_countersign") {
      if (canCountersign(db, db.me))
        out.push({ id: `sign-${e.id}`, kind: "estimateSign", refId: e.id, name: who, label: "att.awaitingSign", params: { name: who }, chip: "att.awaitingSignChip", status: "warn", amountCents: e.approval?.totalCents ?? e.totalCents, score: 960 });
      continue;
    }
    // declined by the company after the client signed: change it or close the lead (the lead itself does not change)
    if (e.status === "declined" && e.declinedText) {
      const lead = e.leadId ? db.leads.find((l) => l.id === e.leadId) : undefined;
      if (office && lead && !["won", "lost", "declined"].includes(lead.status) && !lead.archivedAt)
        out.push({ id: `decl-${e.id}`, kind: "estimateDeclined", refId: e.id, name: who, label: "att.declined", params: { name: who, text: e.declinedText }, chip: "att.declinedChip", status: "warn", amountCents: e.totalCents, score: 640 });
      continue;
    }
    // past «valid until», still unsigned: director and office; replaces «no reply N days» (no duplicate)
    if (e.status === "sent" && e.validUntil && e.validUntil < today && !e.linkRevokedAt) {
      if (office)
        out.push({ id: `exp-${e.id}`, kind: "estimateExpired", refId: e.id, name: who, label: "att.expired", params: { name: who }, chip: "att.expiredChip", status: "neutral", amountCents: e.totalCents, score: 500 });
      continue;
    }
    if (e.status !== "sent" || !e.sentAt) continue;
    const d = daysSince(e.sentAt);
    if (d < timing.estimateWarnDays) continue;
    const c = db.customers.find((x) => x.id === e.customerId);
    out.push({ id: `est-${e.id}`, kind: "estimate", refId: e.id, name: c?.name ?? "", label: "att.estimate", params: { d, name: c?.name ?? "" }, chip: "att.noReplyDays", status: d >= timing.estimateBadDays ? "bad" : "warn", amountCents: e.totalCents, score: 700 + d });
  }
  return out.sort((a, b) => b.score - a.score);
}

