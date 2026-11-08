import { timing, type StatusName } from "@octo/design-tokens";
import { daysOverdue, daysSince, isOverdue, minutesSince, visitContext } from "@/data/selectors";
import type { DB, ID, Role, Task } from "@/data/types";
import { canSeeLead, isBackFromSnooze, leadTurn } from "./leads";
import { leadSettingsOf } from "./leadSettings";
import { canCountersign } from "./estimateSign";
import { canPlan, inspectionsNoEstimate, liveAssignees, dayDiffIn, isOpenVisit, lateToday, unassignedSoon, visitWho } from "./schedule";
import { businessHoursOf, companyTz, scheduleSettingsOf } from "./scheduleSettings";
import { dayKeyIn } from "./zone";
import { jobAwaitingClose } from "@/features/jobDone";
import { goneId } from "./team";
import type { DictKey } from "@/i18n";
import { REJECT_REASONS, type RejectedOp } from "@/data/outboxRejected";
import { canOpen } from "@/nav/roles";

export type AttentionKind = "lead" | "overdue" | "unassigned" | "estimate" | "late" | "schedule" | "leadIdle" | "leadNoStep" | "leadBack"
  /* E2b-2 (docs/specs/07 «E2b — экраны подписи» §3, §7, §8) */
  | "estimateSign" | "estimateExpired" | "estimateDeclined"
  /* wave 3c (S10, S15): the last visit is over — is the job done? (docs/specs/17-job.md §4) */
  | "jobDone"
  /* docs/specs/22 §2 (S22c): the person on a lead / a task is not at work any more — the office hands it over */
  | "leadOrphan" | "taskOrphan"
  /* docs/specs/23 §3 («Лиды и клиенты»): a money change the server refused — not written, the phone showed it */
  | "rejected"
  /* docs/specs/03 §5.2, §13 (S15): the inspection has passed N working days ago and there is no estimate yet */
  | "inspectionNoEstimate";
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
  /** taskOrphan: what refId is (the task's subject) */
  subject?: Task["subjectType"];
  /** where it opens, when it is not the record of `refId` by its kind (a refused change: the record it was about) */
  href?: string;
  /** the explanation under a reason with no client or lead (a refused change); absent — the kind's own */
  hint?: DictKey;
}

/** Where an attention item opens: its own record, never a general list. */
export function attentionHref(it: AttentionItem): string {
  switch (it.kind) {
    case "schedule": return `/job/schedule?jobId=${it.refId}`;
    case "jobDone": return `/job/${it.refId}`;
    case "rejected":
    case "inspectionNoEstimate": return it.href ?? `/lead/${it.refId}`;
    case "taskOrphan": return `${SUBJECT_PATH[it.subject ?? "lead"]}/${it.refId}`;
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

/** the screen of a task's subject (the same paths as tasks.ts taskSubject) */
const SUBJECT_PATH: Record<Task["subjectType"], string> = { lead: "/lead", customer: "/client", property: "/property", job: "/job", estimate: "/estimate" };

/** the words of a refused change: a module's own text (ModuleDef.rejectedKey), else the kind's */
export const rejectedLabel = (r: Pick<RejectedOp, "what" | "labelKey">): DictKey => (r.labelKey ?? `att.rejected.${r.what}`) as DictKey;

/** what to do about a refused change: «Открыть» → «Подключить» for who may open where it leads, else «ask the owner» */
export const rejectedHint = (r: Pick<RejectedOp, "what" | "href"> & { kind?: RejectedOp["kind"]; reason?: RejectedOp["reason"] }, role: Role): DictKey =>
  // a refusal we can explain: its own words (outboxRejected REJECT_REASONS)
  r.reason ? REJECT_REASONS[r.reason] :
  // settings changed by someone else first: not «the module is off» — read again, make the change again (review #374 №3)
  r.kind === "module.saveSettings" ? "sync.rejected.settingsHint" : r.what !== "module" ? "sync.rejected.hint" : canOpen(role, r.href) ? "sync.rejected.moduleHint" : "sync.rejected.moduleHintAsk";
/** «Открыть» on a refused change: only where this role may go (a module's card for a tech: nowhere — review M5a №3) */
export const rejectedOpens = (r: Pick<RejectedOp, "href">, role: Role) => canOpen(role, r.href);

/** "Требует внимания" / triage queue: everything that needs a human decision now, most urgent first. */
/** a refused money change is always first: above every other score (a lead waiting N minutes is 1000 + N, review #263 №1) */
export const REJECTED_SCORE = Number.MAX_SAFE_INTEGER;
export function buildAttention(db: DB, role: Role = "director", now: number = Date.now(), extra: { rejected?: readonly RejectedOp[] } = {}): AttentionItem[] {
  const out: AttentionItem[] = [];
  // a money change the server refused (the store's list — the signed-in person's own): first, the phone showed it as done
  for (const r of extra.rejected ?? []) {
    out.push({
      id: `rej-${r.id}`, kind: "rejected", refId: r.id, name: "", label: rejectedLabel(r), params: r.what === "module" ? { count: r.count ?? 0 } : {}, chip: "att.rejectedChip",
      status: "bad", amountCents: r.amountCents, score: REJECTED_SCORE, href: r.href, ...(r.what === "module" || r.reason ? { hint: rejectedHint(r, role) } : {}),
    });
  }
  // Leads by "whose turn" (docs/14-leads-spec.md §3.2, §7.4): reply · remind · lost or wait? · no step · back from snooze.
  const st = leadSettingsOf(db.company);
  // the client signed the estimate: the company owes the next step, «remind the client» would be wrong (E2b-2)
  const clientSignedLead = new Set(db.estimates.filter((e) => e.status === "awaiting_countersign" && e.leadId).map((e) => e.leadId!));
  // the office hands over what a person who is not at work any more had (docs/specs/22 §2): sales works leads too
  const office3 = role === "director" || role === "dispatcher" || role === "sales";
  // «Осмотр прошёл — сметы нет» (docs/specs/03 §13): the office and sales (they make estimates); a tech does not see it.
  // A lead gets it only when it has no other card (one card per lead).
  const noEst = office3
    ? inspectionsNoEstimate(db, now, st.inspectionNoEstimateDays, businessHoursOf(db.company), companyTz(db.company))
    : [];
  const noEstLead = new Map(noEst.filter((x) => x.lead).map((x) => [x.lead!.id, x]));
  for (const l of db.leads) {
    if (!canSeeLead(role, db.me, l)) continue;
    const turn = leadTurn(db, l, st);
    const before = out.length;
    // open, not snoozed (leadTurn: done / snoozed), not archived; one card per lead
    if (office3 && goneId(db, l.assigneeId) && turn.kind !== "done" && turn.kind !== "snoozed" && !l.archivedAt) {
      if (turn.kind === "reply") {
        // a new lead: anyone in the office may answer — «Ответить» stays, the words say nobody owns it
        const m = turn.minutes;
        out.push({ id: `lead-${l.id}`, kind: "lead", refId: l.id, name: l.name, label: "fr7.leadReplyOrphan", params: { m, name: l.name, d: 0 }, chip: "inbox.waiting", status: turn.status, score: 1000 + m });
      } else {
        out.push({ id: `orph-${l.id}`, kind: "leadOrphan", refId: l.id, name: l.name, label: "fr7.leadOrphan", params: { name: l.name }, chip: "fr7.noOwnerChip", status: "warn", score: 870 });
      }
      continue;
    }
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
    if (out.length === before && noEstLead.has(l.id)) {
      out.push({ id: `noest-${l.id}`, kind: "inspectionNoEstimate", refId: l.id, name: l.name, label: "visitP2.att.noEstimate", params: { name: l.name }, chip: "visitP2.att.noEstimateChip", status: "warn", score: 680 });
    }
  }
  for (const x of noEst) {
    if (x.lead || !x.customerId) continue;
    const c = db.customers.find((y) => y.id === x.customerId);
    if (!c) continue;
    out.push({
      id: `noest-v-${x.v.id}`, kind: "inspectionNoEstimate", refId: c.id, name: c.name, label: "visitP2.att.noEstimate", params: { name: c.name },
      chip: "visitP2.att.noEstimateChip", status: "warn", score: 680, href: `/client/${c.id}`,
    });
  }
  // Visits (docs/specs/03 П3c): only the people who plan (director, dispatcher) — a tech or sales has nothing to do here.
  // «Не назначено» today and tomorrow; «Опаздывает» by one rule (schedule.ts lateKind), «on the way» does not clear it.
  // «today» and «tomorrow» are the company's calendar days, not the phone's (П4a); the threshold is the company's
  const tz = companyTz(db.company);
  const sch = scheduleSettingsOf(db.company);
  if (canPlan([role])) {
    // «Не назначено» today and tomorrow — the same rule as the block on top of the Plan (schedule.ts unassignedSoon)
    for (const { v, dd } of unassignedSoon(db, now, tz)) {
      const today = dd === 0;
      const { client } = visitWho(db, v);
      out.push({
        id: `un-${v.id}`, kind: "unassigned", refId: v.id, name: client, label: today ? "att.unassigned" : "late.unassignedTomorrow", params: { name: client },
        chip: today ? "st.unassigned" : "late.unassignedTomorrowChip", status: "warn", score: today ? 900 : 880,
      });
    }
    for (const v of db.visits) {
      if (!isOpenVisit(v) || !liveAssignees(v, db.members).length) continue;
      const dd = dayDiffIn(v.start, now, tz);
      // yesterday too: a visit of 11:50 PM is still running late after the company's midnight (lateToday decides)
      if (dd !== 0 && dd !== 1 && dd !== -1) continue;
      const { client, tech } = visitWho(db, v);
      const late = lateToday(v, db.members, now, sch, tz);
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
  // a task of a person who is not at work: its own card, it opens the task's subject (never the general list)
  if (office3) {
    for (const x of db.tasks) {
      if (x.doneAt || !goneId(db, x.assigneeId)) continue;
      const late = !!x.dueAt && Date.parse(x.dueAt) < now;
      out.push({
        id: `torph-${x.id}`, kind: "taskOrphan", refId: x.subjectId, subject: x.subjectType, name: x.title, label: "fr7.taskOrphan", params: { name: x.title },
        chip: "fr7.noAssigneeChip", status: "warn", score: late ? 865 : 860,
      });
    }
  }
  // overdue invoices: those with «Счета» (owner, admin, office, sales — as RLS invoices_select); never the technician,
  // not even for his own jobs: he does not chase the client's money (15-flows §4 q.3 — by default no)
  for (const i of office3 ? db.invoices : []) {
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

