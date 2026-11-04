/**
 * Lead logic (founder decisions 04.11, docs/03-prd/02-leads.md). Pure functions — unit-tested in test/leads.test.ts.
 *   Funnel: new → in touch → estimate visit → estimate sent → client.
 *   Closed: lost (the client decided) or declined (we decided), always with a reason; both can be reopened.
 *   Reply timer runs around the clock until the first answered call / SMS / email / "I replied".
 *   "Whose turn" (leadTurn) — the one question the card answers: reply / do the step / wait for the client / snoozed.
 */
import type { StatusName } from "@octo/design-tokens";
import { LEAD_SETTINGS_DEFAULT, type LeadSettings } from "./leadSettings";
import { DECLINE_REASONS, LOST_REASONS, type Customer, type DB, type Lead, type LeadStatus, type LostReason, type Role, type Source, type SourceKind, type Task } from "@/data/types";
import type { DictKey } from "@/i18n";

export const leadStatusView: Record<LeadStatus, { status: StatusName; label: DictKey }> = {
  new: { status: "info", label: "st.new" },
  replied: { status: "neutral", label: "st.replied" },
  booked: { status: "info", label: "st.booked" },
  estimate_sent: { status: "info", label: "lead.st.estimate" },
  won: { status: "ok", label: "lead.st.won" },
  lost: { status: "neutral", label: "st.lost" },
  declined: { status: "neutral", label: "lead.st.declined" },
};

export { DECLINE_REASONS, LOST_REASONS };
export const reasonsFor = (close: "lost" | "declined"): readonly LostReason[] => (close === "lost" ? LOST_REASONS : DECLINE_REASONS);
export const MANUAL_WIN_REASONS = ["paper", "verbal", "paid", "other"] as const;
export type ManualWinReason = (typeof MANUAL_WIN_REASONS)[number];

export const isOpenLead = (l: Lead) => l.status !== "won" && l.status !== "lost" && l.status !== "declined";
export const isClosedLead = (l: Lead) => l.status === "lost" || l.status === "declined";

const DAY = 86_400_000;
const daysBetween = (from: string, now: number) => Math.floor((now - new Date(from).getTime()) / DAY);
/** Snoozed right now ("call me in 3 months"): out of the open lists until the date. */
export const isSnoozed = (l: Lead, now = Date.now()) => isOpenLead(l) && !!l.snoozedUntil && new Date(l.snoozedUntil).getTime() > now;
/** The snooze date has come and nobody has touched the lead since: it is back on the list. */
export const isBackFromSnooze = (l: Lead, now = Date.now()) =>
  isOpenLead(l) && !!l.snoozedUntil && new Date(l.snoozedUntil).getTime() <= now && (l.lastActivityAt ?? "") < l.snoozedUntil;

/* ---------- sources ---------- */
export const sourceOf = (db: DB, id: string | undefined): Source | undefined => db.sources.find((s) => s.id === id);
export const sourceName = (db: DB, id: string | undefined): string => sourceOf(db, id)?.name ?? "—";
/** Picker list: active sources grouped by kind (marketplace, ads, person, own); the current one stays even if hidden. */
export function sourceGroups(db: DB, keepId?: string): { kind: SourceKind; items: Source[] }[] {
  const order: SourceKind[] = ["marketplace", "ads", "person", "own"];
  const list = db.sources.filter((s) => s.active || s.id === keepId);
  return order
    .map((kind) => ({ kind, items: list.filter((s) => s.kind === kind).sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name)) }))
    .filter((g) => g.items.length > 0);
}
/** A source can be deleted only while nothing refers to it; otherwise it is hidden. */
export const sourceInUse = (db: DB, id: string) => db.leads.some((l) => l.sourceId === id) || db.customers.some((c) => c.sourceId === id);

/* ---------- reply timer ---------- */
/** Minutes the lead has been waiting for the first reply (null once replied or closed). Around the clock (founder 04.11). */
export function waitingMinutes(l: Lead, now = Date.now()): number | null {
  if (l.firstResponseAt || l.status !== "new") return null;
  return Math.max(0, Math.floor((now - new Date(l.receivedAt).getTime()) / 60_000));
}
export function waitStatus(m: number, st: LeadSettings = LEAD_SETTINGS_DEFAULT): StatusName {
  return m >= st.replyBadMin ? "bad" : m >= st.replyWarnMin ? "warn" : "info";
}
/** How fast we replied (minutes) — for the card and the source report. */
export function responseMinutes(l: Lead): number | null {
  return l.firstResponseAt ? Math.max(0, Math.round((new Date(l.firstResponseAt).getTime() - new Date(l.receivedAt).getTime()) / 60_000)) : null;
}

/* ---------- duplicates ---------- */
/** Last 10 digits of a US number: "(818) 555-0170", "+1 818 555 0170" and "8185550170" match. */
export const phoneKey = (p: string | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);
const emailKey = (e: string | undefined) => (e ?? "").trim().toLowerCase();
export interface Duplicates {
  customers: Customer[];
  leads: Lead[];
}
/** Same phone (either of the lead's numbers) or email: an existing client, or another lead from the last 30 days / still open. */
export function findDuplicates(db: DB, q: { phone?: string; phone2?: string; email?: string }, exceptLeadId?: string, now = Date.now()): Duplicates {
  const phones = [phoneKey(q.phone), phoneKey(q.phone2)].filter((p) => p.length === 10);
  const email = emailKey(q.email);
  const hit = (p: string | undefined, e?: string) => (phones.length > 0 && phones.includes(phoneKey(p))) || (!!email && emailKey(e) === email);
  const customers = db.customers.filter((c) => hit(c.phone, c.email));
  const recent = now - 30 * 86_400_000;
  const leads = db.leads.filter(
    (l) => l.id !== exceptLeadId && (hit(l.phone, l.email) || (!!l.phone2 && phones.includes(phoneKey(l.phone2)))) && (isOpenLead(l) || new Date(l.receivedAt).getTime() >= recent),
  );
  return { customers, leads };
}

/* ---------- next step ---------- */
export type NextStep = "reply" | "book" | "estimate" | "remind" | null;
/** The one main action on the card. */
export function nextStep(l: Lead): NextStep {
  if (!isOpenLead(l)) return null;
  if (l.status === "new") return "reply";
  if (l.status === "replied") return "book";
  if (l.status === "booked") return "estimate";
  if (l.status === "estimate_sent") return "remind";
  return null;
}
export const openTasks = (db: DB, subjectId: string) =>
  db.tasks.filter((t) => t.subjectId === subjectId && !t.doneAt).sort((a, b) => (a.dueAt ?? "~").localeCompare(b.dueAt ?? "~"));
/** An open lead must have a next step: an open task or a booked estimate visit. */
export function needsNextStep(db: DB, l: Lead): boolean {
  if (!isOpenLead(l) || l.status === "new") return false;
  const hasVisit = l.status === "booked" || db.visits.some((v) => db.jobs.find((j) => j.id === v.jobId)?.propertyId === l.propertyId && l.propertyId && v.step !== "paid");
  return openTasks(db, l.id).length === 0 && !hasVisit;
}
export const isOverdueTask = (t: Task, now = Date.now()) => !t.doneAt && !!t.dueAt && new Date(t.dueAt).getTime() < now;

/* ---------- whose turn ---------- */
export type LeadTurn =
  | { kind: "reply"; minutes: number; attempts: number; status: StatusName }
  | { kind: "step"; dueAt?: string; title?: string; status: StatusName }
  | { kind: "wait"; days: number; action: "none" | "remind" | "lostOrWait"; status: StatusName }
  | { kind: "noStep"; status: StatusName }
  | { kind: "snoozed"; until: string; status: StatusName }
  | { kind: "done"; status: StatusName };
/**
 * What to do with the lead now (docs/14-leads-spec.md §3.2). Computed, never stored.
 *   reply   — new lead (later: the client wrote last); colour by minutes, unanswered calls don't stop it
 *   step    — an open task or a booked estimate visit; overdue = red
 *   wait    — the estimate went out (or we wrote last) and there is no step: remind after N days, then "lost or wait?"
 *   noStep  — open, not new, nothing planned
 *   snoozed — hidden until the date
 */
export function leadTurn(db: DB, l: Lead, st: LeadSettings = LEAD_SETTINGS_DEFAULT, now = Date.now()): LeadTurn {
  if (!isOpenLead(l)) return { kind: "done", status: leadStatusView[l.status].status };
  if (isSnoozed(l, now)) return { kind: "snoozed", until: l.snoozedUntil!, status: "neutral" };
  // silence is not counted while the lead was snoozed: clocks start again from the return date
  const after = (t: string | undefined) => (t && l.snoozedUntil && l.snoozedUntil > t ? l.snoozedUntil : t);
  const clientWroteLast = !!l.lastInboundAt && (!l.lastOutboundAt || l.lastInboundAt > l.lastOutboundAt);
  if (l.status === "new" || clientWroteLast) {
    const since = l.status === "new" ? l.receivedAt : l.lastInboundAt!;
    const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
    return { kind: "reply", minutes, attempts: l.callAttempts ?? 0, status: waitStatus(minutes, st) };
  }
  const task = openTasks(db, l.id)[0];
  if (task) {
    const due = task.dueAt ? new Date(task.dueAt).getTime() : null;
    const today = due !== null && new Date(due).toDateString() === new Date(now).toDateString();
    return { kind: "step", dueAt: task.dueAt, title: task.title, status: due === null ? "neutral" : due < now ? "bad" : today ? "info" : "neutral" };
  }
  if (l.status === "booked") {
    // the estimate visit is the step; once it has passed with no estimate, it is overdue (a day of grace)
    const visit = l.propertyId
      ? db.visits
          .filter((v) => db.jobs.find((j) => j.id === v.jobId && j.propertyId === l.propertyId && j.status === "estimate"))
          .sort((a, b) => b.start.localeCompare(a.start))[0]
      : undefined;
    if (!visit) return { kind: "step", status: "info" };
    const start = new Date(visit.start).getTime();
    if (start > now) return { kind: "step", dueAt: visit.start, status: new Date(start).toDateString() === new Date(now).toDateString() ? "info" : "neutral" };
    return { kind: "step", dueAt: visit.start, status: now - start >= DAY ? "bad" : "warn" };
  }
  const sentAt = db.estimates.filter((e) => e.leadId === l.id && e.status === "sent" && e.sentAt).map((e) => e.sentAt!).sort().pop();
  // we wrote last: the last thing we did was a message (SMS / email / marketplace / "I replied"), not a conversation
  const lastOut = db.activities
    .filter((a) => a.subjectType === "lead" && a.subjectId === l.id && ["call", "sms", "email", "marketplace", "reply"].includes(a.kind))
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  const wroteLast = !!lastOut && lastOut.kind !== "call" && (!l.lastInboundAt || lastOut.at > l.lastInboundAt);
  if (l.status === "estimate_sent" || sentAt || wroteLast) {
    const from = after([sentAt, wroteLast ? lastOut!.at : undefined].filter((x): x is string => !!x).sort().pop() ?? l.lastOutboundAt ?? l.lastActivityAt ?? l.receivedAt)!;
    const days = Math.max(0, daysBetween(from, now));
    // a reminder counts only for what is waiting now: a newer estimate or message starts over
    const reminded = l.remindedAt && (!sentAt || l.remindedAt >= sentAt) ? after(l.remindedAt)! : undefined;
    if (reminded && l.askAgainAt) {
      return new Date(l.askAgainAt).getTime() > now ? { kind: "wait", days, action: "none", status: "neutral" } : { kind: "wait", days, action: "lostOrWait", status: "warn" };
    }
    if (reminded) return daysBetween(reminded, now) >= st.lostOrWaitDays ? { kind: "wait", days, action: "lostOrWait", status: "warn" } : { kind: "wait", days, action: "none", status: "neutral" };
    if (days >= st.remindDays) return { kind: "wait", days, action: "remind", status: "warn" };
    return { kind: "wait", days, action: "none", status: "neutral" };
  }
  return { kind: "noStep", status: "warn" };
}

/** What the lead still needs before an estimate (docs/14 Р8): each item has an "Add" button on the card. */
export type MissingItem = "phone" | "email" | "address" | "zip" | "request";
export function missingForEstimate(l: Lead): MissingItem[] {
  const out: MissingItem[] = [];
  if (phoneKey(l.phone).length !== 10) out.push("phone");
  if (!l.email?.trim()) out.push("email");
  if (!l.address?.trim()) out.push("address");
  if (!/^\d{5}$/.test((l.zip ?? "").trim())) out.push("zip");
  if (!(l.service?.trim() || l.serviceItemId || l.message?.trim())) out.push("request");
  return out;
}

/* ---------- who sees what ---------- */
/** Office sees every lead; a tech sees leads assigned to him or created by him (a neighbor on site). Same rule as the server (RLS). */
export function canSeeLead(role: Role, me: string, l: Lead): boolean {
  return role !== "tech" || l.assigneeId === me || l.createdBy === me;
}
/** Lead cost and person-sources are office information. */
export const canSeeLeadCost = (role: Role) => role !== "tech";

/* ---------- list ---------- */
export type LeadFilter = "open" | "mine" | "waiting" | "snoozed" | "won" | "closed";
export function filterLeads(db: DB, role: Role, f: { filter: LeadFilter; sourceId?: string; q?: string }, now = Date.now()): Lead[] {
  const needle = (f.q ?? "").trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  return db.leads
    .filter((l) => canSeeLead(role, db.me, l))
    .filter((l) =>
      f.filter === "open" ? isOpenLead(l) && !isSnoozed(l, now)
      : f.filter === "mine" ? isOpenLead(l) && !isSnoozed(l, now) && l.assigneeId === db.me
      : f.filter === "waiting" ? waitingMinutes(l, now) !== null && !isSnoozed(l, now)
      : f.filter === "snoozed" ? isSnoozed(l, now)
      : f.filter === "won" ? l.status === "won"
      : isClosedLead(l),
    )
    .filter((l) => !f.sourceId || l.sourceId === f.sourceId)
    .filter((l) => {
      if (!needle) return true;
      return (
        l.name.toLowerCase().includes(needle) ||
        (digits.length >= 3 && (phoneKey(l.phone).includes(digits) || phoneKey(l.phone2).includes(digits))) ||
        `${l.address ?? ""} ${l.city} ${l.zip ?? ""}`.toLowerCase().includes(needle) ||
        (l.service ?? "").toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => {
      // waiting first (longest wait on top), then the newest
      const wa = waitingMinutes(a, now), wb = waitingMinutes(b, now);
      if (wa !== null || wb !== null) return (wb ?? -1) - (wa ?? -1);
      return b.receivedAt.localeCompare(a.receivedAt);
    });
}

/* ---------- history (timeline) ---------- */
export interface TimelineEntry {
  id: string;
  at: string;
  icon: "inbox" | "phone" | "sms" | "mail" | "send" | "check" | "refresh" | "user" | "note" | "invoice" | "calendar" | "close" | "pencil";
  key: DictKey;
  params?: Record<string, string>;
  body?: string;
  actorId?: string;
  pinned?: boolean;
}
/**
 * Everything about the lead in time order (newest first): received, calls / SMS / emails, status changes,
 * assignment, notes, estimate visits, estimates sent / opened / signed.
 */
export function leadTimeline(db: DB, l: Lead, viewer?: string): TimelineEntry[] {
  const out: TimelineEntry[] = [{ id: `rcv-${l.id}`, at: l.receivedAt, icon: "inbox", key: "tl.received", params: { source: sourceName(db, l.sourceId) }, body: l.message || undefined }];
  for (const a of db.activities.filter((x) => x.subjectType === "lead" && x.subjectId === l.id)) {
    const base = { id: a.id, at: a.at, actorId: a.actorId, body: a.body };
    if (a.kind === "call") out.push({ ...base, icon: "phone", key: "tl.call" });
    else if (a.kind === "sms") out.push({ ...base, icon: "sms", key: "tl.sms" });
    else if (a.kind === "email") out.push({ ...base, icon: "mail", key: "tl.email" });
    else if (a.kind === "marketplace") out.push({ ...base, icon: "send", key: "tl.marketplace", params: { source: sourceName(db, l.sourceId) } });
    else if (a.kind === "reply") out.push({ ...base, icon: "check", key: "tl.reply" });
    else if (a.kind === "assigned") out.push({ ...base, icon: "user", key: "tl.assigned", params: { name: db.members.find((m) => m.id === a.meta?.to)?.name ?? "—" } });
    else if (a.kind === "edited") out.push({ ...base, icon: "pencil", key: "tl.edited" });
    else if (a.kind === "status") {
      const to = (a.meta?.to ?? "") as LeadStatus;
      const reason = a.meta?.reason;
      out.push({
        ...base,
        icon: to === "lost" || to === "declined" ? "close" : to === "won" ? "check" : "refresh",
        key: to === "lost" || to === "declined" ? "tl.closed" : "tl.status",
        params: { status: leadStatusView[to]?.label ?? "st.new", reason: reason ? `lead.reason.${reason}` : "" },
      });
    }
  }
  for (const n of db.notes.filter((x) => x.subjectType === "lead" && x.subjectId === l.id && (x.visibility === "team" || x.authorId === viewer))) {
    out.push({ id: n.id, at: n.at, icon: "note", key: n.visibility === "private" ? "tl.notePrivate" : "tl.note", body: n.body, actorId: n.authorId, pinned: n.pinned });
  }
  for (const e of db.estimates.filter((x) => x.leadId === l.id)) {
    const p = { title: [e.number, e.title].filter(Boolean).join(" · ") };
    if (e.sentAt) out.push({ id: `es-${e.id}`, at: e.sentAt, icon: "invoice", key: "tl.estSent", params: p });
    if (e.viewedAt) out.push({ id: `ev-${e.id}`, at: e.viewedAt, icon: "invoice", key: "tl.estViewed", params: p });
    if (e.approvedAt) out.push({ id: `ea-${e.id}`, at: e.approvedAt, icon: "check", key: "tl.estApproved", params: p });
  }
  if (l.propertyId) {
    for (const v of db.visits.filter((x) => db.jobs.find((j) => j.id === x.jobId)?.propertyId === l.propertyId && db.jobs.find((j) => j.id === x.jobId)?.status === "estimate")) {
      out.push({ id: `v-${v.id}`, at: v.start, icon: "calendar", key: "tl.visit" });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
