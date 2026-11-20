/**
 * unit:groupPriceOps — #1913 PR2: catalog.groupPrice goes to the server as catalog_set_group_price (migration
 * 20261117210000, PR1 #1978) with every argument; «changed first» comes back as a refusal the queue does not retry.
 */
import { describe, expect, it, vi } from "vitest";

const calls: { name: string; args: Record<string, unknown> }[] = [];
const next = { error: null as null | { message: string; code?: string; hint?: string } };
vi.mock("@/cloud/client", () => ({
  supabase: { rpc: (name: string, args: Record<string, unknown>) => (calls.push({ name, args }), Promise.resolve({ data: 2, error: next.error, status: next.error ? 409 : 200 })) },
}));
import { applyOp } from "../src/cloud/ops";
import { classify } from "../src/data/outboxRetry";

describe("unit:groupPriceOps — #1913 PR2", () => {
  it("every argument, the costs only when given", async () => {
    await applyOp({ k: "catalog.groupPrice", itemId: "w", group: "g", priceCents: 1000, placeholder: false, costCents: 500, vendorTaxBps: 0, markupBps: 10000,
      expectedPriceCents: 800, expectedCostCents: 400, expectedTaxBps: 0, expectedMarkupBps: 10000 }, "c1", "u1");
    expect(calls.at(-1)).toEqual({ name: "catalog_set_group_price", args: {
      p_item_id: "w", p_price_cents: 1000, p_placeholder: false, p_cost_cents: 500, p_tax_bps: 0, p_markup_bps: 10000,
      p_expected_price_cents: 800, p_expected_cost_cents: 400, p_expected_tax_bps: 0, p_expected_markup_bps: 10000 } });
    await applyOp({ k: "catalog.groupPrice", itemId: "w", group: "g", priceCents: 1000, placeholder: true, expectedPriceCents: 800 }, "c1", "u1");
    expect(calls.at(-1)!.args).toMatchObject({ p_cost_cents: null, p_tax_bps: null, p_markup_bps: null, p_expected_cost_cents: null, p_placeholder: true });
  });

  it("«changed first» (40001 row_version_conflict) is a refusal, not «try later»", async () => {
    next.error = { message: "the group's price changed meanwhile", code: "40001", hint: "row_version_conflict" };
    const e = await applyOp({ k: "catalog.groupPrice", itemId: "w", group: "g", priceCents: 1, placeholder: false, expectedPriceCents: 800 }, "c1", "u1").catch((x: unknown) => x);
    expect(classify(e)).toBe("refusal");
    next.error = null;
  });
});
