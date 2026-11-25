/** «Задачи» by group (features/tasks/taskGroups.ts, #2350 волна 3 Э7): the company's days, an empty group stays empty. */
import { describe, expect, it } from "vitest";
import type { Task } from "../src/data/types";
import { groupTasks, taskGroupOf } from "../src/features/tasks/taskGroups";

const TZ = "America/Los_Angeles";
// noon of 20 Nov in Los Angeles
const NOW = Date.parse("2026-11-20T20:00:00Z");
const task = (x: Partial<Task>): Task => ({ id: Math.random().toString(36).slice(2), subjectType: "lead", subjectId: "l1", title: "Call", assigneeId: "m1", ...x }) as Task;

describe("taskGroupOf", () => {
  it("overdue, today, tomorrow, later, no date, done", () => {
    expect(taskGroupOf(task({ dueAt: "2026-11-20T17:00:00Z" }), NOW, TZ)).toBe("overdue");
    expect(taskGroupOf(task({ dueAt: "2026-11-21T01:00:00Z" }), NOW, TZ)).toBe("today"); // 17:00 LA, still the 20th
    expect(taskGroupOf(task({ dueAt: "2026-11-21T17:00:00Z" }), NOW, TZ)).toBe("tomorrow");
    expect(taskGroupOf(task({ dueAt: "2026-11-25T17:00:00Z" }), NOW, TZ)).toBe("later");
    expect(taskGroupOf(task({}), NOW, TZ)).toBe("noDate");
    expect(taskGroupOf(task({ dueAt: "2026-11-19T17:00:00Z", doneAt: "2026-11-19T18:00:00Z" }), NOW, TZ)).toBe("done");
  });
});

describe("groupTasks", () => {
  it("soonest first in a group, the latest done first", () => {
    const a = task({ dueAt: "2026-11-25T18:00:00Z" });
    const b = task({ dueAt: "2026-11-24T18:00:00Z" });
    const d1 = task({ doneAt: "2026-11-18T10:00:00Z" });
    const d2 = task({ doneAt: "2026-11-19T10:00:00Z" });
    const g = groupTasks([a, b, d1, d2], NOW, TZ);
    expect(g.later.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(g.done.map((x) => x.id)).toEqual([d2.id, d1.id]);
    expect(g.today).toEqual([]);
  });
});
