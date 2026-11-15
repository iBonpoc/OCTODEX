/**
 * The demo driver of a client import (no cloud): the same screen and run, the store instead of the server. The check
 * is the same rule (planImport) made once at the start; a job remembered on this phone answers a repeated start.
 */
import type { DB, ID } from "@/data/types";
import { planImport, type ImportRow, type ServerRow } from "./csvImport";
import type { ImportAnswer, ImportDriver, ImportJobRow } from "./importRun";

type Undo = () => void;
const jobs = new Map<string, { answers: Map<number, ImportAnswer>; undos: Undo[]; row: ImportJobRow }>();
const files = new Map<string, string>();

export function demoImportDriver(x: {
  jobId: string;
  fileName: string;
  sha256: string;
  rows: readonly ImportRow[];
  db: () => Pick<DB, "customers" | "properties">;
  add: (r: ImportRow) => { id: ID; undo: Undo };
}): ImportDriver {
  let plan: ReturnType<typeof planImport> | null = null;
  const job = jobs.get(x.jobId) ?? {
    answers: new Map<number, ImportAnswer>(), undos: [],
    row: { id: x.jobId, fileName: x.fileName, createdAt: new Date().toISOString(), status: "applying", counts: {}, lastBatchAt: new Date().toISOString() } as ImportJobRow,
  };
  jobs.set(x.jobId, job);
  const byLine = new Map(x.rows.map((r) => [r.line, r]));
  return {
    async start() {
      const sameFileAt = files.get(x.sha256);
      const next = Math.max(1, ...job.answers.keys()) + 1;
      return { nextLine: next, sameFileAt };
    },
    async batch(rows: ServerRow[]) {
      plan ??= planImport(x.db(), x.rows);
      const out: ImportAnswer[] = [];
      for (const s of rows) {
        const had = job.answers.get(s.line);
        if (had) {
          out.push(had);
          continue;
        }
        const row = byLine.get(s.line)!;
        const skip = plan.skip.find((k) => k.row.line === s.line);
        const dup = plan.dupAdd.find((d) => d.row.line === s.line);
        let a: ImportAnswer;
        if (skip) a = { line: s.line, result: "skipped", reason: skip.reason, who: skip.who, who_status: skip.whoStatus === "archived" || skip.whoStatus === "do_not_service" ? skip.whoStatus : undefined };
        else {
          const made = x.add(row);
          job.undos.push(made.undo);
          a = { line: s.line, result: dup ? "dup_added" : "added", who: dup?.who, customer_id: made.id };
        }
        job.answers.set(s.line, a);
        out.push(a);
      }
      job.row.lastBatchAt = new Date().toISOString();
      job.row.counts = countsOfJob(job.answers);
      return out;
    },
    async finish() {
      files.set(x.sha256, new Date().toISOString());
      if (job.row.status === "applying") {
        job.row.status = "applied";
        job.row.undoUntil = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      }
    },
    undo: () => demoUndo(x.jobId),
  };
}

/** the demo's open job of this file (not finished on this phone) */
const open = new Map<string, string>();
export const demoOpenJob = (sha: string) => open.get(sha) ?? null;
export const demoMarkOpen = (sha: string, jobId: string | null) => (jobId ? open.set(sha, jobId) : open.delete(sha));

const countsOfJob = (a: Map<number, ImportAnswer>) => {
  const v = [...a.values()];
  return { added: v.filter((x) => x.result === "added").length, dup_added: v.filter((x) => x.result === "dup_added").length, skipped: v.filter((x) => x.result === "skipped").length };
};
/** the demo's imports, newest first (this phone's memory: gone after a reload) */
export const demoImports = (): ImportJobRow[] => [...jobs.values()].map((j) => ({ ...j.row, counts: { ...j.row.counts } })).reverse();
/** the demo's undo: every card this import added, back (the demo has no server to ask what was added since) */
export async function demoUndo(jobId: string): Promise<{ undone: number; kept: number }> {
  const job = jobs.get(jobId);
  if (!job || job.row.status === "undone") return { undone: job?.row.counts.undone ?? 0, kept: 0 };
  // each card is its own: one changed since stays (kept, as the server's undo counts it) — the others go back
  let undone = 0;
  let kept = 0;
  for (const u of job.undos.reverse()) {
    if ((u as () => unknown)() === false) kept++;
    else undone++;
  }
  job.undos = [];
  job.row.status = "undone";
  job.row.counts = { ...job.row.counts, undone, kept };
  return { undone, kept };
}
