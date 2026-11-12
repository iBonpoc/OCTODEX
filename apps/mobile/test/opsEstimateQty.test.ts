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
/** a server without a column: an insert into this table whose rows have it gets PGRST204 */
const missingColumn: { table?: string; column?: string } = {};
const chain = (table: string): Record<string, unknown> => {
  let write = false;
  let refused = false;
  const result = () =>
    Promise.resolve(
      refused ? { data: null, error: { code: "PGRST204", message: "column not found" } } : write ? { data: null, error: null } : { data: found[table] ?? null, count: 0, error: null },
    );
  const c: Record<string, unknown> = { then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => result().then(r, j) };
  for (const k of ["insert", "upsert", "update", "delete"])
    c[k] = (row?: unknown) => {
      write = true;
      if (k === "insert" && missingColumn.table === table && Array.isArray(row) && row.some((r) => missingColumn.column! in (r as object))) refused = true;
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
  it("debt 3: a percent discount is written as the engine's whole bps — 0.00015 → 2 (Math.round of the float gave 1)", async () => {
    for (const [value, bps] of [["0.00015", 2], ["0.123456", 1235], ["0.05", 500]] as const) {
      writes.length = 0;
      const doc = {
        options: [{ id: "o1", name: "A", lines: [{ id: "l1", name: "l1", group: "labor", quantity: "1", unit: "ea", unitPriceCents: 1000 }] }],
        settings: { tax: { enabled: false, rateBps: 0, groups: {} }, deposit: { kind: "none" }, discount: { kind: "pct", value } },
      };
      await applyOp({ k: "estimate.save", id: "e-1", versionId: "v-new", customerId: "c-1", propertyId: "p-1", title: "T", doc, costs: {}, totalCents: 0, depositCents: 0, marginPct: null } as unknown as Op, "co-1", "u-1");
      const opts = writes.find((w) => w.table === "estimate_options" && w.kind === "insert")!.row as { discount_mode: string; discount_value: number }[];
      expect(opts[0]).toMatchObject({ discount_mode: "pct", discount_value: bps });
    }
  });
  it("debt 4: a line copied from a sent version carries copied_from_line_id; other lines and older ops have none", async () => {
    writes.length = 0;
    const line = (id: string) => ({ id, name: id, group: "labor", quantity: "1", unit: "ea", unitPriceCents: 1000 });
    const doc = { options: [{ id: "o1", name: "A", lines: [line("n1"), line("n2")] }], settings: { tax: { enabled: false, rateBps: 0, groups: {} }, deposit: { kind: "none" }, discount: null } };
    const base = { k: "estimate.save", id: "e-1", versionId: "v-new", customerId: "c-1", propertyId: "p-1", title: "T", doc, costs: {}, totalCents: 0, depositCents: 0, marginPct: null };
    await applyOp({ ...base, linesFrom: { n1: "s1" } } as unknown as Op, "co-1", "u-1");
    const rows = writes.find((w) => w.table === "estimate_line_items" && w.kind === "insert")!.row as Record<string, unknown>[];
    expect(rows.map((r) => [r.id, r.copied_from_line_id])).toEqual([["n1", "s1"], ["n2", undefined]]);
    expect("copied_from_line_id" in rows[1]!).toBe(false);
    writes.length = 0;
    await applyOp(base as unknown as Op, "co-1", "u-1");
    const old = writes.find((w) => w.table === "estimate_line_items" && w.kind === "insert")!.row as Record<string, unknown>[];
    expect(old.every((r) => !("copied_from_line_id" in r))).toBe(true);
  });
  it("client_visible on every row (a batch insert sends the columns of all rows: a missing key would be NULL)", async () => {
    writes.length = 0;
    const line = (id: string, x: object = {}) => ({ id, name: id, group: "labor", quantity: "1", unit: "ea", unitPriceCents: 1000, ...x });
    const doc = { options: [{ id: "o1", name: "A", lines: [line("v1"), line("h1", { unitPriceCents: 0, clientVisible: false }), line("p1", { clientVisible: false })] }], settings: { tax: { enabled: false, rateBps: 0, groups: {} }, deposit: { kind: "none" }, discount: null } };
    await applyOp({ k: "estimate.save", id: "e-1", versionId: "v-new", customerId: "c-1", propertyId: "p-1", title: "T", doc, costs: {}, totalCents: 0, depositCents: 0, marginPct: null } as unknown as Op, "co-1", "u-1");
    const rows = writes.find((w) => w.table === "estimate_line_items" && w.kind === "insert")!.row as Record<string, unknown>[];
    // hidden only at $0 (a priced one is visible — the server's check would refuse it otherwise)
    expect(rows.map((r) => [r.id, r.client_visible])).toEqual([["v1", true], ["h1", false], ["p1", true]]);
  });
  it("review #420 №1: a server before the migration refuses copied_from_line_id — the lines go again without it", async () => {
    writes.length = 0;
    missingColumn.table = "estimate_line_items";
    missingColumn.column = "copied_from_line_id";
    const line = (id: string) => ({ id, name: id, group: "labor", quantity: "1", unit: "ea", unitPriceCents: 1000 });
    const doc = { options: [{ id: "o1", name: "A", lines: [line("n1"), line("n2")] }], settings: { tax: { enabled: false, rateBps: 0, groups: {} }, deposit: { kind: "none" }, discount: null } };
    await expect(
      applyOp({ k: "estimate.save", id: "e-1", versionId: "v-new", customerId: "c-1", propertyId: "p-1", title: "T", doc, costs: {}, linesFrom: { n1: "s1" }, totalCents: 0, depositCents: 0, marginPct: null } as unknown as Op, "co-1", "u-1"),
    ).resolves.toBeUndefined();
    const inserts = writes.filter((w) => w.table === "estimate_line_items" && w.kind === "insert").map((w) => w.row as Record<string, unknown>[]);
    expect(inserts).toHaveLength(2);
    expect(inserts[1]!.map((r) => r.id)).toEqual(["n1", "n2"]);
    expect(inserts[1]!.every((r) => !("copied_from_line_id" in r))).toBe(true);
    delete missingColumn.table;
  });
});
