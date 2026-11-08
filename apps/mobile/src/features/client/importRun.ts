/**
 * The run of a server import of clients (docs/specs/04 §14.4): start → batches of IMPORT_BATCH → finish; a break
 * (network, the server's «not now», any refusal) stops at the first line not yet answered, «Продолжить» goes on from
 * there with the same job — the server answers a repeated batch with what it stored (no duplicates). Pure apart from
 * the driver: the cloud one calls the rpc (cloud/importCustomers.ts), the demo one the store. test/importRun.test.ts.
 */
import { classify } from "@/data/outboxRetry";
import type { Role } from "@/data/types";
import { batchesOf, type ImportRow, type ServerRow, type SkipReason } from "./csvImport";

export type ImportResult = "added" | "dup_added" | "skipped";
export interface ImportAnswer {
  line: number;
  result: ImportResult;
  reason?: SkipReason;
  who?: string;
  who_status?: "archived" | "do_not_service";
  customer_id?: string;
}
export interface ImportState {
  /** the first line the server has not answered */
  nextLine: number;
  /** the same file was imported before (ISO date) */
  sameFileAt?: string;
}
/** the server's own codes (the migration's raise exception), plus «network» (no answer) and «other» */
export type ImportFailure = "network" | "not_allowed" | "import_busy" | "import_daily_limit" | "import_closed" | "row_changed" | "import_too_big" | "import_undo_expired" | "other";
export class ImportStop extends Error {
  constructor(public code: ImportFailure) {
    super(code);
  }
}

const SERVER_CODES: ImportFailure[] = ["import_busy", "import_daily_limit", "import_closed", "row_changed", "import_too_big", "import_undo_expired"];
/**
 * The server's answer as the screen's reason. supabase-js gives a plain object ({message, code, details}), not an Error,
 * also when the answer never came («TypeError: Failed to fetch») — read its message, or a lost answer looks like a
 * refusal (cloud e2e 193, build #452).
 */
export function importFailureOf(e: unknown): ImportFailure {
  if (e instanceof ImportStop) return e.code;
  const msg = String((e as { message?: unknown } | null)?.message ?? e ?? "");
  const code = SERVER_CODES.find((c) => msg.includes(c));
  if (code) return code;
  if (/not allowed/.test(msg)) return "not_allowed";
  const asError = e instanceof Error ? e : Object.assign(new Error(msg), typeof e === "object" && e ? e : {});
  return classify(asError) === "refusal" ? "other" : "network";
}
export interface ImportDriver {
  start(): Promise<ImportState>;
  batch(rows: ServerRow[]): Promise<ImportAnswer[]>;
  finish(): Promise<void>;
  undo(): Promise<{ undone: number; kept: number }>;
}

export interface RunResult {
  answers: ImportAnswer[];
  /** every batch answered and the import finished */
  done: boolean;
  /** where it stopped and why (done = false) */
  stoppedAt?: number;
  failure?: ImportFailure;
}

const failureOf = (e: unknown): ImportFailure => (e instanceof ImportStop ? e.code : "other");

/** send what the server has not answered (from state.nextLine), batch by batch; answers already got are kept */
export async function runImport(
  driver: ImportDriver,
  rows: readonly ImportRow[],
  from: number,
  got: readonly ImportAnswer[] = [],
  onBatch?: (answers: ImportAnswer[]) => void,
): Promise<RunResult> {
  const answers = [...got];
  const known = new Set(answers.map((a) => a.line));
  for (const b of batchesOf(rows, from)) {
    try {
      const a = await driver.batch(b);
      for (const x of a) if (!known.has(x.line)) (known.add(x.line), answers.push(x));
      onBatch?.(answers);
    } catch (e) {
      return { answers, done: false, stoppedAt: b[0]!.line, failure: failureOf(e) };
    }
  }
  try {
    await driver.finish();
  } catch (e) {
    return { answers, done: false, stoppedAt: undefined, failure: failureOf(e) };
  }
  return { answers, done: true };
}

/** «Добавлено N, возможных дублей K, пропущено M» */
export function countsOf(answers: readonly ImportAnswer[]) {
  return {
    added: answers.filter((a) => a.result === "added").length,
    dupAdded: answers.filter((a) => a.result === "dup_added").length,
    skipped: answers.filter((a) => a.result === "skipped").length,
  };
}

/** the report the office can save: line, result, reason, who; a cell starting with = + - @ tab CR is a text, not a formula */
export function reportCsv(answers: readonly ImportAnswer[], rows: readonly ImportRow[]): string {
  const name = new Map(rows.map((r) => [r.line, r.name]));
  const cell = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [...answers].sort((a, b) => a.line - b.line).map((a) => [String(a.line), name.get(a.line) ?? "", a.result, a.reason ?? "", a.who ?? ""].map(cell).join(","));
  return ["line,name,result,reason,who", ...lines].join("\r\n");
}

/** who imports: the office (the app's director = owner / admin, dispatcher = office) — like «Не обслуживаем»
 *  (canMarkNoService); sales and the tech do not (§14.4). The server: app.has_role owner / admin / office. */
export const canImportClients = (role: Role | null | undefined) => role === "director" || role === "dispatcher";

/** one import on «Импорты» (public.import_jobs; demo — this phone's memory) */
export interface ImportJobRow {
  id: string;
  fileName: string;
  createdAt: string;
  status: "applying" | "applied" | "undone";
  counts: { added?: number; dup_added?: number; skipped?: number; undone?: number; kept?: number };
  undoUntil?: string | null;
  lastBatchAt?: string | null;
}
const DAY = 24 * 3600 * 1000;
/**
 * What the office may do with an import (docs/specs/04 §14.4): an open one — «Продолжить» (choose the same file again;
 * a day without batches closes it, as the server does); an applied one — «Отменить импорт» until undo_until (30 days).
 */
export function importActions(j: ImportJobRow, now: number): { canContinue: boolean; canUndo: boolean; open: boolean } {
  const stale = j.status === "applying" && !!j.lastBatchAt && now - Date.parse(j.lastBatchAt) > DAY;
  const open = j.status === "applying" && !stale;
  const until = j.status === "applied" ? j.undoUntil : stale && j.lastBatchAt ? new Date(Date.parse(j.lastBatchAt) + 31 * DAY).toISOString() : null;
  return { open, canContinue: open, canUndo: !!until && Date.parse(until) > now };
}
