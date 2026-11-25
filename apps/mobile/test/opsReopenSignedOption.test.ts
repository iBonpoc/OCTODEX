/**
 * #2478 (спека 65 §3.5, п.2 и п.4): «Не подписывать — изменить» называет подпись клиента, которую снимает. The cloud
 * calls reopen_signed_estimate with the option the phone saw the client sign (signedOptionId): the server refuses for good
 * when the client signed another one meanwhile (T473), never a quiet loss of a newer signature. An op of an older build
 * (no signedOptionId) keeps the old reopen_estimate (rule 16, step 1); a server without the new function yet (PGRST202) too.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
const found: Record<string, unknown> = {};
let missing = false;
const chain = (table: string): Record<string, unknown> => {
  const c: Record<string, unknown> = { then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => Promise.resolve({ data: found[table] ?? null, error: null }).then(r, j) };
  for (const k of ["insert", "upsert", "update", "delete", "select", "eq", "neq", "in", "not", "is", "order", "limit", "range"]) c[k] = () => c;
  c.maybeSingle = () => Promise.resolve({ data: found[table] ?? null, error: null });
  return c;
};
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (t: string) => chain(t),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      if (missing && fn === "reopen_signed_estimate") return Promise.resolve({ data: null, error: { code: "PGRST202", message: "no function" }, status: 404 });
      return Promise.resolve({ data: null, error: null, status: 200 });
    },
  },
}));
import { applyOp, type Op } from "../src/cloud/ops";
import { rejectedOf } from "../src/data/outboxRejected";

const doc = {
  options: [{ id: "o1", name: "A", lines: [{ id: "l1", name: "Work (test)", group: "labor", quantity: "1", unit: "ea", unitPriceCents: 1000 }] }],
  settings: { tax: { enabled: false, rateBps: 0, groups: {} }, deposit: { kind: "none" }, discount: null },
};
const save = (x: object = {}) =>
  ({ k: "estimate.save", id: "e-1", versionId: "v-new", customerId: "c-1", propertyId: "p-1", title: "T (test)", doc, costs: {}, totalCents: 1000, depositCents: 0, marginPct: null, fromStatus: "awaiting_countersign", ...x }) as unknown as Op;
const reopen = (x: object = {}) => ({ k: "estimate.reopen", id: "e-1", reason: "gate", ...x }) as unknown as Op;
const fns = () => rpcs.map((r) => r.fn);
beforeEach(() => {
  rpcs.length = 0;
  missing = false;
  found.estimates = { status: "awaiting_countersign", current_version_id: "v-1" };
  found.estimate_versions = { locked_at: "2026-11-24T10:00:00Z", version_no: 1 };
});

describe("unit:opsReopenSignedOption — #2478", () => {
  it("«Не подписывать — изменить»: the signature the phone saw goes to the server", async () => {
    await applyOp(reopen({ signedOptionId: "opt-1" }), "co-1", "u-1");
    expect(rpcs).toEqual([{ fn: "reopen_signed_estimate", args: { p_estimate_id: "e-1", p_reason: "gate", p_signed_option_id: "opt-1" } }]);
  });
  it("«Сохранить и снять подпись»: the save names the signature too", async () => {
    await applyOp(save({ signedOptionId: "opt-1" }), "co-1", "u-1");
    expect(fns()).toEqual(["reopen_signed_estimate", "save_estimate_version"]);
    expect(rpcs[0]!.args).toEqual({ p_estimate_id: "e-1", p_reason: null, p_signed_option_id: "opt-1" });
  });
  it("an op of an older build (no signedOptionId): the old reopen_estimate, as before", async () => {
    await applyOp(reopen(), "co-1", "u-1");
    await applyOp(save(), "co-1", "u-1");
    expect(fns()).toEqual(["reopen_estimate", "reopen_estimate", "save_estimate_version"]);
  });
  it("a server without the new function yet (PGRST202): the old one", async () => {
    missing = true;
    await applyOp(reopen({ signedOptionId: "opt-1" }), "co-1", "u-1");
    expect(fns()).toEqual(["reopen_signed_estimate", "reopen_estimate"]);
  });
  it("the server refused it (the client signed another version): a card, never silent", () => {
    const rej = rejectedOf({ id: "ob-1", op: reopen({ signedOptionId: "opt-1" }), tries: 4 } as never, "refused", Date.parse("2026-11-25T12:00:00Z"), null, "estimate_signed_meanwhile");
    expect(rej).toMatchObject({ what: "estimate", href: "/estimate/e-1", reason: "estimate_signed_meanwhile" });
  });
});
