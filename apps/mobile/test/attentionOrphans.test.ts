/**
 * unit:attentionOrphans — docs/specs/22 §2, story map S22c. A lead or a task of a person who is not at work any more
 * (deleted their account or switched off) goes to the office in «Требует внимания»: one card per lead (it replaces the
 * card of the turn; a new lead keeps «Ответить»), one card per task, opening the task's subject. Before: nothing.
 */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { DB, Lead, Member, Task } from "../src/data/types";
import { attentionHref, buildAttention } from "../src/features/attention";
import { subjectOf } from "../src/features/attentionPeople";
import { goneId, isGone } from "../src/features/team";

const NOW = Date.parse("2026-11-07T19:00:00Z");
const GONE: Member = { id: "m-gone", name: "", initials: "—", kind: "employee", roles: ["sales"], pending: true, deleted: true };
const OFF: Member = { id: "m-off", name: "Olga", initials: "O", kind: "employee", roles: ["sales"], pending: true, disabled: true };
const INVITED: Member = { id: "m-inv", name: "Ivo", initials: "I", kind: "employee", roles: ["sales"], pending: true };

function db0(): DB {
  const db = makeSeed() as DB;
  db.members = [...db.members, GONE, OFF, INVITED];
  return db;
}
/** an open lead the office already talked to (not «reply»): its turn is «no step» or «wait» */
function quietLead(db: DB, id: string, assigneeId: string, extra: Partial<Lead> = {}): Lead {
  const base = db.leads[0]!;
  const l: Lead = { ...base, id, name: `L ${id}`, status: "replied", assigneeId, customerId: undefined, receivedAt: "2026-11-01T17:00:00Z",
    firstResponseAt: "2026-11-01T17:05:00Z", lastInboundAt: undefined, lastOutboundAt: "2026-11-01T17:05:00Z", snoozedUntil: undefined, archivedAt: undefined, ...extra };
  db.leads = [...db.leads, l];
  return l;
}
const of = (db: DB, role: Parameters<typeof buildAttention>[1] = "director") => buildAttention(db, role, NOW);
const forLead = (db: DB, id: string, role?: Parameters<typeof buildAttention>[1]) => of(db, role).filter((x) => x.refId === id);

describe("unit:attentionOrphans — who is «not at work»", () => {
  it("deleted or switched off; invited, at work and unknown ids are not", () => {
    const db = db0();
    expect(isGone(GONE) && isGone(OFF)).toBe(true);
    expect(isGone(INVITED)).toBe(false);
    expect(isGone(db.members.find((m) => m.id === db.me))).toBe(false);
    expect(goneId(db, "m-gone") && goneId(db, "m-off")).toBe(true);
    expect(goneId(db, "nobody") || goneId(db, undefined) || goneId(db, "m-inv")).toBe(false);
  });
});

describe("unit:attentionOrphans — leads", () => {
  it("a lead of a deleted or switched-off person: one «без ответственного» card instead of the turn card", () => {
    const db = db0();
    quietLead(db, "lg", "m-gone");
    quietLead(db, "lo", "m-off");
    for (const id of ["lg", "lo"]) {
      const items = forLead(db, id);
      expect(items.map((x) => x.kind)).toEqual(["leadOrphan"]);
      expect(items[0]!.chip).toBe("fr7.noOwnerChip");
      expect(attentionHref(items[0]!)).toBe(`/lead/${id}`);
    }
  });
  it("a new lead of a gone person keeps «Ответить» (anyone in the office answers), the words say nobody owns it", () => {
    const db = db0();
    quietLead(db, "ln", "m-gone", { status: "new", firstResponseAt: undefined, lastOutboundAt: undefined, receivedAt: "2026-11-07T18:50:00Z" });
    const items = forLead(db, "ln");
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("lead");
    expect(items[0]!.label).toBe("fr7.leadReplyOrphan");
  });
  it("not for an invited person, a snoozed or archived lead, or a closed one", () => {
    const db = db0();
    quietLead(db, "li", "m-inv");
    quietLead(db, "ls", "m-gone", { snoozedUntil: "2026-11-20T17:00:00Z" });
    quietLead(db, "la", "m-gone", { archivedAt: "2026-11-05T17:00:00Z" });
    quietLead(db, "lw", "m-gone", { status: "won" });
    const all = of(db);
    expect(all.some((x) => x.kind === "leadOrphan")).toBe(false);
  });
  it("switched on again: the card is gone", () => {
    const db = db0();
    quietLead(db, "lo", "m-off");
    db.members = db.members.map((m) => (m.id === "m-off" ? { ...m, pending: false, disabled: false } : m));
    expect(forLead(db, "lo").some((x) => x.kind === "leadOrphan")).toBe(false);
  });
  it("sales sees it too (works leads, may reassign); a tech does not", () => {
    const db = db0();
    quietLead(db, "lg", "m-gone");
    expect(forLead(db, "lg", "sales").map((x) => x.kind)).toEqual(["leadOrphan"]);
    expect(forLead(db, "lg", "dispatcher").map((x) => x.kind)).toEqual(["leadOrphan"]);
    expect(of(db, "tech").some((x) => x.kind === "leadOrphan")).toBe(false);
  });
});

describe("unit:attentionOrphans — tasks", () => {
  const task = (db: DB, x: Partial<Task> & Pick<Task, "id" | "subjectType" | "subjectId">): void => {
    db.tasks = [...db.tasks, { title: `T ${x.id}`, assigneeId: "m-gone", ...x }];
  };
  it("an open task of a gone person: its own card, it opens the subject — never the general list", () => {
    const db = db0();
    const c = db.customers[0]!;
    const p = db.properties.find((x) => x.customerId === c.id)!;
    const j = db.jobs[0]!;
    const e = db.estimates[0]!;
    const l = db.leads[0]!;
    task(db, { id: "t1", subjectType: "customer", subjectId: c.id });
    task(db, { id: "t2", subjectType: "property", subjectId: p.id, dueAt: "2026-11-01T17:00:00Z" });
    task(db, { id: "t3", subjectType: "job", subjectId: j.id });
    task(db, { id: "t4", subjectType: "estimate", subjectId: e.id });
    task(db, { id: "t5", subjectType: "lead", subjectId: l.id, assigneeId: "m-off" });
    const items = of(db).filter((x) => x.kind === "taskOrphan");
    const href = Object.fromEntries(items.map((x) => [x.id, attentionHref(x)]));
    expect(href).toEqual({ "torph-t1": `/client/${c.id}`, "torph-t2": `/property/${p.id}`, "torph-t3": `/job/${j.id}`, "torph-t4": `/estimate/${e.id}`, "torph-t5": `/lead/${l.id}` });
    // overdue first
    expect(items.find((x) => x.id === "torph-t2")!.score).toBeGreaterThan(items.find((x) => x.id === "torph-t1")!.score);
    // on «Сегодня» the task is a reason of the client's card, not a card of its own
    expect(subjectOf(db, items.find((x) => x.id === "torph-t1")!)).toEqual({ customerId: c.id });
    expect(subjectOf(db, items.find((x) => x.id === "torph-t2")!)).toEqual({ customerId: c.id });
  });
  it("not for a done task, a task of someone at work or invited, nor for a tech", () => {
    const db = db0();
    const c = db.customers[0]!;
    task(db, { id: "d", subjectType: "customer", subjectId: c.id, doneAt: "2026-11-06T17:00:00Z" });
    task(db, { id: "w", subjectType: "customer", subjectId: c.id, assigneeId: db.me });
    task(db, { id: "i", subjectType: "customer", subjectId: c.id, assigneeId: "m-inv" });
    expect(of(db).some((x) => x.kind === "taskOrphan")).toBe(false);
    task(db, { id: "g", subjectType: "customer", subjectId: c.id });
    expect(of(db, "tech").some((x) => x.kind === "taskOrphan")).toBe(false);
    expect(of(db, "sales").filter((x) => x.kind === "taskOrphan")).toHaveLength(1);
  });
});
