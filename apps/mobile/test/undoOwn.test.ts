/**
 * unit:undoOwn — #1193 п.6: «Отменить» takes back its own action, not the whole store (prev → next is the action, cur is
 * now). Test data.
 */
import { describe, expect, it } from "vitest";
import { undoOwn } from "../src/data/undoOwn";

const inv = (id: string, x: object = {}) => ({ id, status: "sent", totalCents: 1000, ...x });

describe("unit:undoOwn", () => {
  it("nothing changed since: as before the action; the action touched nothing: as now", () => {
    const prev = { a: 1 }, next = { a: 2 }, cur = next;
    expect(undoOwn(prev, next, cur)).toBe(prev);
    const p2 = { a: 1 };
    const c2 = { a: 3 };
    expect(undoOwn(p2, p2, c2)).toBe(c2);
  });
  it("its own field is taken back; another change of the same record stays", () => {
    const prev = { invoices: [inv("i1"), inv("i2")] };
    const next = { invoices: [inv("i1", { title: "Mine" }), prev.invoices[1]!] };
    // after the action: i2 was voided (another action)
    const cur = { invoices: [next.invoices[0]!, inv("i2", { status: "void" })] };
    expect(undoOwn(prev, next, cur)).toEqual({ invoices: [inv("i1"), inv("i2", { status: "void" })] });
    // the same record: the action set its title, someone else then its status — the title goes back, the status stays
    const n2 = { invoices: [inv("i1", { title: "Mine" })] };
    const c2 = { invoices: [{ ...n2.invoices[0]!, status: "void" }] };
    expect(undoOwn({ invoices: [inv("i1")] }, n2, c2)).toEqual({ invoices: [inv("i1", { status: "void" })] });
  });
  it("one field changed by both: the later change stays (a conflict)", () => {
    const prev = { jobs: [{ id: "j", title: "A" }] };
    const next = { jobs: [{ id: "j", title: "B" }] };
    const cur = { jobs: [{ id: "j", title: "C" }] };
    expect(undoOwn(prev, next, cur)).toEqual(cur);
  });
  it("what the action added goes; what others added stays; what the action removed comes back at its own place", () => {
    const prev = { tasks: [{ id: "a" }, { id: "b" }, { id: "c" }] };
    const next = { tasks: [{ id: "a" }, prev.tasks[2]!, { id: "mine" }] }.tasks;
    const n = { tasks: [prev.tasks[0]!, prev.tasks[2]!, { id: "mine" }] };
    void next;
    const cur = { tasks: [...n.tasks, { id: "theirs" }] };
    expect(undoOwn(prev, n, cur).tasks.map((t) => t.id)).toEqual(["a", "b", "c", "theirs"]);
    // the first one removed: back at the start
    const n2 = { tasks: [prev.tasks[1]!, prev.tasks[2]!] };
    expect(undoOwn(prev, n2, { tasks: [...n2.tasks] }).tasks.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
  it("a record the action removed, brought back changed by the server: it stays as the server has it", () => {
    const prev = { invoices: [inv("i1")] };
    const next = { invoices: [] as ReturnType<typeof inv>[] };
    const cur = { invoices: [inv("i1", { status: "void" })] };
    expect(undoOwn(prev, next, cur)).toEqual(cur);
  });
  it("a record the action added and the server then numbered: it stays (no longer only this action's)", () => {
    const prev = { invoices: [] as ReturnType<typeof inv>[] };
    const next = { invoices: [inv("new")] };
    const cur = { invoices: [inv("new", { number: "INV-0007" })] };
    expect(undoOwn(prev, next, cur)).toEqual(cur);
  });
  it("a nested list by id (a visit's checklist lines)", () => {
    const line = (id: string, done = false) => ({ id, done });
    const prev = { visits: [{ id: "v", checklist: [line("c1"), line("c2")] }] };
    const next = { visits: [{ id: "v", checklist: [line("c1", true), prev.visits[0]!.checklist[1]!] }] };
    const cur = { visits: [{ ...next.visits[0]!, checklist: [next.visits[0]!.checklist[0]!, line("c2", true)] }] };
    expect(undoOwn(prev, next, cur)).toEqual({ visits: [{ id: "v", checklist: [line("c1"), line("c2", true)] }] });
  });
  it("lists without ids (values, strings) are whole: the action's own if untouched since, else the later one", () => {
    const prev = { tagIds: ["a"] }, next = { tagIds: ["a", "b"] };
    expect(undoOwn(prev, next, { ...next })).toEqual(prev);
    expect(undoOwn(prev, next, { tagIds: ["a", "b", "c"] })).toEqual({ tagIds: ["a", "b", "c"] });
    expect(undoOwn({ note: "x" }, { note: "y" }, { note: "z" })).toEqual({ note: "z" });
  });
  it("a key the action added goes; one it removed comes back", () => {
    expect(undoOwn({ a: 1 } as Record<string, number>, { a: 1, b: 2 }, { a: 1, b: 2, c: 3 })).toEqual({ a: 1, c: 3 });
    expect(undoOwn({ a: 1, b: 2 } as Record<string, number>, { a: 1 }, { a: 1, c: 3 })).toEqual({ a: 1, b: 2, c: 3 });
  });
  it("a large store: untouched parts keep their references (nothing copied)", () => {
    const big = Array.from({ length: 20000 }, (_, i) => ({ id: `c${i}`, name: `Client ${i}` }));
    const prev = { customers: big, invoices: [inv("i1")], jobs: [{ id: "j" }] };
    const next = { ...prev, invoices: [inv("i1", { title: "Mine" })] };
    const cur = { ...next, jobs: [{ id: "j", title: "theirs" }] };
    const t0 = Date.now();
    const out = undoOwn(prev, next, cur);
    expect(Date.now() - t0).toBeLessThan(200);
    expect(out.customers).toBe(big);
    expect(out.jobs).toBe(cur.jobs);
    expect(out.invoices).toEqual([inv("i1")]);
    // nothing to take back: the same object
    const same = { ...cur };
    expect(undoOwn(prev, prev, same)).toBe(same);
  });
});
