/**
 * The cloud driver of a client import (docs/specs/04 §14.4): the rpc of migration 20261109180000. Not through the
 * outbox — 5,000 rows must not hold the phone's other changes (§14.4 «Офлайн»); a break is «Продолжить».
 */
import { importFailureOf, ImportStop, type ImportAnswer, type ImportDriver, type ImportJobRow } from "@/features/client/importRun";
import { supabase } from "./client";

const stop = (e: unknown) => new ImportStop(importFailureOf(e));
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let res: { data: unknown; error: unknown };
  try {
    res = await supabase.rpc(fn, args);
  } catch (e) {
    throw stop(e);
  }
  if (res.error) throw stop(res.error);
  return res.data as T;
}

export function cloudImportDriver(x: { companyId: string; jobId: string; fileName: string; sha256: string; total: number; sourceId: string }): ImportDriver {
  return {
    async start() {
      const s = await rpc<{ next_line: number; same_file_at?: string | null }>("import_customers_start", {
        p_company: x.companyId, p_job: x.jobId, p_file_name: x.fileName.slice(0, 200) || "clients.csv", p_sha256: x.sha256, p_total: x.total, p_source: x.sourceId,
      });
      return { nextLine: s.next_line, sameFileAt: s.same_file_at ?? undefined };
    },
    batch: (rows) => rpc<ImportAnswer[]>("import_customers", { p_job: x.jobId, p_rows: rows }),
    async finish() {
      await rpc("import_customers_finish", { p_job: x.jobId });
    },
    async undo() {
      const s = await rpc<{ counts?: { undone?: number; kept?: number } }>("undo_customer_import", { p_job: x.jobId });
      return { undone: s.counts?.undone ?? 0, kept: s.counts?.kept ?? 0 };
    },
  };
}

/** my open import of this same file (the screen was closed in the middle): its id, to go on with it */
export async function openImportFor(companyId: string, userId: string, sha256: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("import_jobs").select("id").eq("company_id", companyId).eq("created_by", userId).eq("file_sha256", sha256).eq("status", "applying")
      .limit(1).maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

/** the company's imports, newest first (RLS: owner / admin / office) */
export async function listImports(companyId: string): Promise<ImportJobRow[]> {
  const { data, error } = await supabase
    .from("import_jobs").select("id, file_name, created_at, status, counts, undo_until, last_batch_at")
    .eq("company_id", companyId).order("created_at", { ascending: false }).limit(50);
  if (error) throw stop(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), fileName: String(r.file_name), createdAt: String(r.created_at), status: r.status as ImportJobRow["status"],
    counts: (r.counts ?? {}) as ImportJobRow["counts"], undoUntil: (r.undo_until as string | null) ?? null, lastBatchAt: (r.last_batch_at as string | null) ?? null,
  }));
}
export async function undoImport(jobId: string): Promise<{ undone: number; kept: number }> {
  const s = await rpc<{ counts?: { undone?: number; kept?: number } }>("undo_customer_import", { p_job: jobId });
  return { undone: s.counts?.undone ?? 0, kept: s.counts?.kept ?? 0 };
}
