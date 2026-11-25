/**
 * #2474 (spec 65 §0 п.3, С7): an estimate's save that meets «the client signed, waits for the company» on the server
 * (awaiting_countersign) never takes the client's signature off by itself. The phone edited a sent estimate without the
 * network; the client signed by the link meanwhile; the queue goes — before the fix the cloud save called reopen_estimate
 * and the signature was gone (back to draft). Now: only an op that says the phone edited the signed estimate on purpose
 * («Сохранить и снять подпись», #2381 — fromStatus: awaiting_countersign) reopens it; any other is refused for good
 * (hint estimate_signed_meanwhile) and the refusal is kept as a card (never silent).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const writes: { table: string; kind: string; row?: unknown }[] = [];
const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
const found: Record<string, unknown> = {};
const chain = (table: string): Record<string, unknown> => {
  const c: Record<string, unknown> = { then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => Promise.resolve({ data: found[table] ?? null, error: null }).then(r, j) };
  for (const k of ["insert", "upsert", "update", "delete"]) c[k] = (row?: unknown) => (writes.push({ table, kind: k, row }), c);
  for (const k of ["select", "eq", "neq", "in", "not", "is", "order", "limit", "range"]) c[k] = () => c;
  c.maybeSingle = () => Promise.resolve({ data: found[table] ?? null, error: null });
  return c;
};
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (t: string) => chain(t),
    rpc: (fn: string, args: Record<string, unknown>) => (rpcs.push({ fn, args }), Promise.resolve({ data: null, error: null, status: 200 })),
  },
}));
import { applyOp, PermanentError, type Op } from "../src/cloud/ops";
import { rejectedOf } from "../src/data/outboxRejected";
import { classify } from "../src/data/outboxRetry";

const doc = {
  options: [{ id: "o1", name: "A", lines: [{ id: "l1", name: "Work (test)", group: "labor", quantity: "1", unit: "ea", unitPriceCents: 1000 }] }],
  settings: { tax: { enabled: false, rateBps: 0, groups: {} }, deposit: { kind: "none" }, discount: null },
};
const op = (x: object = {}) =>
  ({ k: "estimate.save", id: "e-1", versionId: "v-new", customerId: "c-1", propertyId: "p-1", title: "T (test)", doc, costs: {}, totalCents: 1000, depositCents: 0, marginPct: null, ...x }) as unknown as Op;
beforeEach(() => {
  writes.length = 0;
  rpcs.length = 0;
  found.estimates = { status: "awaiting_countersign", current_version_id: "v-1" };
  found.estimate_versions = { locked_at: "2026-11-24T10:00:00Z", version_no: 1 };
});

describe("unit:opsEstimateSignedMeanwhile — #2474", () => {
  it("С7: edited without the network while sent, the client signed meanwhile — no reopen, nothing written, refused for good", async () => {
    const e = await applyOp(op(), "co-1", "u-1").then(() => undefined, (x: unknown) => x);
    expect(rpcs.map((r) => r.fn)).not.toContain("reopen_estimate");
    expect(rpcs.map((r) => r.fn)).not.toContain("save_estimate_version");
    // only the estimate's «insert if missing» (upsert, ignoreDuplicates) — no status, no version, no lines
    expect(writes.map((w) => `${w.table}:${w.kind}`)).toEqual(["estimates:upsert"]);
    expect(writes.some((w) => w.table === "estimate_versions")).toBe(false);
    expect(e).toBeInstanceOf(PermanentError);
    expect((e as PermanentError).hint).toBe("estimate_signed_meanwhile");
    // a refusal (spent tries, then dropped), never «try later» forever
    expect(classify(e)).toBe("refusal");
  });
  it("the same op from a phone that saw «sent» (fromStatus: sent) — refused the same way", async () => {
    const e = await applyOp(op({ fromStatus: "sent" }), "co-1", "u-1").then(() => undefined, (x: unknown) => x);
    expect(rpcs.map((r) => r.fn)).not.toContain("reopen_estimate");
    expect((e as PermanentError).hint).toBe("estimate_signed_meanwhile");
  });
  it("«Сохранить и снять подпись» (#2381: the phone edited the signed estimate on purpose) — reopened, then saved, as before", async () => {
    await applyOp(op({ fromStatus: "awaiting_countersign" }), "co-1", "u-1");
    expect(rpcs.map((r) => r.fn)).toEqual(["reopen_estimate", "save_estimate_version"]);
  });
  it("a sent estimate with no signature: saved as before (no reopen)", async () => {
    found.estimates = { status: "sent", current_version_id: "v-1" };
    await applyOp(op(), "co-1", "u-1");
    expect(rpcs.map((r) => r.fn)).toEqual(["save_estimate_version"]);
  });
  it("the refusal leaves a card: the estimate, and why — never dropped silently", async () => {
    const e = (await applyOp(op(), "co-1", "u-1").then(() => undefined, (x: unknown) => x)) as PermanentError;
    const item = { id: "ob-1", op: op(), tries: 4 } as never;
    const rej = rejectedOf(item, e.message, Date.parse("2026-11-24T12:00:00Z"), null, e.hint);
    expect(rej).toMatchObject({ what: "estimate", href: "/estimate/e-1", reason: "estimate_signed_meanwhile", labelKey: "est.rej.signedMeanwhile" });
  });
});
