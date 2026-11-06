/**
 * Security audit 06.11, item 2 (docs/specs/19-db-security.md §3): «Pay by card» on /p/ is a simulation until Stripe;
 * the server offers it only for a demo company (portal_estimate.simulated_pay).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/cloud/client", () => ({ supabase: {} }));

import { fromRaw } from "@/cloud/portal";

type Raw = Parameters<typeof fromRaw>[0];
const base = { title: "Gutters", status: "approved", invoices: [{ id: "i1", kind: "final", total: 1000, paid: 0 }] } as unknown as Raw;

describe("client page: the card button only where the server allows it", () => {
  it("a real company (simulated_pay false): no button", () => {
    expect(fromRaw({ ...base, simulated_pay: false }).simulatedPay).toBe(false);
  });
  it("a demo company (simulated_pay true): the button", () => {
    expect(fromRaw({ ...base, simulated_pay: true }).simulatedPay).toBe(true);
  });
  it("an older server without the field: as before", () => {
    expect(fromRaw(base).simulatedPay).toBe(true);
  });
});
