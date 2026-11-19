/**
 * unit:itemVariantOps — #2227 PR2: catalog.variant goes to the server as catalog_set_variant (migration 20261117620000, PR1
 * #2239) with every argument; null data removes the value. The queue keeps it after the item's own save (FIFO).
 */
import { describe, expect, it, vi } from "vitest";

const calls: { name: string; args: Record<string, unknown> }[] = [];
vi.mock("@/cloud/client", () => ({
  supabase: { rpc: (name: string, args: Record<string, unknown>) => (calls.push({ name, args }), Promise.resolve({ data: null, error: null, status: 200 })) },
}));
import { applyOp } from "../src/cloud/ops";
import { createdBy, refsOf, uuidsOf } from "../src/data/outboxDeps";

describe("unit:itemVariantOps — #2227 PR2", () => {
  it("one value with its data; null data removes it", async () => {
    await applyOp({ k: "catalog.variant", itemId: "g", attr: "color", value: "white", data: { sku: "W-1" } }, "c1", "u1");
    expect(calls.at(-1)).toEqual({ name: "catalog_set_variant", args: { p_item: "g", p_attr: "color", p_value: "white", p_data: { sku: "W-1" } } });
    await applyOp({ k: "catalog.variant", itemId: "g", attr: "color", value: "white", data: null }, "c1", "u1");
    expect(calls.at(-1)!.args).toEqual({ p_item: "g", p_attr: "color", p_value: "white", p_data: null });
  });
  it("it makes no object; it is about the item (waits behind its save) and refers to the variant's new supplier", () => {
    const item = "0b5c3b2e-1111-4000-8000-000000000001";
    const sup = "0b5c3b2e-2222-4000-8000-000000000002";
    const op = { k: "catalog.variant" as const, itemId: item, attr: "color", value: "white", data: { supplierId: sup } };
    expect([...createdBy(op)]).toEqual([]);
    expect(uuidsOf(op).has(item)).toBe(true);
    expect(refsOf(op).has(sup)).toBe(true);
  });
});
