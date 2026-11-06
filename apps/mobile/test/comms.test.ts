/** «Звонки» / «Сообщения», wave 2 (docs/specs/13 §2.1, 13а §3): the log of what the app recorded. */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { Activity, DB } from "../src/data/types";
import { commsLog } from "../src/features/comms/comms";

const base = makeSeed();
const other = base.members.find((m) => m.id !== base.me)!.id;
const lead = base.leads[0]!;
const cust = base.customers[0]!;
const act = (id: string, kind: Activity["kind"], actorId: string, at: string, extra: Partial<Activity> = {}): Activity => ({ id, subjectType: "lead", subjectId: lead.id, kind, at, actorId, ...extra });
const db: DB = {
  ...base,
  activities: [
    act("c1", "call", base.me, "2026-11-05T10:00:00Z", { meta: { outcome: "no_answer" } }),
    act("c2", "call", other, "2026-11-05T12:00:00Z", { meta: { outcome: "answered" } }),
    act("s1", "sms", other, "2026-11-05T11:00:00Z", { subjectType: "customer", subjectId: cust.id }),
    act("e1", "email", base.me, "2026-11-05T09:00:00Z"),
    act("st", "status", base.me, "2026-11-05T13:00:00Z"),
  ],
};

describe("comms log", () => {
  it("calls: only calls, newest first, with the outcome and who called", () => {
    const calls = commsLog(db, "director", "calls");
    expect(calls.map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(calls[1]).toMatchObject({ outcome: "no_answer", who: lead.name, href: `/lead/${lead.id}` });
    expect(calls[0]!.by).toBe(db.members.find((m) => m.id === other)!.name);
  });
  it("messages: SMS and email, linked to their client or lead; status lines stay out", () => {
    const msgs = commsLog(db, "dispatcher", "messages");
    expect(msgs.map((m) => m.id)).toEqual(["s1", "e1"]);
    expect(msgs[0]).toMatchObject({ who: cust.name, href: `/client/${cust.id}` });
  });
  it("the technician sees only his own: what he made, and what is about his jobs and their clients", () => {
    expect(commsLog(db, "tech", "calls").map((c) => c.id)).toEqual(["c1"]);
    // s1 is an SMS to a client by someone else: his only if he has a visit at that client
    const hisJob = base.visits.find((v) => v.jobId && (v.techId === base.me || v.assigneeIds?.includes(base.me)))!.jobId!;
    const hisClient = base.properties.find((p) => p.id === base.jobs.find((j) => j.id === hisJob)!.propertyId)!.customerId!;
    const notHis = base.customers.find((c) => !base.jobs.some((j) => base.properties.find((p) => p.id === j.propertyId)?.customerId === c.id && base.visits.some((v) => v.jobId === j.id && (v.techId === base.me || v.assigneeIds?.includes(base.me)))))!;
    const d2: DB = {
      ...db,
      activities: [
        act("x1", "call", other, "2026-11-05T14:00:00Z", { subjectType: "customer", subjectId: hisClient }),
        act("x2", "call", other, "2026-11-05T15:00:00Z", { subjectType: "job", subjectId: hisJob }),
        act("x3", "call", other, "2026-11-05T16:00:00Z", { subjectType: "customer", subjectId: notHis.id }),
        ...db.activities,
      ],
    };
    expect(commsLog(d2, "tech", "calls").map((c) => c.id)).toEqual(["x2", "x1", "c1"]);
    expect(commsLog(d2, "director", "calls").map((c) => c.id)).toContain("x3");
  });
});
