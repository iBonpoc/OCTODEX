/** Which queued op may go while an earlier one is held (docs/specs/23 §3). */
import { describe, expect, it } from "vitest";
import type { Op } from "../src/cloud/ops";
import { BARRIER_KINDS, dependentsOf, isBarrier, liveOf, nextToSend, uuidsOf } from "../src/data/outboxDeps";
import type { OwnedItem } from "../src/data/outboxOwner";
import { classify, isStuck, maybeOpOnly, STUCK_AFTER_MS } from "../src/data/outboxRetry";

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const me = { userId: "u1", companyId: "c1" };
const OLD = new Date(Date.now() - 60_000).toISOString();
let n = 0;
const item = (op: Op, extra: Partial<OwnedItem> = {}): OwnedItem => ({ id: `q${++n}`, op, at: OLD, tries: 0, owner: me, ...extra });
const cust = (id: number, name = "A") => ({ k: "customer.update", id: u(id), name }) as Op;
const note = (subj: number) => ({ k: "calendarEvent.remove", id: u(subj) }) as Op;
const ids = (xs: OwnedItem[]) => xs.map((x) => x.id);
const none = () => false;

describe("unit:outboxDeps — ids of an op", () => {
  it("every UUID at any depth, lowercase; other strings are not ids", () => {
    const op = { k: "x", a: u(1).toUpperCase(), nested: { list: [u(2), { deep: u(3) }], name: "Sarah", demo: "j-demo", n: 5 } } as unknown as Op;
    expect([...uuidsOf(op)].sort()).toEqual([u(1), u(2), u(3)]);
  });
  it("a barrier: no UUID at all, or a company-wide kind", () => {
    expect(isBarrier({ k: "calendarEvent.remove", id: "ev-demo" } as Op)).toBe(true);
    expect(isBarrier({ k: "company.save", company: { id: u(1) } } as unknown as Op)).toBe(true);
    expect(isBarrier(cust(1))).toBe(false);
    expect(BARRIER_KINDS.has("visit.cancel")).toBe(true);
  });
});

describe("unit:outboxDeps — what goes while an op is held", () => {
  it("nothing held: all, in order", () => {
    const xs = [item(cust(1)), item(cust(2)), item(cust(3))];
    expect(ids(liveOf(xs, me, none))).toEqual(ids(xs));
  });
  it("X held: an op of another client goes; the same client waits, and so does what shares an id with that one", () => {
    const x = item(cust(1));
    const sameClient = item({ k: "customer.tags", id: u(1), tagIds: [u(9)] } as Op);
    const viaTag = item({ k: "customer.tags", id: u(5), tagIds: [u(9)] } as Op); // shares the tag with the waiting one
    const other = item(cust(2));
    const xs = [x, sameClient, viaTag, other];
    expect(ids(liveOf(xs, me, (o) => o.id === x.id))).toEqual([other.id]);
  });
  it("a barrier after a held op does not go, and nothing after it goes", () => {
    const x = item(cust(1));
    const barrier = item({ k: "company.save", company: {} } as unknown as Op);
    const after = item(cust(2));
    expect(ids(liveOf([x, barrier, after], me, (o) => o.id === x.id))).toEqual([]);
  });
  it("an op with no UUID is a barrier too", () => {
    const x = item(cust(1));
    const noIds = item({ k: "calendarEvent.remove", id: "ev-demo" } as Op);
    const after = item(cust(2));
    expect(ids(liveOf([x, noIds, after], me, (o) => o.id === x.id))).toEqual([]);
  });
  it("a held barrier stops everything after it", () => {
    const barrier = item({ k: "source.save", source: { id: u(7) } } as unknown as Op);
    const after = item(cust(2));
    expect(ids(liveOf([barrier, after], me, (o) => o.id === barrier.id))).toEqual([]);
  });
  it("a barrier with nothing held before it goes as usual", () => {
    const barrier = item({ k: "company.save", company: {} } as unknown as Op);
    const after = item(cust(2));
    expect(ids(liveOf([barrier, after], me, none))).toEqual([barrier.id, after.id]);
  });
  it("another person's earlier op in the same company holds mine that shares an id — never as a barrier", () => {
    const theirs = item(cust(1), { owner: { userId: "u2", companyId: "c1" } });
    const theirBarrier = item({ k: "company.save", company: {} } as unknown as Op, { owner: { userId: "u2", companyId: "c1" } });
    const mineSame = item(note(1));
    const mineOther = item(cust(2));
    expect(ids(liveOf([theirs, theirBarrier, mineSame, mineOther], me, none))).toEqual([mineOther.id]);
  });
  it("another company's ops hold nothing of mine", () => {
    const theirs = item(cust(1), { owner: { userId: "u1", companyId: "c2" } });
    const mine = item(cust(1));
    expect(ids(liveOf([theirs, mine], me, none))).toEqual([mine.id]);
  });
  it("an old op without an owner counts as mine (as mineOf)", () => {
    const old = item(cust(1), { owner: undefined });
    expect(ids(liveOf([old], me, none))).toEqual([old.id]);
  });
});

describe("unit:outboxDeps — the next op and the «Отменить» window", () => {
  it("the first live op that is ready", () => {
    const x = item(cust(1));
    const y = item(cust(2));
    expect(nextToSend([x, y], me, (o) => o.id === x.id, Date.now())?.id).toBe(y.id);
  });
  it("an op in its «Отменить» window stops the ones after it (they are never sent first)", () => {
    const x = item(cust(1));
    const fresh = item(cust(2), { at: new Date().toISOString() });
    const later = item(cust(3));
    expect(nextToSend([x, fresh, later], me, (o) => o.id === x.id, Date.now())).toBeNull();
  });
  it("nobody signed in: nothing", () => {
    expect(nextToSend([item(cust(1))], null, none, Date.now())).toBeNull();
  });
});

describe("unit:outboxDeps — what waits for an op (discarding it takes them too)", () => {
  it("the ops that wait only because of it, not the free ones, not those held by another person's op", () => {
    const x = item(cust(1));
    const dep = item(note(1));
    const depOfDep = item({ k: "customer.tags", id: u(4), tagIds: [u(1)] } as Op);
    const free = item(cust(2));
    const theirs = item(cust(3), { owner: { userId: "u2", companyId: "c1" } });
    const heldByTheirs = item(note(3));
    const xs = [x, dep, depOfDep, free, theirs, heldByTheirs];
    expect(ids(dependentsOf(xs, me, x.id))).toEqual([dep.id, depOfDep.id]);
  });
  it("a barrier waits for it, and everything after the barrier", () => {
    const x = item(cust(1));
    const barrier = item({ k: "company.save", company: {} } as unknown as Op);
    const after = item(cust(2));
    expect(ids(dependentsOf([x, barrier, after], me, x.id))).toEqual([barrier.id, after.id]);
  });
});

describe("unit:outboxRetry — is the error this op's alone; when it is «stuck»", () => {
  const err = (status: number, code = "") => Object.assign(new Error("x"), { status, code });
  it("500 / XX000, 57014, 40001, 40P01: maybe this op only", () => {
    expect(maybeOpOnly(err(500))).toBe(true);
    expect(maybeOpOnly(err(500, "XX000"))).toBe(true);
    expect(maybeOpOnly(err(500, "57014"))).toBe(true);
    expect(maybeOpOnly(err(400, "40001"))).toBe(true);
    expect(maybeOpOnly(err(400, "40P01"))).toBe(true);
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
