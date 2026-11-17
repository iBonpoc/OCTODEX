/**
 * unit:itemCostsSeen — #1958 (а): a cost an item already on the server changes goes over what the phone saw
 * (catalog_set_item_costs, migration 20261117240000, db T365–T370), never in the item's row nor a plain upsert — both
 * put it over whatever is there (t30's coalesce, the side table's upsert). An op queued by an older build (no `costs`)
 * sends no cost field at all. «Changed meanwhile» (40001 row_version_conflict) is a refusal, not «try later».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { kind: "update" | "upsert" | "rpc"; table: string; row?: Record<string, unknown>; args?: Record<string, unknown> };
const calls: Call[] = [];
const next = { rpc: null as null | { message: string; code?: string; hint?: string } };
vi.mock("@/cloud/client", () => {
  const chain = (data: unknown) => {
    const q: Record<string, unknown> = {};
    const done = Promise.resolve({ data, error: null, status: 200 });
    for (const m of ["eq", "select", "maybeSingle", "is"]) q[m] = () => q;
    q.then = (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => done.then(a, b);
    return q;
  };
  return {
    supabase: {
      from: (table: string) => ({
        update: (row: Record<string, unknown>) => (calls.push({ kind: "update", table, row }), chain([{ id: "i1" }])),
        upsert: (row: Record<string, unknown>) => (calls.push({ kind: "upsert", table, row }), chain(null)),
        select: () => chain({ id: "i1", deleted_at: null }),
      }),
      rpc: (name: string, args: Record<string, unknown>) =>
        (calls.push({ kind: "rpc", table: name, args }), Promise.resolve({ data: null, error: next.rpc, status: next.rpc ? 409 : 200 })),
    },
  };
});
import { applyOp, catalogCostChange, catalogCostSeen, type Op } from "../src/cloud/ops";
import { classify, isRowConflict } from "../src/data/outboxRetry";
import type { CatalogItem } from "../src/data/types";

const item = (o: Partial<CatalogItem> = {}): CatalogItem => ({ id: "i1", kind: "material", name: "Coil (test)", unit: "ft", priceCents: 800, costCents: 400, vendorTaxBps: 0, markupBps: 10000, ...o });
const COST = ["unit_cost_cents", "vendor_tax_bps", "markup_bps"];
const hasCost = (row?: Record<string, unknown>) => !!row && COST.some((c) => c in row);

beforeEach(() => {
  calls.length = 0;
  next.rpc = null;
});

describe("unit:itemCostsSeen — #1958 (а)", () => {
  it("what the phone saw: the changed fields of the item before the change; a new item or no cost change — none", () => {
    const prev = item();
    const it = item({ costCents: 500, markupBps: undefined });
    const costs = catalogCostChange(prev, it);
    expect(costs).toEqual({ costCents: 500, markupBps: null });
    expect(catalogCostSeen(prev, costs)).toEqual({ costCents: 400, markupBps: 10000 });
    expect(catalogCostSeen(undefined, costs)).toBeUndefined();
    expect(catalogCostSeen(prev, {})).toBeUndefined();
  });

  it("an item already there: the row without its cost, the cost over what the phone saw (one call, column names)", async () => {
    const op: Op = { k: "catalog.save", item: item({ name: "Coil 2 (test)", costCents: 500 }), costs: { costCents: 500 }, costsSeen: { costCents: 400 }, fields: ["name"] };
    await applyOp(op, "c1", "u1");
    const upd = calls.find((c) => c.kind === "update" && c.table === "catalog_items");
    expect(upd?.row).toEqual({ name: "Coil 2 (test)" });
    expect(calls.filter((c) => c.kind === "upsert" && c.table === "catalog_item_costs")).toEqual([]);
    expect(calls.filter((c) => c.kind === "rpc")).toEqual([
      { kind: "rpc", table: "catalog_set_item_costs", args: { p_item_id: "i1", p_costs: { unit_cost_cents: 500 }, p_seen: { unit_cost_cents: 400 } } },
    ]);
  });

  it("only the cost changed: no row write at all, the cost over what the phone saw; a cleared field goes as null", async () => {
    await applyOp({ k: "catalog.save", item: item({ markupBps: undefined }), costs: { markupBps: null }, costsSeen: { markupBps: 10000 }, fields: [] }, "c1", "u1");
    expect(calls.filter((c) => c.kind !== "rpc")).toEqual([]);
    expect(calls.at(-1)?.args).toEqual({ p_item_id: "i1", p_costs: { markup_bps: null }, p_seen: { markup_bps: 10000 } });
  });

  it("an op queued by an older build (no `costs`): no cost field anywhere — never the three cached ones", async () => {
    await applyOp({ k: "catalog.save", item: item({ name: "Old (test)" }), fields: ["name"] }, "c1", "u1");
    await applyOp({ k: "catalog.save", item: item({ name: "Older (test)" }) }, "c1", "u1");
    expect(calls.some((c) => hasCost(c.row))).toBe(false);
    expect(calls.filter((c) => c.table === "catalog_item_costs" || c.kind === "rpc")).toEqual([]);
  });

  it("a new item (nothing seen): its cost goes with it as before", async () => {
    await applyOp({ k: "catalog.save", item: item({ id: "n1" }), costs: { costCents: 400, vendorTaxBps: 0, markupBps: 10000 } }, "c1", "u1");
    expect(calls.some((c) => c.kind === "rpc")).toBe(false);
    expect(calls.some((c) => c.kind === "upsert" && c.table === "catalog_items" && hasCost(c.row))).toBe(true);
  });

  it("«changed meanwhile» (40001 row_version_conflict) is a refusal the queue does not retry", async () => {
    next.rpc = { message: "the item's cost changed meanwhile", code: "40001", hint: "row_version_conflict" };
    const e = await applyOp({ k: "catalog.save", item: item({ costCents: 500 }), costs: { costCents: 500 }, costsSeen: { costCents: 400 }, fields: [] }, "c1", "u1").catch((x: unknown) => x);
    expect(classify(e)).toBe("refusal");
    expect(isRowConflict(e)).toBe(true);
  });

  it("a server before the migration (PGRST202): the side table as before", async () => {
    next.rpc = { message: "Could not find the function", code: "PGRST202" };
    await applyOp({ k: "catalog.save", item: item({ costCents: 500 }), costs: { costCents: 500 }, costsSeen: { costCents: 400 }, fields: [] }, "c1", "u1");
    expect(calls.filter((c) => c.kind === "upsert" && c.table === "catalog_item_costs").map((c) => c.row)).toEqual([{ item_id: "i1", company_id: "c1", unit_cost_cents: 500 }]);
  });
});
