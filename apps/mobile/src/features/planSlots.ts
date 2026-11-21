/**
 * The Plan's day and «Сегодня у бригад» as visual v2 «время и интервал» draws them (docs/design/visual-v2.html; prototype audit 12
 * §2.3). Pure; tested in test/planSlots.test.ts.
 * - plateHalves: «8:30 AM ▸ 12:30 PM», one «PM» when both halves share it («1:30 ▸ 2:30 PM») — the plate fits beside a pill.
 * - nearIndex: the nearest visit of today — the running one or the next not over; its plate takes the accent's tone.
 * - quietStatuses: the wall of «Опаздывает» (4 of 6 rows) is gone — a problem (warn / bad) is a pill on the FIRST such row only, the
 *   others say it as a quiet word in their line; the rest (in work, done) keep their pill; «Запланирован» has none.
 * - problemSummary: the one summary line over the rows — «3 опаздывают · 1 пропущен».
 */
import type { StatusName } from "@octo/design-tokens";

const AMPM = /[\s  ]*([AaPp]\.?[Mm]\.?)$/;

export function plateHalves(from: string, to: string): [string, string] {
  const a = AMPM.exec(from.trim());
  const b = AMPM.exec(to.trim());
  if (a && b && a[1]!.toLowerCase() === b[1]!.toLowerCase()) return [from.trim().replace(AMPM, ""), to.trim()];
  return [from.trim(), to.trim()];
}

export type SlotLike = { kind: string; start: string; end?: string; done: boolean };

/** the index of today's nearest open visit: the first not done whose end is still ahead; -1 — none */
export function nearIndex(items: readonly SlotLike[], now: number): number {
  return items.findIndex((x) => x.kind === "visit" && !x.done && Date.parse(x.end ?? x.start) > now);
}

export type Shown = "pill" | "word" | "none";
const problem = (s: StatusName) => s === "warn" || s === "bad";

/** what each row shows of its status (in the rows' order) */
export function quietStatuses(statuses: readonly (StatusName | undefined)[]): Shown[] {
  let first = true;
  return statuses.map((s) => {
    if (!s || s === "neutral") return "none";
    if (!problem(s)) return "pill";
    if (first) {
      first = false;
      return "pill";
    }
    return "word";
  });
}

export type ProblemKind = "late" | "missed";
/** how many rows are late and missed; `null` when fewer than two problems — one pill says it already */
export function problemSummary(kinds: readonly (ProblemKind | null | undefined)[]): { late: number; missed: number } | null {
  const late = kinds.filter((k) => k === "late").length;
  const missed = kinds.filter((k) => k === "missed").length;
  return late + missed >= 2 ? { late, missed } : null;
}
