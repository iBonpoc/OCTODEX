/**
 * Wave 6-2 (docs/specs/20 §3, §5): what a call (or a lead's SMS / email / reply) changes in the local database, and the
 * op that goes to the server. Pure — the store only wraps them (mutate: local now, the queue, «Отменить»).
 * Unit-tested in test/calls.test.ts.
 */
import type { Op } from "@/cloud/ops";
import type { Activity, CallInput, DB, ID, LeadTouchKind, MessageInput } from "@/data/types";

/** a contact on a lead; an SMS / email (6-3) may carry its person and its text */
export type LeadTouch = { kind: LeadTouchKind; contactId?: ID; text?: string } | { kind: "call"; call: Omit<CallInput, "subjectType" | "subjectId"> };
export interface EventIds {
  activityId: ID;
  /** the «new → replied» line of a lead (S2) */
  statusId: ID;
  at: string;
}

/**
 * A person the app made up for an old client or lead (`<id>-main`, data/people.ts) is not a row of `contacts`:
 * it never goes to the server as contact_id (the insert would fail and the call would be dropped from the queue).
 */
export const realPersonId = (id: ID | undefined): ID | undefined => (id && !id.endsWith("-main") ? id : undefined);

/**
 * The person an event may name as contact_id (FK to public.contacts): only a row of `contacts` — a person of a client
 * (customer.people) or of a lead (lead.people, wave L2). Never a made-up `<id>-main`, never a `lead_contacts` row
 * (lead.contacts — old extra people of a lead, another table): the insert would fail and the event be dropped (#227 review).
 */
export function contactRowId(d: Pick<DB, "customers" | "leads">, id: ID | undefined): ID | undefined {
  const real = realPersonId(id);
  if (!real) return undefined;
  const known = d.customers.some((c) => c.people?.some((p) => p.id === real)) || d.leads.some((l) => l.people?.some((p) => p.id === real));
  return known ? real : undefined;
}

const metaOf = (c: { outcome: string; durationMin?: number }) => ({ outcome: c.outcome, ...(c.durationMin && c.durationMin > 0 ? { duration_min: String(Math.round(c.durationMin)) } : {}) });

/** a call or a contact on a lead: missed calls count an attempt; anything else is the first answer (S2: new → replied) */
export function leadTouchNext(d: DB, leadId: ID, t: LeadTouch, ids: EventIds): DB {
  const call = t.kind === "call" ? t.call : undefined;
  const missed = !!call && (call.outcome === "no_answer" || call.outcome === "voicemail");
  const l = d.leads.find((x) => x.id === leadId);
  const toReplied = l?.status === "new" && !missed;
  const at = ids.at;
  const contactId = contactRowId(d, call ? call.contactId : t.kind !== "call" ? t.contactId : undefined);
  const body = (call ? call.note : t.kind !== "call" ? t.text : undefined)?.trim();
  const event: Activity = {
    id: ids.activityId, subjectType: "lead", subjectId: leadId, kind: t.kind, at, actorId: d.me, direction: "out",
    ...(call ? { meta: metaOf(call) } : {}), ...(contactId ? { contactId } : {}), ...(body ? { body } : {}),
  };
  return {
    ...d,
    leads: d.leads.map((x) =>
      x.id !== leadId ? x
      : missed ? { ...x, callAttempts: (x.callAttempts ?? 0) + 1, lastOutboundAt: at, lastActivityAt: at }
      : { ...x, firstResponseAt: x.firstResponseAt ?? at, status: toReplied ? "replied" : x.status, callAttempts: 0, lastOutboundAt: at, lastActivityAt: at },
    ),
    activities: [
      event,
      ...(toReplied ? [{ id: ids.statusId, subjectType: "lead" as const, subjectId: leadId, kind: "status" as const, meta: { from: "new", to: "replied" }, at, actorId: d.me }] : []),
      ...d.activities,
    ],
  };
}

export function leadTouchOp(d: Pick<DB, "customers" | "leads">, leadId: ID, t: LeadTouch, ids: EventIds): Op {
  const call = t.kind === "call" ? t.call : undefined;
  return {
    k: "lead.touch", activityId: ids.activityId, leadId, kind: t.kind, at: ids.at,
    ...(call ? { outcome: call.outcome, contactId: contactRowId(d, call.contactId), durationMin: call.durationMin, note: call.note } : {}),
    ...(t.kind !== "call" && (t.contactId || t.text) ? { contactId: contactRowId(d, t.contactId), note: t.text } : {}),
  };
}

/** a call on a lead, a client or a job: the local change */
export function callNext(d: DB, c: CallInput, ids: EventIds): DB {
  const { subjectType, subjectId, ...call } = c;
  if (subjectType === "lead") return leadTouchNext(d, subjectId, { kind: "call", call }, ids);
  const contactId = contactRowId(d, call.contactId);
  const event: Activity = {
    id: ids.activityId, subjectType, subjectId, kind: "call", at: ids.at, actorId: d.me, direction: "out", meta: metaOf(call),
    ...(contactId ? { contactId } : {}), ...(call.note?.trim() ? { body: call.note.trim() } : {}),
  };
  return { ...d, activities: [event, ...d.activities] };
}

/** …and the op: lead.touch for a lead (the server's S2 trigger), activity.call for a client or a job */
export function callOp(d: Pick<DB, "customers" | "leads">, c: CallInput, ids: EventIds): Op {
  const { subjectType, subjectId, ...call } = c;
  if (subjectType === "lead") return leadTouchOp(d, subjectId, { kind: "call", call }, ids);
  return { k: "activity.call", activityId: ids.activityId, subjectType, subjectId, at: ids.at, ...call, contactId: contactRowId(d, call.contactId) };
}

/** an SMS / email (6-3): on a lead — a lead contact (S2 as before); on a client or a job — an event of that kind */
export function messageNext(d: DB, m: MessageInput, ids: EventIds): DB {
  if (m.subjectType === "lead") return leadTouchNext(d, m.subjectId, { kind: m.channel, contactId: m.contactId, text: m.text }, ids);
  const contactId = contactRowId(d, m.contactId);
  const event: Activity = {
    id: ids.activityId, subjectType: m.subjectType, subjectId: m.subjectId, kind: m.channel, at: ids.at, actorId: d.me, direction: "out",
    ...(contactId ? { contactId } : {}), ...(m.text.trim() ? { body: m.text.trim() } : {}),
  };
  return { ...d, activities: [event, ...d.activities] };
}

export function messageOp(d: Pick<DB, "customers" | "leads">, m: MessageInput, ids: EventIds): Op {
  if (m.subjectType === "lead") return leadTouchOp(d, m.subjectId, { kind: m.channel, contactId: m.contactId, text: m.text }, ids);
  return { k: "activity.message", activityId: ids.activityId, subjectType: m.subjectType, subjectId: m.subjectId, at: ids.at, channel: m.channel, text: m.text.trim(), contactId: contactRowId(d, m.contactId) };
}
