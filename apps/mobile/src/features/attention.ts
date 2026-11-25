import type { Mode } from "@/data/store";
import { timing, type StatusName } from "@octo/design-tokens";
import { seeCosts } from "./access";
import { contractStatement, invoiceOwes } from "@octo/estimating-engine";
import { daysOverdue, daysSince, isOverdue, minutesSince, visitContext } from "@/data/selectors";
import type { CancelledVisit, DB, ID, Role, Task } from "@/data/types";
import { canSeeLead, isBackFromSnooze, leadTurn } from "./leads";
import { leadSettingsOf } from "./leadSettings";
import { canCountersign } from "./estimateSign";
import { canPlan, inspectionsNoEstimate, liveAssignees, dayDiffIn, isOpenVisit, lateToday, unassignedSoon, visitWho } from "./schedule";
import { businessHoursOf, companyTz, scheduleSettingsOf } from "./scheduleSettings";
import { dayKeyIn } from "./zone";
import { isSnoozed } from "@/features/attentionSnooze";
import { jobAwaitingClose } from "@/features/jobDone";
import { isContractKind } from "@/features/contractKind";
import { goneId } from "./team";
import type { DictKey } from "@/i18n";
import { rejectReasonKey, type RejectedOp } from "@/data/outboxRejected";
import { canOpen } from "@/nav/roles";
import { canReview, missedCount, visitMissed, visitSettings } from "./checklist";
import { failedPhotos } from "@/data/photoUpload";
import { moneyText } from "@/i18n/translate";

/** #1431: photos the cloud did not take are only on one phone — just under a lead waiting for a reply, above the rest */
export const PHOTO_FAILED_SCORE = 990;

export type AttentionKind = "lead" | "overdue" | "unassigned" | "estimate" | "late" | "schedule" | "leadIdle" | "leadNoStep" | "leadBack"
  /* E2b-2 (docs/specs/07 «E2b — экраны подписи» §3, §7, §8) */
  | "estimateSign" | "estimateExpired" | "estimateDeclined"
  /* wave 3c (S10, S15): the last visit is over — is the job done? (docs/specs/17-job.md §4) */
  | "jobDone"
  /* #2048: the job is done and part of its contract is not invoiced — the money must not be lost (S11 job → invoice) */
  | "jobNotInvoiced"
  /* docs/specs/22 §2 (S22c): the person on a lead / a task is not at work any more — the office hands it over */
  | "leadOrphan" | "taskOrphan"
  /* docs/specs/23 §3 («Лиды и клиенты»): a money change the server refused — not written, the phone showed it */
  | "rejected"
  /* docs/specs/03 §5.2, §13 (S15): the inspection has passed N working days ago and there is no estimate yet */
  | "inspectionNoEstimate"
  /* docs/specs/08 §8 (CH2b): a finished visit left required items or photos undone — until «Просмотрено» or done */
  | "visitMissed"
  /* #1431: the cloud did not take photos of a visit — they are only on the phone that made them */
  | "photoFailed"
  /* #1807 (spec 53 §5.3б п.4): a price someone sent for a material counted from its cost — the server kept the one from
     the cost (an old build, sales without our costs) */
  | "priceRecalc"
  /* #2066: the client was not home — the office plans the visit again (until a new visit, or the job / lead is closed) */
  | "visitNoShow";
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
    case "jobDone":
    case "jobNotInvoiced": return `/job/${it.refId}`;
    case "rejected":
    case "inspectionNoEstimate": return it.href ?? `/lead/${it.refId}`;
    case "taskOrphan": return `${SUBJECT_PATH[it.subject ?? "lead"]}/${it.refId}`;
    case "overdue": return `/invoice/${it.refId}`;
    case "estimate":
    case "estimateSign":
    case "estimateExpired":
    case "estimateDeclined": return `/estimate/${it.refId}`;
    case "unassigned":
    case "late":
    case "visitMissed":
    case "photoFailed": return `/visit/${it.refId}`;
    case "priceRecalc": return `/catalog/${it.refId}`;
    case "visitNoShow": return it.href ?? `/job/schedule?jobId=${it.refId}`;
    default: return `/lead/${it.refId}`;
  }
}

/** the screen of a task's subject (the same paths as tasks.ts taskSubject) */
const SUBJECT_PATH: Record<Task["subjectType"], string> = { lead: "/lead", customer: "/client", property: "/property", job: "/job", estimate: "/estimate" };

/** the words of a refused change: a module's own text (ModuleDef.rejectedKey), else the kind's */
export const rejectedLabel = (r: Pick<RejectedOp, "what" | "labelKey">): DictKey => (r.labelKey ?? `att.rejected.${r.what}`) as DictKey;

/** what to do about a refused change: «Открыть» → «Подключить» for who may open where it leads, else «ask the owner» */
export const rejectedHint = (r: Pick<RejectedOp, "what" | "href"> & { kind?: RejectedOp["kind"]; reason?: RejectedOp["reason"]; estimateEdit?: RejectedOp["estimateEdit"] }, role: Role): DictKey =>
  // #2657: the edits are kept right here — copy or reset them (not «open the estimate»: its edits are not there)
  r.reason === "estimate_signed_meanwhile" && r.estimateEdit ? "est.rej.choice.why" :
  // a refusal we can explain: its own words (outboxRejected REJECT_REASONS)
  r.reason ? rejectReasonKey(r.reason, r.kind) :
  // settings changed by someone else first: not «the module is off» — read again, make the change again (review #374 №3)
  r.kind === "module.saveSettings" ? "sync.rejected.settingsHint" : r.what !== "module" ? "sync.rejected.hint" : canOpen(role, r.href) ? "sync.rejected.moduleHint" : "sync.rejected.moduleHintAsk";
/** «Открыть» on a refused change: only where this role may go (a module's card for a tech: nowhere — review M5a №3) */
export const rejectedOpens = (r: Pick<RejectedOp, "href">, role: Role) => canOpen(role, r.href);

/** #2066 «Клиента нет дома» to plan again: the latest no-show of each job / lead, while nothing happened after it (no
 *  visit of the same job / lead later than it — open, done or cancelled: once a new visit is booked the no-show is
 *  answered) and the job / lead is still open (a job waiting for a date or in progress; a lead in contact). One card
 *  per job / lead — it stands for its «Запланировать» / «нет шага» card. */
export function noShowsToPlan(db: Pick<DB, "visits" | "cancelledVisits" | "jobs" | "leads">): CancelledVisit[] {
  const latest = new Map<string, CancelledVisit>();
  for (const v of db.cancelledVisits ?? []) {
    if (v.cancelReason !== "no_show") continue;
    const key = v.jobId ? `j:${v.jobId}` : v.leadId ? `l:${v.leadId}` : null;
    if (!key) continue;
    const had = latest.get(key);
    if (!had || had.cancelledAt < v.cancelledAt) latest.set(key, v);
  }
  const same = (a: Pick<CancelledVisit, "jobId" | "leadId">, b: Pick<CancelledVisit, "jobId" | "leadId">) => (a.jobId ? a.jobId === b.jobId : !!a.leadId && !b.jobId && a.leadId === b.leadId);
  const later = (v: CancelledVisit) => [...db.visits, ...(db.cancelledVisits ?? [])].some((o) => o.id !== v.id && same(v, o) && o.start > v.start);
  return [...latest.values()].filter((v) => {
    if (later(v)) return false;
    if (v.jobId) {
      const j = db.jobs.find((x) => x.id === v.jobId);
      return !!j && (j.status === "unscheduled" || j.status === "in_progress") && !db.visits.some((o) => o.jobId === j.id && isOpenVisit(o));
    }
    const l = db.leads.find((x) => x.id === v.leadId);
    return !!l && l.status === "replied" && !l.archivedAt && !db.visits.some((o) => o.leadId === l.id && isOpenVisit(o));
  });
}

/** "Требует внимания" / triage queue: everything that needs a human decision now, most urgent first. */
/** a refused money change is always first: above every other score (a lead waiting N minutes is 1000 + N, review #263 №1) */
export const REJECTED_SCORE = Number.MAX_SAFE_INTEGER;
export function buildAttention(db: DB, role: Role = "director", now: number = Date.now(), extra: { rejected?: readonly RejectedOp[]; mode?: Mode } = {}): AttentionItem[] {
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
  // #2066 «Клиента не было дома»: the people who plan (director, dispatcher); the card stands for the job's / lead's own
  const noShows = canPlan([role]) ? noShowsToPlan(db) : [];
  const noShowJob = new Set(noShows.filter((v) => v.jobId).map((v) => v.jobId!));
  const noShowLead = new Map(noShows.filter((v) => !v.jobId && v.leadId).map((v) => [v.leadId!, v]));
  const noShowCard = (v: CancelledVisit, name: string, amountCents?: number): AttentionItem => ({
    id: `noshow-${v.id}`, kind: "visitNoShow", refId: (v.jobId ?? v.leadId)!, name, label: "noShow.att", params: { name, note: v.cancelText ?? "" },
    chip: "noShow.chip", status: "warn", amountCents, score: 940,
    href: v.jobId ? `/job/schedule?jobId=${v.jobId}` : `/lead/${v.leadId}`,
  });
  // a job's card here; a lead's — in the lead loop, as the lead's one card
  for (const v of noShows) {
    if (!v.jobId) continue;
    const job = db.jobs.find((j) => j.id === v.jobId)!;
    const p = db.properties.find((x) => x.id === job.propertyId);
    out.push(noShowCard(v, db.customers.find((c) => c.id === p?.customerId)?.name ?? "", job.amountCents));
  }
  for (const l of db.leads) {
    if (!canSeeLead(role, db.me, l)) continue;
    const turn = leadTurn(db, l, st, now);
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
    // #2066: the no-show card is this lead's one card (a new message from the client comes instead; snoozed — none)
    const ns = noShowLead.get(l.id);
    if (ns && turn.kind !== "reply") {
      if (turn.kind !== "snoozed" && turn.kind !== "done") out.push(noShowCard(ns, l.name));
      continue;
    }
    if (isBackFromSnooze(l, now) && turn.kind !== "reply") {
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
  // «Не сделано» (docs/specs/08 §8, В4): one card per finished visit with required items or photos left undone — warn,
  // not red; until the office presses «Просмотрено» or the tech finishes them. Visits before the company turned
  // checklists on (checklistSince) are left alone. The office only (the same who may press «Просмотрено»).
  // an old server (no checklist migration): no checklistSince, no «Просмотрено» — no cards at all, not a flood of old visits
  if (canReview(role) && !db.checklistLegacy) {
    const vs = visitSettings(db);
    for (const v of db.visits) {
      if (v.checklistReviewedAt) continue;
      const n = missedCount(visitMissed(v, vs, db.checklistTemplates ?? [], db.company?.checklistSince));
      if (!n) continue;
      const { client } = visitWho(db, v);
      const date = new Date(v.start).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
      out.push({ id: `miss-${v.id}`, kind: "visitMissed", refId: v.id, name: client, label: "chk2b.att.missed", params: { name: client, date, n }, chip: "chk2b.att.chip", status: "warn", score: 620 });
    }
  }
  for (const j of db.jobs) {
    if (j.status !== "unscheduled" || db.visits.some((v) => v.jobId === j.id) || noShowJob.has(j.id)) continue;
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
    // #2048: done, and part of the job's price is still not on any invoice (the engine's contract statement: price −
    // invoiced). #2061 (rule А, the lead 18.11): the contract's own invoices only — deposit / progress / final, as the
    // server's app.job_contract_billed; a standalone or recurring one is extra work and does not cover the contract.
    // It goes away when contract invoices cover the price. A visit closed with no payment (#2018) lands here too.
    const done = db.jobs.filter((j) => j.status === "done" && Number.isFinite(j.amountCents) && j.amountCents > 0);
    if (done.length) {
      const byJob = new Map<ID, typeof db.invoices>();
      for (const i of db.invoices) if (i.jobId && isContractKind(i.kind)) byJob.set(i.jobId, [...(byJob.get(i.jobId) ?? []), i]);
      for (const j of done) {
        const left = contractStatement(j.amountCents, byJob.get(j.id) ?? []).toInvoice;
        if (!(left > 0)) continue;
        const c = db.customers.find((x) => x.id === (j.customerId ?? db.properties.find((p) => p.id === j.propertyId)?.customerId));
        out.push({ id: `noinv-${j.id}`, kind: "jobNotInvoiced", refId: j.id, name: c?.name ?? "", label: "att.notInvoiced", params: { name: c?.name ?? "", title: j.title }, chip: "att.notInvoicedChip", status: "warn", amountCents: left, score: 820 });
      }
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
    out.push({ id: `inv-${i.id}`, kind: "overdue", refId: i.id, name: c?.name ?? "", label: "att.overdue", params: { name: c?.name ?? "" }, chip: "st.overdue", status: "bad", amountCents: invoiceOwes(i), score: 800 + d });
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
  // #1431: one reason per visit whose photos the cloud did not take (they are only on the phone that made them)
  const failedBy = new Map<string, number>();
  for (const f of failedPhotos(db)) failedBy.set(f.visitId, (failedBy.get(f.visitId) ?? 0) + 1);
  for (const [visitId, n] of failedBy) {
    const v = db.visits.find((x) => x.id === visitId);
    const name = v ? visitContext(db, v).customer?.name ?? "" : "";
    // which visit (a client may have several): its date, as «Не сделано» says it
    const date = v ? new Date(v.start).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz }) : "";
    out.push({ id: `photo-${visitId}`, kind: "photoFailed", refId: visitId, name, label: "photoUp.att", params: { n, name, date }, chip: "photoUp.chip", status: "bad", score: PHOTO_FAILED_SCORE });
  }
  out.push(...priceRecalcItems(db, role, now, extra.mode));
  // #2097: a reason the office put off («Позже») is not shown — nor counted — until its day; then it is back by itself
  return out.filter((x) => !isSnoozed(db, x.id, now)).sort((a, b) => b.score - a.score);
}

/** #1807: below an estimate without a reply (700 +) and an inspection without an estimate (680): a price, not a client */
export const PRICE_RECALC_SCORE = 650;
/** how long a replaced price stays a reason (no «Понятно»: it goes by itself; the item's own history keeps it) */
export const PRICE_RECALC_DAYS = 7;
/**
 * #1807 (spec 53 §5.3б п.4): one reason per material whose sent price the server replaced with the one from its cost, the
 * last of the past 7 days. Only who sees our costs (the rows come only to them — catalog_price_recalc's RLS — and not to a
 * tech in any case). The words: who sent what and what stayed.
 */
/** `mode`: the store's (the screens pass it); a pure caller without one — the demo's rule */
export function priceRecalcItems(db: Pick<DB, "priceRecalc" | "catalog" | "members" | "costsVisible">, role: Role, now: number, mode: Mode = "demo"): AttentionItem[] {
  // a cache that is not a list (an old or broken one) is no reason
  // #1837: who sees our costs (features/access.ts) — the tech view never
  if (!seeCosts(db, role, mode) || !Array.isArray(db.priceRecalc) || !db.priceRecalc.length) return [];
  const since = now - PRICE_RECALC_DAYS * 864e5;
  const last = new Map<ID, NonNullable<DB["priceRecalc"]>[number]>();
  for (const r of db.priceRecalc) {
    if (!(Date.parse(r.at) >= since)) continue;
    const had = last.get(r.itemId);
    if (!had || Date.parse(r.at) > Date.parse(had.at)) last.set(r.itemId, r);
  }
  const out: AttentionItem[] = [];
  for (const r of last.values()) {
    const item = db.catalog.find((c) => c.id === r.itemId);
    if (!item) continue;
    const who = (r.by && db.members.find((m) => m.id === r.by)?.name) || "";
    out.push({
      id: `recalc-${r.itemId}`, kind: "priceRecalc", refId: r.itemId, name: item.name,
      label: who ? "price.recalc.att" : "price.recalc.attNoWho",
      params: { name: item.name, who, sent: moneyText(r.sentCents), kept: moneyText(r.serverCents) },
      chip: "price.recalc.chip", status: "warn", score: PRICE_RECALC_SCORE,
    });
  }
  return out;
}

