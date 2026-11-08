/**
 * The demo driver of a client import (no cloud): the same screen and run, the store instead of the server. The check
 * is the same rule (planImport) made once at the start; a job remembered on this phone answers a repeated start.
 */
import type { DB, ID } from "@/data/types";
import { planImport, type ImportRow, type ServerRow } from "./csvImport";
import type { ImportAnswer, ImportDriver } from "./importRun";

type Undo = () => void;
const jobs = new Map<string, { answers: Map<number, ImportAnswer>; undos: Undo[] }>();
const files = new Map<string, string>();

export function demoImportDriver(x: {
  jobId: string;
  sha256: string;
  rows: readonly ImportRow[];
  db: () => Pick<DB, "customers" | "properties">;
  add: (r: ImportRow) => { id: ID; undo: Undo };
}): ImportDriver {
  let plan: ReturnType<typeof planImport> | null = null;
  const job = jobs.get(x.jobId) ?? { answers: new Map<number, ImportAnswer>(), undos: [] };
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
      return out;
    },
    async finish() {
      files.set(x.sha256, new Date().toISOString());
    },
    async undo() {
      const n = job.undos.length;
      for (const u of job.undos.reverse()) u();
      job.undos = [];
      return { undone: n, kept: 0 };
    },
  };
}

/** the demo's open job of this file (not finished on this phone) */
const open = new Map<string, string>();
export const demoOpenJob = (sha: string) => open.get(sha) ?? null;
export const demoMarkOpen = (sha: string, jobId: string | null) => (jobId ? open.set(sha, jobId) : open.delete(sha));
