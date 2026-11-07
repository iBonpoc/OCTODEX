import type { DB, Role } from "@/data/types";
import { hasSection, type SectionId } from "@/nav/sections";
import type { DictKey } from "@/i18n";
import { buildAttention, type AttentionItem } from "@/features/attention";
import { taskState, taskWhen, tasksOf } from "@/features/tasks/tasks";
import { dayKeyIn, getZone } from "@/features/zone";

/**
 * Counters on the rows of «Ещё» (spec 25, founder 07.11; BOARD debt «счётчики на плитках „Ещё“»).
 * Taken from buildAttention — the same numbers as «Требует внимания» on the home screen, the role's rights already in.
 * Zero → no counter. Only «Счета · просрочено» is a status (bad, icon + word); the rest are quiet text.
 */
export interface MoreCount {
  n: number;
  label: DictKey;
  /** a status chip (bad) instead of quiet text */
  bad?: boolean;
}

const LEAD_KINDS = new Set<AttentionItem["kind"]>(["lead", "leadBack", "leadNoStep", "leadIdle", "leadOrphan"]);

export function moreCounts(db: DB, role: Role, now: number = Date.now(), tz: string = getZone()): Partial<Record<SectionId, MoreCount>> {
  const att = buildAttention(db, role, now);
  const kinds = (pass: (k: AttentionItem["kind"]) => boolean) => att.filter((a) => pass(a.kind)).length;
  const today = dayKeyIn(now, tz);
  // my tasks for today: overdue or due / starting today (not done)
  const tasks = tasksOf(db, "mine").filter((x) => {
    const st = taskState(x, now);
    if (st === "done") return false;
    if (st === "overdue") return true;
    const w = taskWhen(x);
    return !!w && dayKeyIn(w, tz) <= today;
  }).length;
  const out: Partial<Record<SectionId, MoreCount>> = {
    leads: { n: kinds((k) => LEAD_KINDS.has(k)), label: "fix.more.leads" },
    tasks: { n: tasks, label: "fix.more.tasks" },
    jobs: { n: kinds((k) => k === "schedule" || k === "jobDone"), label: "fix.more.jobs" },
    estimates: { n: kinds((k) => k === "estimateSign"), label: "fix.more.estimates" },
    invoices: { n: kinds((k) => k === "overdue"), label: "fix.more.invoices", bad: true },
  };
  // zero → no counter; a section the role does not have → no counter either (buildAttention lists every invoice)
  for (const k of Object.keys(out) as SectionId[]) if (!out[k]!.n || !hasSection(role, k)) delete out[k];
  return out;
}
