/**
 * The groups of «Задачи» (prototype v2, wireframes-v2 №12, BUILD-SPEC §2.12): «Просрочено · Сегодня · Завтра · Позже · Без срока»
 * instead of the status chips; the done ones are their own group, shown on demand. Days are the company's (П4b), not the phone's.
 * Pure: the zone and «now» are parameters.
 */
import type { Task } from "@/data/types";
import { isoDayKey, dayOffsetOf, todayKey } from "@/features/calendar";
import { taskState, taskWhen } from "./tasks";

export type TaskGroup = "overdue" | "today" | "tomorrow" | "later" | "noDate" | "done";
export const TASK_GROUPS: readonly TaskGroup[] = ["overdue", "today", "tomorrow", "later", "noDate", "done"];

export function taskGroupOf(x: Task, now = Date.now(), tz?: string): TaskGroup {
  const st = taskState(x, now);
  if (st === "done") return "done";
  if (st === "overdue") return "overdue";
  const when = taskWhen(x);
  if (!when) return "noDate";
  const off = dayOffsetOf(isoDayKey(when, tz), todayKey(tz, now));
  // a moment of today that has passed without a due date is still «today» (startsAt in the Plan)
  return off <= 0 ? "today" : off === 1 ? "tomorrow" : "later";
}

/** the tasks by group in their order: soonest first; the done ones — the latest done first */
export function groupTasks(tasks: readonly Task[], now = Date.now(), tz?: string): Record<TaskGroup, Task[]> {
  const out = Object.fromEntries(TASK_GROUPS.map((g) => [g, [] as Task[]])) as Record<TaskGroup, Task[]>;
  for (const x of tasks) out[taskGroupOf(x, now, tz)].push(x);
  const soon = (a: Task, b: Task) => (taskWhen(a) ?? "~").localeCompare(taskWhen(b) ?? "~");
  for (const g of TASK_GROUPS) out[g].sort(g === "done" ? (a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "") : soon);
  return out;
}
