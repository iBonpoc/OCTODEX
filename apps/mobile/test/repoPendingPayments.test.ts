/**
 * unit:repoPendingPayments — step 20в: an online payment on its way (ACH, payments.status = pending) comes to the phone as
 * db.pendingPayments only — never in db.payments, so no sum, balance or report counts it (statusMap.paymentShown stays as is).
 */
import { describe, expect, it, vi } from "vitest";

const rows: Record<string, Record<string, unknown>[]> = {
  memberships: [{ user_id: "u-me", role: "office", status: "active", users: { full_name: "Olga Office" } }],
  customers: [{ id: "c-1", display_name: "Ann Client", status: "active" }],
  invoices: [{ id: "i-1", customer_id: "c-1", status: "sent", number: "INV-1", total_cents: 150000, paid_cents: 10000, kind: "final" }],
  payments: [
    { id: "p-ok", invoice_id: "i-1", customer_id: "c-1", method: "cash", amount_cents: 10000, refunded_cents: 0, status: "succeeded", received_at: "2026-11-08T10:00:00Z" },
    { id: "p-ach", invoice_id: "i-1", customer_id: "c-1", method: "ach", amount_cents: 140000, refunded_cents: 0, status: "pending", received_at: "2026-11-08T12:00:00Z" },
    { id: "p-fail", invoice_id: "i-1", customer_id: "c-1", method: "ach", amount_cents: 5000, refunded_cents: 0, status: "failed", received_at: "2026-11-08T11:00:00Z" },
    { id: "p-free", invoice_id: null, customer_id: "c-1", method: "ach", amount_cents: 7000, refunded_cents: 0, status: "pending", received_at: "2026-11-08T11:30:00Z" },
  ],
};
function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "order", "limit", "in", "not", "range", "gte"]) b[m] = () => b;
  b.then = (ok: (r: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(ok);
  return b;
}
vi.mock("../src/cloud/client", () => ({
  supabase: { from: (t: string) => builder(t), rpc: (fn: string) => (fn === "estimate_links" ? builder(fn) : Promise.resolve({ data: null, error: null })) },
}));
import { loadCompanyDB, pendingFromRows } from "../src/cloud/repo";

describe("ACH on its way", () => {
  it("is in pendingPayments only; payments and the invoice's paid sum stay as the server counted", async () => {
    const db = await loadCompanyDB("co-1", "u-me");
    expect(db.payments.map((p) => p.id)).toEqual(["p-ok"]);
    expect(db.pendingPayments).toEqual([{ id: "p-ach", invoiceId: "i-1", amountCents: 140000, method: "ach", at: "2026-11-08T12:00:00Z" }]);
    expect(db.invoices.find((i) => i.id === "i-1")?.paidCents).toBe(10000);
  });
  it("a failed payment or one without an invoice is not «processing»", () => {
    expect(pendingFromRows(rows.payments).map((p) => p.id)).toEqual(["p-ach"]);
    expect(pendingFromRows([])).toEqual([]);
  });
});
