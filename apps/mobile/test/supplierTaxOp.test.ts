/**
 * unit:supplierTaxOp — #1834 (spec 54 §13): the supplier's tax goes to the server through the one door supplier_set_tax with the
 * rate the phone saw; «changed first» comes back as a refusal (no retry), drops this and the later tax writes of the supplier and
 * leaves one card. Scenarios С2 (the stale rate) and С6 (the queue) of the spec.
 */
import { describe, expect, it, vi } from "vitest";

const calls: { name: string; args: Record<string, unknown> }[] = [];
const next = { error: null as null | { message: string; code?: string; hint?: string } };
vi.mock("@/cloud/client", () => ({
  supabase: { rpc: (name: string, args: Record<string, unknown>) => (calls.push({ name, args }), Promise.resolve({ data: 2, error: next.error, status: next.error ? 409 : 200 })) },
}));
import { applyOp } from "../src/cloud/ops";
import { classify } from "../src/data/outboxRetry";
import { dropSupplierTaxOps, supplierTaxRejected } from "../src/data/outboxRejected";
import type { OwnedItem } from "../src/data/outboxOwner";

const who = { userId: "u1", companyId: "c1" };
const item = (id: string, supplierId: string, taxBps: number | null, seenBps: number | null): OwnedItem =>
  ({ id, tries: 0, op: { k: "supplier.tax", supplierId, taxBps, seenBps }, owner: who }) as unknown as OwnedItem;

describe("unit:supplierTaxOp — #1834", () => {
  it("С6. ДАНО правка ставки в очереди. КОГДА уходит на сервер. ТОГДА supplier_set_tax с ставкой и той, что видел телефон", async () => {
    await applyOp({ k: "supplier.tax", supplierId: "s1", taxBps: 900, seenBps: 825 }, "c1", "u1");
    expect(calls.at(-1)).toEqual({ name: "supplier_set_tax", args: { p_supplier: "s1", p_tax_bps: 900, p_seen_bps: 825 } });
    await applyOp({ k: "supplier.tax", supplierId: "s1", taxBps: null, seenBps: null }, "c1", "u1");
    expect(calls.at(-1)!.args).toEqual({ p_supplier: "s1", p_tax_bps: null, p_seen_bps: null });
  });
  it("С2. ДАНО телефон видел 8,25 %, у сервера 9 % (40001 row_version_conflict). КОГДА ответ пришёл. ТОГДА отказ без повторов", async () => {
    next.error = { message: "the supplier's tax changed meanwhile", code: "40001", hint: "row_version_conflict" };
    const e = await applyOp({ k: "supplier.tax", supplierId: "s1", taxBps: 1000, seenBps: 825 }, "c1", "u1").catch((x: unknown) => x);
    expect(classify(e)).toBe("refusal");
    next.error = null;
  });
  it("С2. ДАНО отказ. КОГДА чистится очередь. ТОГДА уходят эта и поздние правки ставки того же поставщика, чужие остаются; одна карточка с ссылкой на поставщика", () => {
    const q = [item("a", "s1", 1000, 825), item("b", "s1", 1100, 1000), item("c", "s2", 500, null)];
    const { kept, gone } = dropSupplierTaxOps(q, "s1", who);
    expect(gone.map((x) => x.id)).toEqual(["a", "b"]);
    expect(kept.map((x) => x.id)).toEqual(["c"]);
    const card = supplierTaxRejected([], gone, "boom", Date.parse("2026-11-17T12:00:00Z"), who);
    expect(card).toHaveLength(1);
    expect(card[0]).toMatchObject({ kind: "supplier.tax", what: "supplier", href: "/suppliers/s1", labelKey: "sup.rej.taxStale" });
    // a second refusal of the same supplier replaces the card, not adds one
    expect(supplierTaxRejected(card, gone, "boom", Date.parse("2026-11-17T12:01:00Z"), who)).toHaveLength(1);
  });
  it("supplier_tax_too_many (54000, a supplier with over 1000 items) is a refusal, not «try later» (a queue stuck on it)", () => {
    expect(classify({ code: "54000", hint: "supplier_tax_too_many", status: 500 })).toBe("refusal");
  });
});
