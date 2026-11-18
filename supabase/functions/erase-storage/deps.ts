// The real clients of one drain of the Storage erase queue (spec 50, PR 50-3): shared by erase-storage and delete-account, so there is one
// code path. The client is the service-role one; the handler's own checks (bucket, path shape) stand between the queue and the API.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import type { EraseDeps, Row } from "./handler.ts";

export const storageDeps = (admin: SupabaseClient, log: (m: string) => void = (m) => console.warn(m)): EraseDeps => ({
  claim: async (limit) => {
    const { data, error } = await admin.rpc("storage_erase_claim", { p_limit: limit });
    if (error) throw new Error(`rpc claim ${error.code ?? ""}`);
    return (data ?? []) as Row[];
  },
  remove: async (bucket, paths) => {
    const { error } = await admin.storage.from(bucket).remove(paths);
    return { error: error ? { message: "storage remove failed" } : null };
  },
  done: async (ids) => void (await admin.rpc("storage_erase_done", { p_ids: ids })),
  fail: async (ids) => void (await admin.rpc("storage_erase_fail", { p_ids: ids })),
  log,
});
