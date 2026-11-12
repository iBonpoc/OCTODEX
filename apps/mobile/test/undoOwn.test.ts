/**
 * unit:undoOwn — #1193 п.6 (the director's review of #1244): «Отменить» takes back its own action, not the whole store
 * (prev → next is the action, cur is now) — ALL OR NOTHING: a part of it changed since → nothing (ok: false). «Untouched»
 * is compared by value (the store's copy is normalized again on every render). Test data.
 */
import { describe, expect, it } from "vitest";
import { sameValue, undoOwn } from "../src/data/undoOwn";

const inv = (id: string, x: object = {}) => ({ id, status: "sent", totalCents: 1000, ...x });
const ok = <T,>(r: { ok: true; value: T } | { ok: false }): T => {
  expect(r.ok).toBe(true);
  return (r as { ok: true; value: T }).value;
};

describe("unit:undoOwn", () => {
  it("nothing changed since: as before the action; the action touched nothing: as now", () => {
    const prev = { a: 1 }, next = { a: 2 };
    expect(ok(undoOwn(prev, next, next))).toBe(prev);
    const c2 = { a: 3 };
    expect(ok(undoOwn(prev, prev, c2))).toBe(c2);
  });
  it("«untouched» by value: the same record rebuilt (normalizeDB on every render) is still the action's own", () => {
    const prev = { estimates: [] as { id: string; doc: object }[] };
    const next = { estimates: [{ id: "e1", doc: { options: [{ id: "o", lines: [] }] } }] };
    // the store normalized it again: a new object, the same value
    const cur = { estimates: [{ id: "e1", doc: { options: [{ id: "o", lines: [] }] } }] };
    expect(ok(undoOwn(prev, next, cur))).toEqual({ estimates: [] });
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });
  it("its own field is taken back; another record changed since stays", () => {
    const prev = { invoices: [inv("i1"), inv("i2")] };
    const next = { invoices: [inv("i1", { title: "Mine" }), prev.invoices[1]!] };
    const cur = { invoices: [inv("i1", { title: "Mine" }), inv("i2", { status: "void" })] };
    expect(ok(undoOwn(prev, next, cur))).toEqual({ invoices: [inv("i1"), inv("i2", { status: "void" })] });
    // the same record, another field: the title goes back, the status stays
    const n2 = { invoices: [inv("i1", { title: "Mine" })] };
    expect(ok(undoOwn({ invoices: [inv("i1")] }, n2, { invoices: [inv("i1", { title: "Mine", status: "void" })] }))).toEqual({ invoices: [inv("i1", { status: "void" })] });
  });
  it("a field the action changed and something changed after it (a paid amount): nothing is taken back", () => {
    // payment A $1 → paidCents 100; payment B the rest → 184000; «Отменить» A
    const prev = { invoices: [inv("i", { paidCents: 0 })], payments: [] as object[] };
    const next = { invoices: [inv("i", { paidCents: 100 })], payments: [{ id: "A", amountCents: 100 }] };
    const cur = { invoices: [inv("i", { paidCents: 184000, method: "check" })], payments: [{ id: "A", amountCents: 100 }, { id: "B", amountCents: 183900 }] };
    expect(undoOwn(prev, next, cur)).toEqual({ ok: false });
  });
  it("what the action added goes; others' stays; what it removed comes back at its own place", () => {
    const a = { id: "a" }, b = { id: "b" }, c = { id: "c" };
    const prev = { tasks: [a, b, c] };
    const next = { tasks: [a, c, { id: "mine" }] };
    expect(ok(undoOwn(prev, next, { tasks: [...next.tasks, { id: "theirs" }] })).tasks.map((t) => t.id)).toEqual(["a", "b", "c", "theirs"]);
    const n2 = { tasks: [b, c] };
    expect(ok(undoOwn(prev, n2, { tasks: [b, c] })).tasks.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
  it("its own reorder is taken back (a new array of the same records too); reordered since — nothing", () => {
    const a = { id: "a" }, b = { id: "b" }, c = { id: "c" };
    const prev = { lines: [a, b, c] };
    const next = { lines: [c, a, b] };
    expect(ok(undoOwn(prev, next, { lines: [{ id: "c" }, { id: "a" }, { id: "b" }, { id: "new" }] })).lines.map((t) => t.id)).toEqual(["a", "b", "new", "c"]);
    // (a record someone added after the action keeps its place after the record it followed — here «b»)
    expect(undoOwn(prev, next, { lines: [b, c, a] })).toEqual({ ok: false });
  });
  it("a record the action removed, back again from the server — nothing; one it added and the server numbered — nothing", () => {
    expect(undoOwn({ invoices: [inv("i1")] }, { invoices: [] as object[] }, { invoices: [inv("i1", { status: "void" })] })).toEqual({ ok: false });
    expect(undoOwn({ invoices: [] as object[] }, { invoices: [inv("new")] }, { invoices: [inv("new", { number: "INV-0007" })] })).toEqual({ ok: false });
  });
  it("nested lists by id: a visit's checklist, an estimate's options and lines", () => {
    const line = (id: string, done = false) => ({ id, done });
    const prev = { visits: [{ id: "v", checklist: [line("c1"), line("c2")] }] };
    const next = { visits: [{ id: "v", checklist: [line("c1", true), line("c2")] }] };
    const cur = { visits: [{ id: "v", checklist: [line("c1", true), line("c2", true)] }] };
    expect(ok(undoOwn(prev, next, cur))).toEqual({ visits: [{ id: "v", checklist: [line("c1"), line("c2", true)] }] });
    const doc = (lines: object[]) => ({ id: "e", doc: { options: [{ id: "o1", lines }, { id: "o2", lines: [{ id: "x", q: "1" }] }] } });
    const p2 = { estimates: [doc([{ id: "l1", q: "1" }])] };
    const n2 = { estimates: [doc([{ id: "l1", q: "1" }, { id: "l2", q: "3" }])] };
    const c2 = { estimates: [{ id: "e", doc: { options: [{ id: "o1", lines: [{ id: "l1", q: "1" }, { id: "l2", q: "3" }] }, { id: "o2", lines: [{ id: "x", q: "5" }] }] } }] };
    expect(ok(undoOwn(p2, n2, c2))).toEqual({ estimates: [{ id: "e", doc: { options: [{ id: "o1", lines: [{ id: "l1", q: "1" }] }, { id: "o2", lines: [{ id: "x", q: "5" }] }] } }] });
  });
  it("lists without ids (values) or with a repeated id: whole — its own if unchanged since, else nothing", () => {
    expect(ok(undoOwn({ tagIds: ["a"] }, { tagIds: ["a", "b"] }, { tagIds: ["a", "b"] }))).toEqual({ tagIds: ["a"] });
    expect(undoOwn({ tagIds: ["a"] }, { tagIds: ["a", "b"] }, { tagIds: ["a", "b", "c"] })).toEqual({ ok: false });
    expect(undoOwn({ xs: [{ id: "a" }] }, { xs: [{ id: "a" }, { id: "a" }] }, { xs: [{ id: "a" }, { id: "a" }, { id: "b" }] })).toEqual({ ok: false });
    expect(undoOwn({ note: "x" }, { note: "y" }, { note: "z" })).toEqual({ ok: false });
  });
  it("a key the action added goes; one it removed comes back", () => {
    expect(ok(undoOwn({ a: 1 } as Record<string, number>, { a: 1, b: 2 }, { a: 1, b: 2, c: 3 }))).toEqual({ a: 1, c: 3 });
    expect(ok(undoOwn({ a: 1, b: 2 } as Record<string, number>, { a: 1 }, { a: 1, c: 3 }))).toEqual({ a: 1, b: 2, c: 3 });
  });
  it("a large store, the big list itself merged: fast; untouched parts keep their references", () => {
    const big = Array.from({ length: 20000 }, (_, i) => ({ id: `c${i}`, name: `Client ${i}` }));
    const prev = { customers: big, jobs: [{ id: "j" }] };
    // the action renamed one client; then the server's copy rebuilt every client (new objects, the same values) and a job
    const next = { ...prev, customers: big.map((c, i) => (i === 10 ? { ...c, name: "Mine" } : c)) };
    // (another phone added a client too, so the big list itself is merged record by record)
    const cur = { customers: [...next.customers.map((c) => ({ ...c })), { id: "c-new", name: "Theirs" }], jobs: [{ id: "j", title: "theirs" }] };
    const t0 = Date.now();
    const out = ok(undoOwn(prev, next, cur));
    expect(Date.now() - t0).toBeLessThan(500);
    expect(out.customers[10]!.name).toBe("Client 10");
    expect(out.customers).toHaveLength(20001);
    expect(out.customers[11]).toBe(cur.customers[11]);
    expect(out.jobs).toBe(cur.jobs);
    const same = { ...cur };
    expect(ok(undoOwn(prev, prev, same))).toBe(same);
  });
});
