/**
 * unit:portalOnlinePay — step 20в: what the client page reads from portal_estimate. Online payment only when the server says
 * so (an older server has no field: none); a closed company never; ACH on its way per invoice, a bad value is 0.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("../src/cloud/client", () => ({ supabase: {} }));
import { fromRaw } from "../src/cloud/portal";

const base = { status: "approved", invoices: [{ id: "i1", kind: "final", total: 150000, paid: 0 }, { id: "i2", kind: "progress", total: 500, paid: 0 }] };
describe("portal: online payment fields", () => {
  it("on, with ACH on its way", () => {
    const d = fromRaw({ ...base, online_pay: true, pending: { i1: 40000, i2: "x" as unknown as number } } as never);
    expect(d.onlinePay).toBe(true);
    expect(d.invoices.map((i) => i.pendingCents)).toEqual([40000, 0]);
  });
  it("an older server: no online payment, nothing on its way", () => {
    const d = fromRaw(base as never);
    expect(d.onlinePay).toBe(false);
    expect(d.invoices.every((i) => i.pendingCents === 0)).toBe(true);
  });
  it("a closed company: never", () => {
    expect(fromRaw({ ...base, status: "closed", online_pay: true } as never).onlinePay).toBe(false);
  });
});
