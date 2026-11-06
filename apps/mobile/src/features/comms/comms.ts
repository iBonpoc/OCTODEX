/**
 * «Звонки» and «Сообщения» tabs, wave 2 (docs/specs/13 §2.1, 13а §3): an honest log of what the app already records —
 * the «позвонить» / «SMS» / «письмо» buttons write an activity (touchLead). No own phone number yet, so no inbound,
 * no unread or missed counters. Wave 6 grows these into full screens.
 * Pure (no React) — unit-tested in test/comms.test.ts.
 */
import type { Activity, CallInput, CallOutcome, DB, Person, Role, Visit } from "@/data/types";
import type { DictKey } from "@/i18n";
import type { StatusName } from "@octo/design-tokens";
import { peopleForLead, peopleOf } from "@/data/people";
import { canSeeLead } from "@/features/leads";
import { isAssigned } from "@/features/schedule";
import { addDays, todayKey } from "@/features/calendar";
import { dayKeyIn } from "@/features/zone";
import { memberName } from "@/features/team";

export type CommsKind = "calls" | "messages";
const KINDS: Record<CommsKind, readonly Activity["kind"][]> = { calls: ["call"], messages: ["sms", "email"] };

export interface CommsEntry {
  id: string;
  kind: Activity["kind"];
  at: string;
  /** who the call or message was with (lead, client, job title or estimate number) */
  who: string;
  href?: string;
  /** who in the team made it */
  by?: string;
  outcome?: CallOutcome;
  /** wave 6-2: the person the call was with, and its minutes */
  person?: string;
  durationMin?: number;
  /** the note written with the call */
  note?: string;
}

/** the outcome of a call: a sign of the event, icon + word (map §5, 20 §4) */
export const CALL_OUTCOME: Record<CallOutcome, { tone: StatusName; label: DictKey }> = {
  answered: { tone: "ok", label: "nav.calls.answered" },
  no_answer: { tone: "warn", label: "nav.calls.noAnswer" },
  voicemail: { tone: "warn", label: "nav.calls.voicemail" },
};
export const CALL_OUTCOMES: readonly CallOutcome[] = ["answered", "no_answer", "voicemail"];

/**
 * Newest first. The technician sees only his own (13 §2.1: «мастер видит звонки и сообщения по своим выездам»):
 * what he made, and what was said about his jobs and their clients.
 */
export function commsLog(db: DB, role: Role, kind: CommsKind, deletedWord = ""): CommsEntry[] {
  const kinds = KINDS[kind];
  const mine = role === "tech" ? techScope(db) : undefined;
  return db.activities
    .filter((a) => kinds.includes(a.kind) && (!mine || a.actorId === db.me || (a.subjectType === "job" && mine.jobs.has(a.subjectId)) || (a.subjectType === "customer" && mine.customers.has(a.subjectId)) || (a.subjectType === "lead" && mine.leads.has(a.subjectId))))
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((a) => {
      const s = subject(db, a);
      const outcome = a.meta?.outcome as CallOutcome | undefined;
      const minutes = Number(a.meta?.duration_min);
      const person = a.contactId ? peopleOfSubject(db, a.subjectType, a.subjectId).find((p) => p.id === a.contactId)?.name : undefined;
      return {
        id: a.id, kind: a.kind, at: a.at, who: s.who, href: s.href, by: memberName(db, a.actorId, deletedWord),
        ...(outcome ? { outcome } : {}), ...(person ? { person } : {}), ...(minutes > 0 ? { durationMin: minutes } : {}), ...(a.body ? { note: a.body } : {}),
      };
    });
}

function subject(db: DB, a: Activity): { who: string; href?: string } {
  switch (a.subjectType) {
    case "lead": {
      const l = db.leads.find((x) => x.id === a.subjectId);
      return { who: l?.name ?? "", href: l ? `/lead/${l.id}` : undefined };
    }
    case "customer": {
      const c = db.customers.find((x) => x.id === a.subjectId);
      return { who: c?.name ?? "", href: c ? `/client/${c.id}` : undefined };
    }
    case "job": {
      const j = db.jobs.find((x) => x.id === a.subjectId);
      return { who: j?.title ?? "", href: j ? `/job/${j.id}` : undefined };
    }
    case "estimate": {
      const e = db.estimates.find((x) => x.id === a.subjectId);
      return { who: e?.number ?? "", href: e ? `/estimate/${e.id}` : undefined };
    }
  }
}

/** the jobs the technician has a visit on, their clients, and his own leads (inspections he was given or made, map §2) */
function techScope(db: DB, now = Date.now()): { jobs: Set<string>; customers: Set<string>; leads: Set<string> } {
  const jobs = new Set(db.visits.filter((v) => v.jobId && techVisitCounts(db, v, now)).map((v) => v.jobId!));
  const props = new Set(db.jobs.filter((j) => jobs.has(j.id)).map((j) => j.propertyId));
  const customers = new Set(db.properties.filter((p) => props.has(p.id)).map((p) => p.customerId).filter((c): c is string => !!c));
  const leads = new Set(db.leads.filter((l) => canSeeLead("tech", db.me, l)).map((l) => l.id));
  return { jobs, customers, leads };
}

/**
 * A visit of the technician that opens its job and client to him — the server's app.tech_visit_counts (migration
 * 20261105200000), repeated so the app never offers what the server refuses: his visit, not cancelled (cancelled ones
 * are not loaded) and not a no-show (closed without the «done» step), its job loaded (not cancelled) and not done
 * (the app does not tell «completed» from «closed», so both are left out — never a refused write), dated today, later or
 * within the last 14 days of the company's calendar.
 */
export function techVisitCounts(db: Pick<DB, "me" | "jobs">, v: Visit, now = Date.now()): boolean {
  if (!isAssigned(v, db.me)) return false;
  if (v.closed && v.step !== "done") return false;
  if (v.jobId) {
    const j = db.jobs.find((x) => x.id === v.jobId);
    if (!j || j.status === "done") return false;
  }
  return dayKeyIn(v.start) >= addDays(todayKey(undefined, now), -14);
}

/** the people of what a call or a message is about: a client's, a lead's, or a job's client's */
export function peopleOfSubject(db: DB, type: Activity["subjectType"], id: string): Person[] {
  if (type === "customer") {
    const c = db.customers.find((x) => x.id === id);
    return c ? peopleOf(c) : [];
  }
  if (type === "lead") {
    const l = db.leads.find((x) => x.id === id);
    return l ? peopleForLead(db, l) : [];
  }
  if (type === "job") {
    const j = db.jobs.find((x) => x.id === id);
    const cid = j?.customerId ?? db.properties.find((p) => p.id === j?.propertyId)?.customerId;
    const c = cid ? db.customers.find((x) => x.id === cid) : undefined;
    return c ? peopleOf(c) : [];
  }
  return [];
}

export interface CallPlace {
  subjectType: CallInput["subjectType"];
  subjectId: string;
  label: string;
}
/**
 * What a call may be written to, for this role (RLS activities_insert): the office — leads and clients;
 * the technician — the jobs of his visits and his own leads, never a client (20 §8).
 */
export function callPlaces(db: DB, role: Role, query = ""): CallPlace[] {
  const out: CallPlace[] = [];
  if (role === "tech") {
    const mine = techScope(db);
    for (const j of db.jobs) if (mine.jobs.has(j.id)) out.push({ subjectType: "job", subjectId: j.id, label: subject(db, { subjectType: "job", subjectId: j.id } as Activity).who });
    for (const l of db.leads) if (mine.leads.has(l.id)) out.push({ subjectType: "lead", subjectId: l.id, label: l.name });
  } else {
    for (const l of db.leads) if (!l.customerId) out.push({ subjectType: "lead", subjectId: l.id, label: l.name });
    for (const c of db.customers) out.push({ subjectType: "customer", subjectId: c.id, label: c.name });
  }
  const q = query.trim().toLowerCase();
  return out.filter((x) => x.label && (!q || x.label.toLowerCase().includes(q)));
}

/**
 * «Позвонить» on a client: where the call is written. The office — the client itself; the technician cannot write on a
 * client (RLS), so on the one job of his visits at this client, or he picks (undefined = ask «к чему»).
 */
export function callPlaceForClient(db: DB, role: Role, customerId: string): Pick<CallPlace, "subjectType" | "subjectId"> | undefined {
  if (role !== "tech") return { subjectType: "customer", subjectId: customerId };
  const mine = techScope(db);
  const jobs = db.jobs.filter((j) => mine.jobs.has(j.id) && (j.customerId ?? db.properties.find((p) => p.id === j.propertyId)?.customerId) === customerId);
  return jobs.length === 1 ? { subjectType: "job", subjectId: jobs[0]!.id } : undefined;
}

/** a call can be saved: something to tie it to and an outcome (the server counts a call without one as answered) */
export const callReady = (c: Partial<CallInput>): c is CallInput => !!c.subjectType && !!c.subjectId && !!c.outcome && CALL_OUTCOMES.includes(c.outcome);
