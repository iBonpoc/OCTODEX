/** Which queued op may go while an earlier one is held (docs/specs/23 §3; review #259 Б1, Б2). */
import { describe, expect, it } from "vitest";
import type { Op } from "../src/cloud/ops";
import { createdBy, createdOf, dependentsOf, isMoneyOp, liveOf, madeOnQueue, mayPass, nextToSend, refsOf, SELF_KINDS, uuidsOf, waitingFor } from "../src/data/outboxDeps";
import { MONEY_KINDS } from "../src/data/syncLink";
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
    expect([...refsOf(op)].sort()).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10].map(u));
  });
  it("a lead's columns refer the same way: source, category, catalog item, assignee", () => {
    const op = { k: "lead.update", id: u(1), cols: { source_id: u(2), service_category_id: u(3), service_item_id: u(4), assigned_to: u(5) } };
    expect([...uuidsOf(op)]).toEqual([u(1)]);
    expect([...refsOf(op)].sort()).toEqual([u(2), u(3), u(4), u(5)]);
  });
  it("a source's own id is its object: source.save is about the source (review #259 Б1-бис)", () => {
    expect([...uuidsOf({ k: "source.save", source: { id: u(1), name: "Yelp", kind: "online", active: true } })]).toEqual([u(1)]);
  });
  it("exactly these kinds may pass a held op (a new kind here must be reviewed: lead.update, estimate.save, jobLine.save, visit.pay may not)", () => {
    expect([...SELF_KINDS].sort()).toEqual(
      ["activity.call", "activity.message", "calendarEvent.remove", "calendarEvent.save", "customer.create", "lead.add", "note.add", "task.save"].sort(),
    );
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

describe("unit:outboxDeps — an op waits for the held op that makes what it refers to (review #259 Б1-бис, п.1)", () => {
  const src = (id: number) => ({ k: "source.save", source: { id: u(id), name: "Yelp", kind: "online", active: true } });
  it("a new source held: the new lead with it waits (else 23503 leads.source_id → lost); a lead with another source goes", () => {
    const S = item(src(90));
    const L = item(lead(1, 90));
    const other = item(lead(2, 91));
    expect(ids(liveOf([S, L, other], me, heldIs(S)))).toEqual([other.id]);
  });
  it("the same for a new client with the new source, and a note on the waiting lead", () => {
    const S = item(src(90));
    const C = item({ k: "customer.create", customerId: u(1), contactId: u(2), propertyId: u(3), name: "A", phone: "1", sourceId: u(90), address: "a", city: "LA" });
    const N = item({ k: "note.add", id: u(4), subjectType: "customer", subjectId: u(1), body: "b", visibility: "team" });
    expect(ids(liveOf([S, C, N], me, heldIs(S)))).toEqual([]);
  });
  it("two leads with the same source are still not related", () => {
    const A = item(lead(1, 90));
    const B = item(lead(2, 90));
    expect(ids(liveOf([A, B], me, heldIs(A)))).toEqual([B.id]);
  });
});

describe("unit:outboxDeps — what an op makes on the server", () => {
  it("creators: their new objects; an upsert with isNew only when new; a change makes nothing", () => {
    const set = (op: object) => [...createdBy(op as Op)].sort();
    expect(set({ k: "customer.create", customerId: u(1), contactId: u(2), propertyId: u(3), sourceId: u(9) })).toEqual([u(1), u(2), u(3)]);
    expect(set({ k: "job.create", id: u(4), customerId: u(1), propertyId: u(3), serviceCategoryId: u(8) })).toEqual([u(4)]);
    expect(set({ k: "serviceCategory.save", category: { id: u(5) }, isNew: true })).toEqual([u(5)]);
    expect(set({ k: "serviceCategory.save", category: { id: u(5) }, isNew: false })).toEqual([]);
    expect(set({ k: "jobType.save", jobType: { id: u(6) }, isNew: false })).toEqual([]);
    expect(set({ k: "lead.convert", leadId: u(1), needCustomer: false, customerId: u(2), contactId: u(3), propertyId: u(4), noteId: u(5) })).toEqual([u(5)]);
    expect(set({ k: "customer.update", id: u(1), name: "B" })).toEqual([]);
    expect(set({ k: "lead.update", id: u(1), cols: {} })).toEqual([]);
    expect(set({ k: "some.newer.kind", id: u(1) })).toEqual([]);
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
  it("a new client discarded: its job, the job's invoice and the invoice's payment leave; another client's stay", () => {
    const C = item({ k: "customer.create", customerId: u(1), contactId: u(2), propertyId: u(3), name: "A", phone: "1", sourceId: u(90), address: "a", city: "LA" });
    const J = item({ k: "job.create", id: u(4), customerId: u(1), propertyId: u(3), title: "T", description: null, jobTypeId: null, serviceCategoryId: null });
    const I = item({ k: "invoice.issue", id: u(5), jobId: u(4), customerId: u(1), kind: "final", title: "F", totalCents: 100 });
    const P = item({ k: "payment.record", id: u(6), invoiceId: u(5), customerId: u(1), amountCents: 100, method: "cash" });
    const P2 = item({ k: "payment.record", id: u(7), invoiceId: u(20), customerId: u(1), amountCents: 100, method: "cash" }); // on its customer only
    const other = item({ k: "job.create", id: u(8), customerId: u(21), propertyId: u(22), title: "T", description: null, jobTypeId: null, serviceCategoryId: null });
    expect(ids(dependentsOf([C, J, I, P, P2, other], me, C.id))).toEqual([J.id, I.id, P.id, P2.id]);
  });
  it("a change of a client discarded: nothing leaves with it — the client is on the server (review #259 п.2)", () => {
    const X = item({ k: "customer.update", id: u(1), name: "B" });
    const J = item({ k: "job.create", id: u(4), customerId: u(1), propertyId: u(3), title: "T", description: null, jobTypeId: null, serviceCategoryId: null });
    const I = item({ k: "invoice.issue", id: u(5), jobId: u(4), customerId: u(1), kind: "final", title: "F", totalCents: 100 });
    const P = item({ k: "payment.record", id: u(6), invoiceId: u(5), customerId: u(1), amountCents: 100, method: "cash" });
    const xs = [X, J, I, P];
    expect(dependentsOf(xs, me, X.id)).toEqual([]);
    // but they wait for it while it is held: same client
    expect(waitingFor(xs, me, X.id)).toBe(3);
  });
  it("a new category / type / catalog item / source discarded: the jobs, lines and leads with it leave (review #259 п.1, Б1-бис)", () => {
    const cat = item({ k: "serviceCategory.save", category: { id: u(30), name: "Gutters" }, isNew: true });
    const type = item({ k: "jobType.save", jobType: { id: u(31), name: "Repair" }, isNew: true });
    const cItem = item({ k: "catalog.save", item: { id: u(32), name: "Elbow" } });
    const src = item({ k: "source.save", source: { id: u(33), name: "Yelp", kind: "online", active: true } });
    const J = item({ k: "job.create", id: u(4), customerId: u(1), propertyId: u(3), title: "T", description: null, jobTypeId: u(31), serviceCategoryId: u(30) });
    const line = item({ k: "jobLine.save", line: { id: u(5), jobId: u(40), catalogItemId: u(32), name: "Elbow" }, isNew: true });
    const L = item({ k: "lead.add", id: u(6), name: "A", phone: "1", city: "LA", sourceId: u(33), message: "", cols: { service_category_id: u(30) } });
    const xs = [cat, type, cItem, src, J, line, L];
    expect(ids(dependentsOf(xs, me, cat.id))).toEqual([J.id, L.id]);
    expect(ids(dependentsOf(xs, me, type.id))).toEqual([J.id]);
    expect(ids(dependentsOf(xs, me, cItem.id))).toEqual([line.id]);
    expect(ids(dependentsOf(xs, me, src.id))).toEqual([L.id]);
    // the chain goes only through what the dependents MAKE: a job of an existing client leaves, the client's change stays
    const jobK = item({ k: "job.create", id: u(50), customerId: u(51), propertyId: u(52), title: "T", description: null, jobTypeId: null, serviceCategoryId: u(30) });
    const editK = item({ k: "customer.update", id: u(51), name: "K" });
    const lineJ = item({ k: "jobLine.save", line: { id: u(53), jobId: u(50), name: "x" }, isNew: true });
    expect(ids(dependentsOf([cat, jobK, editK, lineJ], me, cat.id))).toEqual([jobK.id, lineJ.id]);
    // a renamed category (not new): the jobs with it stay
    const ren = item({ k: "serviceCategory.save", category: { id: u(30), name: "Gutter" }, isNew: false });
    expect(dependentsOf([ren, J], me, ren.id)).toEqual([]);
  });
  it("how many wait and how many leave are told apart: behind a stuck op everything waits, only what needs it leaves", () => {
    const X = item({ k: "contact.save", contact: { id: u(1), name: "A" } });
    const W = item({ k: "company.save", company: { name: "Acme" }, einChanged: false }); // waits: not its own kind
    const D = item({ k: "contact.remove", id: u(1) }); // needs the contact
    const F = item(lead(5)); // its own: goes past
    const xs = [X, W, D, F];
    expect(waitingFor(xs, me, X.id)).toBe(2);
    expect(ids(dependentsOf(xs, me, X.id))).toEqual([D.id]);
    expect(waitingFor(xs, me, "nope")).toBe(0);
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

describe("unit:outboxDeps — what an upsert makes is decided when it is queued (review #259 круг 3, п.2, п.4)", () => {
  const before = {
    estimates: [{ id: u(1), versions: [{ id: u(2) }] }],
    tags: [{ id: u(3), name: "VIP" }],
    customers: [{ id: u(4), people: [{ id: u(5), name: "Ann" }] }],
  };
  it("an upsert without a flag makes by its kind what it writes (estimate.save, tag.save)", () => {
    expect([...createdBy({ k: "estimate.save", id: u(1), versionId: u(6) } as unknown as Op)].sort()).toEqual([u(1), u(6)]);
    expect([...createdBy({ k: "tag.save", tag: { id: u(7), name: "New" } } as unknown as Op)]).toEqual([u(7)]);
  });
  it("on the queue: only what was not on the phone — but an estimate's save always «makes» the estimate (круг 4, Б1)", () => {
    expect(madeOnQueue({ k: "estimate.save", id: u(1), versionId: u(6) } as unknown as Op, before)?.sort()).toEqual([u(1), u(6)]);
    expect(madeOnQueue({ k: "estimate.save", id: u(1), versionId: u(2) } as unknown as Op, before)).toEqual([u(1)]); // same version
    expect(madeOnQueue({ k: "estimate.save", id: u(8), versionId: u(9) } as unknown as Op, before)?.sort()).toEqual([u(8), u(9)]);
    expect(madeOnQueue({ k: "tag.save", tag: { id: u(3), name: "VIP!" } } as unknown as Op, before)).toEqual([]);
    expect(madeOnQueue({ k: "tag.save", tag: { id: u(7), name: "New" } } as unknown as Op, before)).toEqual([u(7)]);
    // a client's people: only the new one (a call to Ann, already on the server, stays when the list is discarded)
    expect(madeOnQueue({ k: "customer.people", id: u(4), people: [{ id: u(5) }, { id: u(10) }] } as unknown as Op, before)).toEqual([u(10)]);
    // the company's contacts and licenses live in db.company (an object): an edit of an existing one makes nothing (круг 4, п.1)
    const withCompany = { ...before, company: { contacts: [{ id: u(17) }], licenses: [{ id: u(18) }] } };
    expect(madeOnQueue({ k: "contact.save", contact: { id: u(17), name: "Office" } } as unknown as Op, withCompany)).toEqual([]);
    expect(madeOnQueue({ k: "license.save", license: { id: u(18), number: "1" } } as unknown as Op, withCompany)).toEqual([]);
    expect(madeOnQueue({ k: "contact.save", contact: { id: u(19), name: "New" } } as unknown as Op, withCompany)).toEqual([u(19)]);
    // kinds that tell by themselves: by their kind
    expect(madeOnQueue({ k: "lead.add", id: u(11) } as unknown as Op, before)).toBeUndefined();
  });
  it("an edit of an existing estimate discarded: its send, the client's approval with its deposit invoice and the payment leave with it — money (круг 4, Б1)", () => {
    const E = item({ k: "estimate.save", id: u(1), versionId: u(6), customerId: u(4), propertyId: u(12), title: "T" }, { made: [u(1), u(6)] });
    const send = item({ k: "estimate.send", id: u(1), token: "t" });
    const appr = item({ k: "estimate.approve", id: u(1), token: "t", optionId: u(13), addonIds: [], signer: "A", svg: "", channel: "on_site", jobId: u(14), invoiceId: u(15) });
    const pay = item({ k: "payment.record", id: u(16), invoiceId: u(15), customerId: u(4), amountCents: 100, method: "cash" });
    expect(ids(dependentsOf([E, send, appr, pay], me, E.id))).toEqual([send.id, appr.id, pay.id]);
    expect([E, send, appr, pay].some((o) => isMoneyOp(o, MONEY_KINDS))).toBe(true);
    // another estimate of the same client stays
    const other = item({ k: "estimate.send", id: u(20), token: "t" });
    expect(dependentsOf([E, other], me, E.id)).toEqual([]);
    // an older item without `made`: by its kind — all of them leave (careful: they may need the estimate)
    const old = item({ k: "estimate.save", id: u(1), versionId: u(6), customerId: u(4), propertyId: u(12), title: "T" });
    expect(ids(dependentsOf([old, send, appr, pay], me, old.id))).toEqual([send.id, appr.id, pay.id]);
  });
  it("a new tag discarded: the client's tags with it leave; an existing one renamed: they stay", () => {
    const T = item({ k: "tag.save", tag: { id: u(7), name: "New" } }, { made: [u(7)] });
    const ren = item({ k: "tag.save", tag: { id: u(3), name: "VIP!" } }, { made: [] });
    const tagsOf = (id: number) => item({ k: "customer.tags", id: u(4), tagIds: [u(id)] });
    const a = tagsOf(7);
    expect(ids(dependentsOf([T, a], me, T.id))).toEqual([a.id]);
    expect(dependentsOf([ren, tagsOf(3)], me, ren.id)).toEqual([]);
    expect([...createdOf(ren)]).toEqual([]);
  });
});

describe("unit:outboxDeps — a reference waits only for what the held op makes (review #259 круг 3, п.3)", () => {
  const L = () => item({ k: "lead.add", id: u(2), name: "A", phone: "1", city: "LA", sourceId: u(90), message: "", cols: { service_category_id: u(30) } });
  it("a category renamed (not new) held: the new lead with it goes", () => {
    const ren = item({ k: "serviceCategory.save", category: { id: u(30), name: "Gutter" }, isNew: false });
    const l = L();
    expect(ids(liveOf([ren, l], me, heldIs(ren)))).toEqual([l.id]);
  });
  it("a new category held: the lead with it waits", () => {
    const add = item({ k: "serviceCategory.save", category: { id: u(30), name: "Gutters" }, isNew: true });
    expect(ids(liveOf([add, L()], me, heldIs(add)))).toEqual([]);
  });
});

describe("unit:outboxDeps — money (review #259 круг 3, п.1)", () => {
  it("an op that makes an invoice or a payment is money: the approval, the countersign with its deposit invoice", () => {
    expect(isMoneyOp(item({ k: "estimate.approve", id: u(1), jobId: u(2), invoiceId: u(3) }), MONEY_KINDS)).toBe(true);
    expect(isMoneyOp(item({ k: "estimate.countersign", id: u(1), jobId: u(2), invoiceId: u(3) }), MONEY_KINDS)).toBe(true);
    expect(isMoneyOp(item({ k: "estimate.countersign", id: u(1), svg: "x" }), MONEY_KINDS)).toBe(false);
    expect(isMoneyOp(item({ k: "expense.add", id: u(4), jobId: null }), MONEY_KINDS)).toBe(true);
    expect(isMoneyOp(item({ k: "lead.update", id: u(5), cols: {} }), MONEY_KINDS)).toBe(false);
  });
});

