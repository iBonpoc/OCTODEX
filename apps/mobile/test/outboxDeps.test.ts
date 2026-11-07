/** Which queued op may go while an earlier one is held (docs/specs/23 §3; review #259 Б1, Б2). */
import { describe, expect, it } from "vitest";
import type { Op } from "../src/cloud/ops";
import { dependentsOf, liveOf, mayPass, nextToSend, SELF_KINDS, uuidsOf } from "../src/data/outboxDeps";
import type { OwnedItem } from "../src/data/outboxOwner";
import { classify, isStuck, maybeOpOnly, STUCK_AFTER_MS } from "../src/data/outboxRetry";

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const me = { userId: "u1", companyId: "c1" };
const OLD = new Date(Date.now() - 60_000).toISOString();
let n = 0;
const item = (op: object, extra: Partial<OwnedItem> = {}): OwnedItem => ({ id: `q${++n}`, op: op as Op, at: OLD, tries: 0, owner: me, ...extra });
const ids = (xs: OwnedItem[]) => xs.map((x) => x.id);
const heldIs = (x: OwnedItem) => (o: OwnedItem) => o.id === x.id;
const none = () => false;
const lead = (id: number, src = 90) => ({ k: "lead.add", id: u(id), name: "A", phone: "1", city: "LA", sourceId: u(src), message: "" });

describe("unit:outboxDeps — ids of an op", () => {
  it("the objects' UUIDs at any depth, lowercase; not other strings", () => {
    const op = { k: "x", a: u(1).toUpperCase(), nested: { list: [u(2), { deep: u(3) }], name: "Sarah", demo: "j-demo", n: 5 } };
    expect([...uuidsOf(op)].sort()).toEqual([u(1), u(2), u(3)]);
  });
  it("not what it only refers to: source, tags, people, categories, types, catalog items (Б2)", () => {
    const op = { k: "lead.add", id: u(1), sourceId: u(2), tagIds: [u(3)], techId: u(4), userId: u(5), assigneeIds: [u(6)], serviceCategoryId: u(7), jobTypeId: u(8), task: { assigneeId: u(9), catalogItemId: u(10) } };
    expect([...uuidsOf(op)]).toEqual([u(1)]);
  });
  it("only ops that add something of their own may pass a held one", () => {
    expect(mayPass(lead(1) as Op)).toBe(true);
    expect(mayPass({ k: "calendarEvent.remove", id: "ev-demo" } as Op)).toBe(false); // no id: cannot tell what it touches
    for (const k of ["visit.step", "job.complete", "jobLine.remove", "invoice.issue", "contact.save", "customer.update", "company.save", "estimate.send"])
      expect(SELF_KINDS.has(k as Op["k"])).toBe(false);
  });
});

describe("unit:outboxDeps — every op waits behind a held one (Б1)", () => {
  const pairs: [string, object, object][] = [
    ["a visit's step, then «the job is done» (no shared id; the server refuses «finish the open visits first»)",
      { k: "visit.step", visitId: u(1), step: "done", at: OLD }, { k: "job.complete", id: u(2) }],
    ["a job line removed, then the job's invoice", { k: "jobLine.remove", id: u(3) }, { k: "invoice.issue", id: u(4), jobId: u(5), customerId: u(6), kind: "final", title: "F", totalCents: 1 }],
    ["a job line restored, then the job's tax", { k: "jobLine.restore", id: u(3) }, { k: "job.update", id: u(5), taxEnabled: true }],
    ["contact A, then contact B becomes the primary", { k: "contact.save", contact: { id: u(7), isPrimary: false } }, { k: "contact.save", contact: { id: u(8), isPrimary: true } }],
    ["the company's settings, then an estimate", { k: "company.save", company: { name: "Acme" }, einChanged: false }, { k: "estimate.send", id: u(9) }],
    ["a client changed, then a lead marked lost", { k: "customer.update", id: u(10), name: "B" }, { k: "lead.close", leadId: u(11), status: "lost", reason: "x", activityId: u(12), from: "new" }],
  ];
  for (const [what, x, y] of pairs) {
    it(what, () => {
      const X = item(x);
      const Y = item(y);
      expect(ids(liveOf([X, Y], me, heldIs(X)))).toEqual([]);
    });
  }
  it("a new lead (its own) goes past a held op that shares nothing with it — also with the same source", () => {
    const X = item(lead(1, 90));
    const Y = item(lead(2, 90));
    expect(ids(liveOf([X, Y], me, heldIs(X)))).toEqual([Y.id]);
  });
  it("an own op that is about a held or waiting object waits", () => {
    const X = item({ k: "customer.update", id: u(1), name: "A" });
    const waiting = item({ k: "customer.tags", id: u(2), tagIds: [] }); // waits: not its own kind
    const noteOnX = item({ k: "note.add", id: u(3), subjectType: "customer", subjectId: u(1), body: "b", visibility: "team" });
    const noteOnWaiting = item({ k: "note.add", id: u(4), subjectType: "customer", subjectId: u(2), body: "b", visibility: "team" });
    const free = item({ k: "note.add", id: u(5), subjectType: "customer", subjectId: u(6), body: "b", visibility: "team" });
    expect(ids(liveOf([X, waiting, noteOnX, noteOnWaiting, free], me, heldIs(X)))).toEqual([free.id]);
  });
  it("nothing held: all, in order", () => {
    const xs = [item({ k: "visit.step", visitId: u(1) }), item({ k: "job.complete", id: u(2) })];
    expect(ids(liveOf(xs, me, none))).toEqual(ids(xs));
  });
  it("another person's ops never hold mine (they are never sent by me)", () => {
    const theirs = item({ k: "visit.step", visitId: u(1) }, { owner: { userId: "u2", companyId: "c1" } });
    const mine = item({ k: "visit.step", visitId: u(1) });
    expect(ids(liveOf([theirs, mine], me, (o) => o === theirs))).toEqual([mine.id]);
  });
  it("an old op without an owner counts as mine", () => {
    const old = item(lead(1), { owner: undefined });
    expect(ids(liveOf([old], me, none))).toEqual([old.id]);
  });
});

describe("unit:outboxDeps — the next op and the «Отменить» window", () => {
  it("the first live op that is ready", () => {
    const X = item(lead(1));
    const Y = item(lead(2));
    expect(nextToSend([X, Y], me, heldIs(X), Date.now())?.id).toBe(Y.id);
  });
  it("an op in its «Отменить» window stops the ones after it", () => {
    const X = item(lead(1));
    const fresh = item(lead(2), { at: new Date().toISOString() });
    const later = item(lead(3));
    expect(nextToSend([X, fresh, later], me, heldIs(X), Date.now())).toBeNull();
  });
  it("nobody signed in: nothing", () => {
    expect(nextToSend([item(lead(1))], null, none, Date.now())).toBeNull();
  });
});

describe("unit:outboxDeps — what leaves with a discarded op (Б2)", () => {
  it("only the later ops about its object (and theirs) — not those with the same source, not those just behind it", () => {
    const X = item(lead(1, 90));
    const sameSource = item(lead(2, 90));
    const touchX = item({ k: "lead.update", id: u(1), name: "B" });
    const noteOnX = item({ k: "note.add", id: u(3), subjectType: "lead", subjectId: u(1), body: "b", visibility: "team" });
    const noteEdit = item({ k: "note.update", id: u(3), body: "c" }); // about the note that leaves
    const prefs = item({ k: "me.prefs", prefs: { planShowDone: true } });
    const other = item({ k: "customer.update", id: u(9), name: "C" });
    const xs = [X, sameSource, touchX, noteOnX, noteEdit, prefs, other];
    expect(ids(dependentsOf(xs, me, X.id))).toEqual([touchX.id, noteOnX.id, noteEdit.id]);
  });
  it("nothing before it, nothing of another person", () => {
    const before = item({ k: "lead.update", id: u(1), name: "0" });
    const X = item({ k: "lead.update", id: u(1), name: "1" });
    const theirs = item({ k: "lead.update", id: u(1), name: "2" }, { owner: { userId: "u2", companyId: "c1" } });
    expect(ids(dependentsOf([before, X, theirs], me, X.id))).toEqual([]);
  });
});

describe("unit:outboxRetry — is the error this op's alone; when it is «stuck»", () => {
  const err = (status: number, code = "") => Object.assign(new Error("x"), { status, code });
  it("500 / XX000, 57014, 40001, 40P01: maybe this op only", () => {
    for (const e of [err(500), err(500, "XX000"), err(500, "57014"), err(400, "40001"), err(400, "40P01")]) expect(maybeOpOnly(e)).toBe(true);
  });
  it("the whole server: 503, 429, PGRST002, 401, 08006, 57P01; never the network or a refusal", () => {
    for (const e of [err(503), err(429), err(503, "PGRST002"), err(401, "PGRST301"), err(500, "08006"), err(503, "57P01")]) {
      expect(classify(e)).toBe("transient");
      expect(maybeOpOnly(e)).toBe(false);
    }
    expect(maybeOpOnly(new TypeError("Failed to fetch"))).toBe(false);
    expect(maybeOpOnly(err(403, "42501"))).toBe(false);
  });
  it("stuck: 3 failures over 10 minutes — not one failure after 11 minutes, not 5 failures in 2 minutes", () => {
    const now = Date.now();
    const ago = (ms: number) => new Date(now - ms).toISOString();
    expect(isStuck(ago(STUCK_AFTER_MS), 3, now)).toBe(true);
    expect(isStuck(ago(11 * 60_000), 1, now)).toBe(false);
    expect(isStuck(ago(2 * 60_000), 5, now)).toBe(false);
    expect(isStuck(undefined, 9, now)).toBe(false);
  });
});
