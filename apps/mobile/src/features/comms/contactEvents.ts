/**
 * Wave 6-2 (docs/specs/20 §3, §5): what a call (or a lead's SMS / email / reply) changes in the local database, and the
 * op that goes to the server. Pure — the store only wraps them (mutate: local now, the queue, «Отменить»).
 * Unit-tested in test/calls.test.ts.
 */
import type { Op } from "@/cloud/ops";
import type { Activity, CallInput, DB, ID, LeadTouchKind } from "@/data/types";

export type LeadTouch = { kind: LeadTouchKind } | { kind: "call"; call: Omit<CallInput, "subjectType" | "subjectId"> };
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

const metaOf = (c: { outcome: string; durationMin?: number }) => ({ outcome: c.outcome, ...(c.durationMin && c.durationMin > 0 ? { duration_min: String(Math.round(c.durationMin)) } : {}) });

/** a call or a contact on a lead: missed calls count an attempt; anything else is the first answer (S2: new → replied) */
export function leadTouchNext(d: DB, leadId: ID, t: LeadTouch, ids: EventIds): DB {
  const call = t.kind === "call" ? t.call : undefined;
  const missed = !!call && (call.outcome === "no_answer" || call.outcome === "voicemail");
  const l = d.leads.find((x) => x.id === leadId);
  const toReplied = l?.status === "new" && !missed;
  const at = ids.at;
  const contactId = realPersonId(call?.contactId);
  const event: Activity = {
    id: ids.activityId, subjectType: "lead", subjectId: leadId, kind: t.kind, at, actorId: d.me, direction: "out",
    ...(call ? { meta: metaOf(call) } : {}), ...(contactId ? { contactId } : {}), ...(call?.note?.trim() ? { body: call.note.trim() } : {}),
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

export function leadTouchOp(leadId: ID, t: LeadTouch, ids: EventIds): Op {
  const call = t.kind === "call" ? t.call : undefined;
  return {
    k: "lead.touch", activityId: ids.activityId, leadId, kind: t.kind, at: ids.at,
    ...(call ? { outcome: call.outcome, contactId: realPersonId(call.contactId), durationMin: call.durationMin, note: call.note } : {}),
  };
}

/** a call on a lead, a client or a job: the local change */
export function callNext(d: DB, c: CallInput, ids: EventIds): DB {
  const { subjectType, subjectId, ...call } = c;
  if (subjectType === "lead") return leadTouchNext(d, subjectId, { kind: "call", call }, ids);
  const contactId = realPersonId(call.contactId);
  const event: Activity = {
    id: ids.activityId, subjectType, subjectId, kind: "call", at: ids.at, actorId: d.me, direction: "out", meta: metaOf(call),
    ...(contactId ? { contactId } : {}), ...(call.note?.trim() ? { body: call.note.trim() } : {}),
  };
  return { ...d, activities: [event, ...d.activities] };
}

/** …and the op: lead.touch for a lead (the server's S2 trigger), activity.call for a client or a job */
export function callOp(c: CallInput, ids: EventIds): Op {
  const { subjectType, subjectId, ...call } = c;
  if (subjectType === "lead") return leadTouchOp(subjectId, { kind: "call", call }, ids);
  return { k: "activity.call", activityId: ids.activityId, subjectType, subjectId, at: ids.at, ...call, contactId: realPersonId(call.contactId) };
}
