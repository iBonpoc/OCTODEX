/**
 * Н1 (spec 33 П23.9): estimate.save writes each line's quantity as the server keeps it (numeric(14,4), half away from
 * zero) — the same number the engine counts (custom.ts toLine). So our own send never meets the lock check
 * (migration 20261108190000, T107) with a difference.
 */
import { describe, expect, it, vi } from "vitest";

const writes: { table: string; kind: string; row?: unknown }[] = [];
const found: Record<string, unknown> = {
  estimates: { status: "draft", current_version_id: "v-1" },
  estimate_versions: { locked_at: null, version_no: 1 },
  estimate_options: [],
};
const chain = (table: string): Record<string, unknown> => {
  let write = false;
  const result = () => Promise.resolve(write ? { data: null, error: null } : { data: found[table] ?? null, count: 0, error: null });
  const c: Record<string, unknown> = { then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => result().then(r, j) };
  for (const k of ["insert", "upsert", "update", "delete"])
    c[k] = (row?: unknown) => {
      write = true;
      writes.push({ table, kind: k, row });
      return c;
    };
  for (const k of ["select", "eq", "neq", "in", "not", "is", "order", "limit", "range"]) c[k] = () => c;
  c.maybeSingle = () => result();
  c.single = () => result();
  return c;
};
vi.mock("../src/cloud/client", () => ({
  supabase: { from: (t: string) => chain(t), rpc: () => Promise.resolve({ data: null, error: null }) },
}));

import { applyOp, type Op } from "../src/cloud/ops";

describe("unit:opsEstimateQty — the stored quantity (Н1)", () => {
  it("1.23455 → 1.2346, 2.00004 → 2, 1.5 as it is; a text that is not a number goes as before", async () => {
    const line = (id: string, quantity: string) => ({ id, name: id, group: "labor", quantity, unit: "ea", unitPriceCents: 1000 });
    const doc = {
      options: [{ id: "o1", name: "A", lines: [line("l1", "1.23455"), line("l2", "2.00004"), line("l3", "1.5"), line("l4", "abc")] }],
      settings: { tax: { enabled: false, rateBps: 0, groups: {} }, deposit: { kind: "none" }, discount: null },
    };
    const op = { k: "estimate.save", id: "e-1", versionId: "v-new", customerId: "c-1", propertyId: "p-1", title: "T", doc, costs: {}, totalCents: 0, depositCents: 0, marginPct: null } as unknown as Op;
    await applyOp(op, "co-1", "u-1");
    const ins = writes.find((w) => w.table === "estimate_line_items" && w.kind === "insert")!.row as { id: string; quantity: unknown }[];
    expect(ins.map((r) => [r.id, r.quantity])).toEqual([["l1", "1.2346"], ["l2", "2"], ["l3", "1.5"], ["l4", NaN]]);
  });
});
