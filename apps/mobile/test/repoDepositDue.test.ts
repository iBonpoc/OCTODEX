/**
 * Review of #247 (17-job §12.1): when the server refuses a deposit (no job of the estimate), the phone drops the op and
 * reloads. What the person then sees comes from loadCompanyDB: the approved estimate with its deposit still due (no
 * depositPaidAt) and no job — the estimate screen shows «Задаток к оплате» again, never a silent «received».
 */
import { describe, expect, it, vi } from "vitest";

const rows: Record<string, Record<string, unknown>[]> = {
  memberships: [{ user_id: "u-me", role: "office", status: "active", users: { full_name: "Olga Office" } }],
  customers: [{ id: "c-1", display_name: "Ann Client", status: "active" }],
  properties: [{ id: "p-1", customer_id: "c-1", address_line1: "1 Elm St", address_city: "Pasadena" }],
  estimates: [{ id: "e-1", customer_id: "c-1", property_id: "p-1", title: "Gutters", status: "approved", current_version_id: "v-1", number: "EST-1" }],
  estimate_versions: [{ id: "v-1", estimate_id: "e-1", totals: { total: 100000, deposit: 30000 } }],
};
function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "order", "limit", "in", "not", "range", "gte"]) b[m] = () => b;
  b.then = (ok: (r: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(ok);
  return b;
}
vi.mock("../src/cloud/client", () => ({
  supabase: { from: (t: string) => builder(t), rpc: (fn: string) => (fn === "estimate_links" ? builder(fn) : Promise.resolve({ data: null, error: null })) },
}));
import { loadCompanyDB } from "../src/cloud/repo";

describe("a refused deposit after the reload", () => {
  it("the approved estimate has no job and its deposit is due again", async () => {
    const db = await loadCompanyDB("co-1", "u-me");
    const e = db.estimates.find((x) => x.id === "e-1");
    expect(e?.status).toBe("approved");
    expect(e?.depositCents).toBe(30000);
    expect(e?.depositPaidAt).toBeUndefined();
    expect(db.jobs.some((j) => j.estimateId === "e-1")).toBe(false);
    expect(db.payments).toEqual([]);
  });
});
