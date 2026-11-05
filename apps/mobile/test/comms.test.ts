/** «Звонки» / «Сообщения», wave 2 (docs/specs/13 §2.1, 13а §3): the log of what the app recorded. */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { Activity, DB } from "../src/data/types";
import { commsLog } from "../src/nav/comms";

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
  it("the technician sees only his own", () => {
    expect(commsLog(db, "tech", "calls").map((c) => c.id)).toEqual(["c1"]);
    expect(commsLog(db, "tech", "messages").map((c) => c.id)).toEqual(["e1"]);
  });
});
