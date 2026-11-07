/** «Задачи» (docs/specs/20 §4, §7, §9): states, filters, progress, what a task is tied to, the places a role may tie it to. */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { DB, Task } from "../src/data/types";
import {
  defaultTaskScope, filterTasks, matchTask, taskCounts, taskPlaces, taskProgress, taskState, taskSubject, taskWhen, tasksOf,
} from "../src/features/tasks/tasks";

const NOW = Date.parse("2026-11-06T18:00:00Z");
const at = (h: number) => new Date(NOW + h * 3_600_000).toISOString();
const base: Task = { id: "t", subjectType: "customer", subjectId: "c1", title: "Task" };
function db(tasks: Partial<Task>[]): DB {
  const d = makeSeed();
  return { ...d, tasks: tasks.map((x, i) => ({ ...base, id: `T${i}`, title: `Task ${i}`, ...x })) };
}

describe("tasks: state", () => {
  it("open → overdue when the due date passed → done; done is never overdue", () => {
    expect(taskState({ ...base, dueAt: at(2) }, NOW)).toBe("open");
    expect(taskState({ ...base }, NOW)).toBe("open");
    expect(taskState({ ...base, dueAt: at(-1) }, NOW)).toBe("overdue");
    expect(taskState({ ...base, dueAt: at(-1), doneAt: at(-0.5) }, NOW)).toBe("done");
  });
  it("the moment of a task: its start in the Plan, else its due date", () => {
    expect(taskWhen({ ...base, dueAt: at(5), startsAt: at(1) })).toBe(at(1));
    expect(taskWhen({ ...base, dueAt: at(5) })).toBe(at(5));
    expect(taskWhen(base)).toBeUndefined();
  });
});

describe("tasks: filters and order", () => {
  const d = db([
    { title: "later", dueAt: at(48) },
    { title: "no date" },
    { title: "late", dueAt: at(-3) },
    { title: "soon", dueAt: at(1) },
    { title: "done old", doneAt: at(-10) },
    { title: "done new", doneAt: at(-1) },
  ]);
  it("«Открытые»: overdue first, then the soonest, without a date last", () => {
    expect(filterTasks(d.tasks, "open", NOW).map((x) => x.title)).toEqual(["late", "soon", "later", "no date"]);
  });
  it("«Просроченные» and «Выполненные» (the last done first)", () => {
    expect(filterTasks(d.tasks, "overdue", NOW).map((x) => x.title)).toEqual(["late"]);
    expect(filterTasks(d.tasks, "done", NOW).map((x) => x.title)).toEqual(["done new", "done old"]);
    expect(taskCounts(d.tasks, NOW)).toEqual({ open: 4, overdue: 1, done: 2 });
  });
  it("«Задачи (n) · n% готово»", () => {
    expect(taskProgress(d.tasks)).toEqual({ total: 6, done: 2, pct: 33 });
    expect(taskProgress([])).toEqual({ total: 0, done: 0, pct: 0 });
  });
  it("«Мои» — assigned to me; the technician starts on «Мои», the office on «Все»", () => {
    const m = db([{ assigneeId: "me-x" }, { assigneeId: "other" }, {}]);
    expect(tasksOf({ ...m, me: "me-x" }, "mine").map((x) => x.id)).toEqual(["T0"]);
    expect(tasksOf({ ...m, me: "me-x" }, "all")).toHaveLength(3);
    expect(defaultTaskScope("tech")).toBe("mine");
    expect(defaultTaskScope("dispatcher")).toBe("all");
    expect(defaultTaskScope("director")).toBe("all");
  });
});

describe("tasks: what a task is tied to", () => {
  const d = makeSeed();
  const c = d.customers[0]!;
  const p = d.properties[0]!;
  const j = d.jobs[0]!;
  const l = d.leads[0]!;
  it("each subject has a name and opens its own screen", () => {
    expect(taskSubject(d, { subjectType: "customer", subjectId: c.id })).toEqual({ kind: "customer", label: c.name, href: `/client/${c.id}` });
    expect(taskSubject(d, { subjectType: "lead", subjectId: l.id }).href).toBe(`/lead/${l.id}`);
    expect(taskSubject(d, { subjectType: "job", subjectId: j.id }).href).toBe(`/job/${j.id}`);
    expect(taskSubject(d, { subjectType: "property", subjectId: p.id }).label).toContain(p.address);
  });
  it("a deleted subject: no name, nothing to open", () => {
    expect(taskSubject(d, { subjectType: "customer", subjectId: "gone" })).toEqual({ kind: "customer", label: "", href: undefined });
  });
  it("search: the title, the description and the subject's name", () => {
    const x: Task = { ...base, subjectId: c.id, title: "Call back", description: "about the gate" };
    expect(matchTask(d, x, "call")).toBe(true);
    expect(matchTask(d, x, "GATE")).toBe(true);
    expect(matchTask(d, x, c.name.slice(0, 4))).toBe(true);
    expect(matchTask(d, x, "zzz")).toBe(false);
    expect(matchTask(d, x, "  ")).toBe(true);
  });
});

describe("tasks: where a role may tie a new task (the server's tasks_insert)", () => {
  const d = makeSeed();
  it("the office: clients, leads without a client, jobs, properties", () => {
    const kinds = new Set(taskPlaces(d, "dispatcher").map((x) => x.kind));
    expect([...kinds].sort()).toEqual(["customer", "job", "lead", "property"]);
    expect(taskPlaces(d, "dispatcher").some((x) => x.kind === "lead" && d.leads.find((l) => l.id === x.subjectId)?.customerId)).toBe(false);
  });
  it("the technician: his leads, the jobs and the properties of his visits — never a client (20 §6-4)", () => {
    const me = d.visits.find((v) => v.techId)!.techId!;
    const places = taskPlaces({ ...d, me }, "tech");
    expect(places.every((x) => x.kind === "lead" || x.kind === "property" || x.kind === "job")).toBe(true);
    expect(places.some((x) => x.kind === "property")).toBe(true);
    expect(places.some((x) => x.kind === "job")).toBe(true);
    const other = taskPlaces({ ...d, me: "nobody" }, "tech");
    expect(other.filter((x) => x.kind === "property" || x.kind === "job")).toEqual([]);
  });
  it("the technician's jobs = the server's window: a job of an old visit (20 days) is not offered", () => {
    const v0 = d.visits[0]!;
    const job = (id: string) => ({ ...d.jobs[0]!, id, title: `Job ${id}`, status: "scheduled" as const });
    const visit = (id: string, jobId: string, days: number) => ({ ...v0, id, jobId, techId: "t-me", assigneeIds: ["t-me"], start: new Date(Date.now() + days * 86_400_000).toISOString(), closed: false });
    const w: DB = { ...d, me: "t-me", jobs: [job("j-soon"), job("j-old")], visits: [visit("v-soon", "j-soon", 1), visit("v-old", "j-old", -20)] };
    const jobs = taskPlaces(w, "tech").filter((x) => x.kind === "job").map((x) => x.subjectId);
    expect(jobs).toEqual(["j-soon"]);
  });
  it("search narrows the places", () => {
    const c = d.customers[0]!;
    const found = taskPlaces(d, "director", c.name);
    expect(found.some((x) => x.subjectId === c.id)).toBe(true);
    expect(taskPlaces(d, "director", "zzzz-nothing")).toEqual([]);
  });
});
