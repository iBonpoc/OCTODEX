/**
 * #2643 (found by #2630): the client chosen for a DRAFT after its first sync reaches the server. Before the fix
 * estimate.save wrote the estimate row only as «insert if missing» (ins = upsert … ignoreDuplicates): the phone showed
 * the new client, the cloud kept the old one, and a reload from the cloud brought the old one back.
 * Now: the server's draft with another client / property → one update of customer_id + property_id, only while it is a
 * draft (status = draft filter: sent meanwhile from another phone → nothing written, the lock of #2630 is never met),
 * after the version is saved (a refused client never takes the lines with it). A sent / viewed estimate keeps its client
 * (#2406, #2629, #2630) — also when this very save turns it back into a draft.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Write { table: string; kind: string; row?: unknown; eq: [string, unknown][] }
const writes: Write[] = [];
const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
const order: string[] = [];
const found: Record<string, unknown> = {};
const chain = (table: string): Record<string, unknown> => {
  let w: Write | undefined;
  const c: Record<string, unknown> = { then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => Promise.resolve({ data: found[table] ?? null, error: null }).then(r, j) };
  for (const k of ["insert", "upsert", "update", "delete"])
    c[k] = (row?: unknown) => ((w = { table, kind: k, row, eq: [] }), writes.push(w), order.push(`${table}:${k}`), c);
  c.eq = (col: string, v: unknown) => (w?.eq.push([col, v]), c);
  for (const k of ["select", "neq", "in", "not", "is", "order", "limit", "range"]) c[k] = () => c;
  c.maybeSingle = () => Promise.resolve({ data: found[table] ?? null, error: null });
  return c;
};
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (t: string) => chain(t),
    rpc: (fn: string, args: Record<string, unknown>) => (rpcs.push({ fn, args }), order.push(`rpc:${fn}`), Promise.resolve({ data: null, error: null, status: 200 })),
  },
}));
import { applyOp, type Op } from "../src/cloud/ops";

const doc = {
  options: [{ id: "o1", name: "A", lines: [{ id: "l1", name: "Work (test)", group: "labor", quantity: "1", unit: "ea", unitPriceCents: 1000 }] }],
  settings: { tax: { enabled: false, rateBps: 0, groups: {} }, deposit: { kind: "none" }, discount: null },
};
const op = (x: object = {}) =>
  ({ k: "estimate.save", id: "e-1", versionId: "v-new", customerId: "c-new", propertyId: "p-new", title: "T (test)", doc, costs: {}, totalCents: 1000, depositCents: 0, marginPct: null, ...x }) as unknown as Op;
const clientWrites = () => writes.filter((w) => w.table === "estimates" && w.kind === "update" && w.row && typeof w.row === "object" && "customer_id" in (w.row as object));
beforeEach(() => {
  writes.length = 0;
  rpcs.length = 0;
  order.length = 0;
  found.estimates = { status: "draft", current_version_id: "v-1", customer_id: "c-old", property_id: "p-old" };
  found.estimate_versions = { locked_at: null, version_no: 1 };
});

describe("unit:opsEstimateClientDraft — #2643", () => {
  it("a draft with another client on the server: the new client and property are written, only while it is a draft", async () => {
    await applyOp(op(), "co-1", "u-1");
    const w = clientWrites();
    expect(w).toHaveLength(1);
    expect(w[0].row).toEqual({ customer_id: "c-new", property_id: "p-new" });
    expect(w[0].eq).toEqual([["id", "e-1"], ["status", "draft"]]);
  });
  it("the client is written after the version: a refused client never takes the lines with it", async () => {
    await applyOp(op(), "co-1", "u-1");
    const save = order.indexOf("rpc:save_estimate_version");
    const client = order.lastIndexOf("estimates:update");
    expect(save).toBeGreaterThanOrEqual(0);
    expect(client).toBeGreaterThan(save);
  });
  it("only the property changed (the same client, another address): written too", async () => {
    found.estimates = { status: "draft", current_version_id: "v-1", customer_id: "c-new", property_id: "p-old" };
    await applyOp(op(), "co-1", "u-1");
    expect(clientWrites().map((w) => w.row)).toEqual([{ customer_id: "c-new", property_id: "p-new" }]);
  });
  it("the same client and property: nothing extra is written", async () => {
    found.estimates = { status: "draft", current_version_id: "v-1", customer_id: "c-new", property_id: "p-new" };
    await applyOp(op(), "co-1", "u-1");
    expect(clientWrites()).toHaveLength(0);
  });
  it("a sent estimate keeps its client (#2406), even when this save turns it back into a draft", async () => {
    found.estimates = { status: "sent", current_version_id: "v-1", customer_id: "c-old", property_id: "p-old" };
    await applyOp(op(), "co-1", "u-1");
    expect(clientWrites()).toHaveLength(0);
    expect(rpcs.map((r) => r.fn)).toEqual(["save_estimate_version"]);
  });
  it("a viewed estimate keeps its client too", async () => {
    found.estimates = { status: "viewed", current_version_id: "v-1", customer_id: "c-old", property_id: "p-old" };
    await applyOp(op(), "co-1", "u-1");
    expect(clientWrites()).toHaveLength(0);
  });
});
