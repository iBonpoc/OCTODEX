/**
 * «Задачи» (docs/specs/13-app-structure.md §3.7, docs/specs/20-tasks-calls-messages.md §7): the list of the company's tasks,
 * its filters, progress and what a task is tied to. Pure (no React) — unit-tested in test/tasks.test.ts.
 */
import type { DB, Role, Task } from "@/data/types";
import type { DictKey } from "@/i18n";
import type { StatusName } from "@octo/design-tokens";
import { isOverdueTask, canSeeLead } from "@/features/leads";
import { techScope, techVisitCounts } from "@/features/comms/comms";

export type TaskState = "open" | "overdue" | "done";
export type TaskFilter = TaskState;
export type TaskScope = "mine" | "all";

export const taskState = (t: Task, now = Date.now()): TaskState => (t.doneAt ? "done" : isOverdueTask(t, now) ? "overdue" : "open");

/** a status is always an icon + a word (rule 2): open — neutral, overdue — bad, done — ok */
export const TASK_STATE: Record<TaskState, { tone: StatusName; label: DictKey }> = {
  open: { tone: "neutral", label: "w6.task.state.open" },
  overdue: { tone: "bad", label: "w6.task.state.overdue" },
  done: { tone: "ok", label: "w6.task.state.done" },
};

/** the moment a task is «for»: its start in the Plan, else its due date */
export const taskWhen = (t: Task): string | undefined => t.startsAt ?? t.dueAt;

/** what the task is tied to: a name to show and the screen it opens */
export interface TaskSubject {
  kind: Task["subjectType"];
  label: string;
  href?: string;
}
export const SUBJECT_KIND: Record<Task["subjectType"], DictKey> = {
  customer: "w6.task.kind.customer",
  lead: "w6.task.kind.lead",
  job: "w6.task.kind.job",
  property: "w6.task.kind.property",
  estimate: "w6.task.kind.estimate",
};

export function taskSubject(db: Pick<DB, "customers" | "leads" | "jobs" | "properties" | "estimates">, t: Pick<Task, "subjectType" | "subjectId">): TaskSubject {
  const id = t.subjectId;
  switch (t.subjectType) {
    case "customer": {
      const c = db.customers.find((x) => x.id === id);
      return { kind: "customer", label: c?.name ?? "", href: c ? `/client/${id}` : undefined };
    }
    case "lead": {
      const l = db.leads.find((x) => x.id === id);
      return { kind: "lead", label: l?.name ?? "", href: l ? `/lead/${id}` : undefined };
    }
    case "job": {
      const j = db.jobs.find((x) => x.id === id);
      return { kind: "job", label: j ? j.title || j.number || "" : "", href: j ? `/job/${id}` : undefined };
    }
    case "property": {
      const p = db.properties.find((x) => x.id === id);
      return { kind: "property", label: p ? [p.address, p.city].filter(Boolean).join(", ") : "", href: p ? `/property/${id}` : undefined };
    }
    case "estimate": {
      const e = db.estimates.find((x) => x.id === id);
      return { kind: "estimate", label: e?.number ?? "", href: e ? `/estimate/${id}` : undefined };
    }
  }
}

/**
 * The tasks of a scope: «Мои» = assigned to me; «Все» = what the database gave this person (RLS already limits the
 * technician: his own, his leads and the properties of his visits).
 */
export const tasksOf = (db: Pick<DB, "tasks" | "me">, scope: TaskScope): Task[] => (scope === "mine" ? db.tasks.filter((t) => t.assigneeId === db.me) : db.tasks);

/** «Задачи (n) · n% готово»: done of all in the scope */
export function taskProgress(tasks: readonly Task[]): { total: number; done: number; pct: number } {
  const done = tasks.filter((t) => t.doneAt).length;
  return { total: tasks.length, done, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

/** search: the title, the description and the name of what it is tied to */
export function matchTask(db: Parameters<typeof taskSubject>[0], t: Task, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [t.title, t.description ?? "", taskSubject(db, t).label].some((s) => s.toLowerCase().includes(q));
}

/**
 * One filter → its tasks in order. Open and overdue: soonest first, without a date last. «Открытые» includes the overdue
 * ones (they are open too, shown first); done: the last done first.
 */
export function filterTasks(tasks: readonly Task[], filter: TaskFilter, now = Date.now()): Task[] {
  const when = (t: Task) => taskWhen(t) ?? "￿";
  if (filter === "done") return tasks.filter((t) => t.doneAt).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  const pass = filter === "overdue" ? (t: Task) => taskState(t, now) === "overdue" : (t: Task) => !t.doneAt;
  return tasks
    .filter(pass)
    .sort((a, b) => Number(taskState(b, now) === "overdue") - Number(taskState(a, now) === "overdue") || when(a).localeCompare(when(b)) || a.title.localeCompare(b.title));
}

export const taskCounts = (tasks: readonly Task[], now = Date.now()): Record<TaskFilter, number> => ({
  open: tasks.filter((t) => !t.doneAt).length,
  overdue: tasks.filter((t) => taskState(t, now) === "overdue").length,
  done: tasks.filter((t) => t.doneAt).length,
});

/**
 * Who a task may be for, for this role (S26, docs/specs/23 §5; the server: app.tg_task_who, migration 20261107060000):
 * the office — anyone on the team; the technician — only himself. The task's current assignee stays in the list
 * (an office task he opens shows who it is for; he cannot hand it to anyone else — the server keeps it).
 */
export function taskAssignees(db: DB, role: Role, current?: string | null): DB["members"] {
  const team = db.members.filter((m) => !m.pending);
  if (role !== "tech") return team;
  return team.filter((m) => m.id === db.me || (!!current && m.id === current));
}

/** the default scope (20 §6): the technician starts on his own, the office on all */
export const defaultTaskScope = (role: Role): TaskScope => (role === "tech" ? "mine" : "all");

/**
 * What a new task may be tied to, for this role (the server's tasks_insert): the office — clients, leads, jobs,
 * properties; the technician — his leads, the jobs and the properties of his visits (not a client: 20 §8; his job —
 * 20 §6-4, migration 20261107010000, the same window as his calls on a job: techVisitCounts).
 */
export function taskPlaces(db: DB, role: Role, query = ""): (TaskSubject & { subjectId: string })[] {
  const out: (TaskSubject & { subjectId: string })[] = [];
  const add = (subjectType: Task["subjectType"], subjectId: string) => out.push({ ...taskSubject(db, { subjectType, subjectId }), subjectId });
  if (role === "tech") {
    for (const l of db.leads) if (canSeeLead(role, db.me, l)) add("lead", l.id);
    const jobs = techScope(db).jobs;
    for (const j of db.jobs) if (jobs.has(j.id)) add("job", j.id);
    // the same window as the server (is_property_assignee → tech_visit_counts)
    const props = new Set(db.visits.filter((v) => techVisitCounts(db, v)).map((v) => db.jobs.find((j) => j.id === v.jobId)?.propertyId).filter((x): x is string => !!x));
    for (const p of db.properties) if (props.has(p.id)) add("property", p.id);
  } else {
    for (const c of db.customers) add("customer", c.id);
    for (const l of db.leads) if (!l.customerId) add("lead", l.id);
    for (const j of db.jobs) add("job", j.id);
    for (const p of db.properties) add("property", p.id);
  }
  const q = query.trim().toLowerCase();
  return out.filter((x) => x.label && (!q || x.label.toLowerCase().includes(q)));
}
