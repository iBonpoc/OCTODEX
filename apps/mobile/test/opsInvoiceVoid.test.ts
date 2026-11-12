/**
 * В1-5 (#1107): what invoice.void sends — only a sent invoice becomes void, with its reason (a retry after the server
 * already voided it changes nothing: the filter on status), and the server's refusal carries its hint to the card.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { table: string; update?: Record<string, unknown>; eq: [string, unknown][] }[] = [];
let answer: { error: { message: string; code?: string; hint?: string } | null; status?: number } = { error: null, status: 204 };
const chain = (table: string) => {
  const call: (typeof calls)[number] = { table, eq: [] };
  calls.push(call);
  const c: Record<string, unknown> = {
    update: (u: Record<string, unknown>) => ((call.update = u), c),
    eq: (k: string, v: unknown) => (call.eq.push([k, v]), c),
    then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(answer).then(ok, ko),
  };
  return c;
};
vi.mock("../src/cloud/client", () => ({ supabase: { from: (t: string) => chain(t), rpc: () => Promise.resolve({ data: null, error: null }), auth: {} } }));
import { applyOp, PermanentError } from "../src/cloud/ops";

const op = { k: "invoice.void", id: "inv-1", jobId: "job-1", reason: "Wrong amount", totalCents: 90000 } as Parameters<typeof applyOp>[0];
beforeEach(() => {
  calls.length = 0;
  answer = { error: null, status: 204 };
});

describe("unit:opsInvoiceVoid", () => {
  it("only the sent invoice becomes void, with the reason", async () => {
    await applyOp(op, "co", "u");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: "invoices", update: { status: "void", void_reason: "Wrong amount" } });
    expect(calls[0]!.eq).toEqual([["id", "inv-1"], ["status", "sent"]]);
  });
  it("the server's refusal (a payment came in) is for good and carries its hint", async () => {
    answer = { error: { message: "invoice has payments", code: "23514", hint: "invoice_has_payments" }, status: 400 };
    const e = await applyOp(op, "co", "u").then(() => undefined, (x: unknown) => x);
    expect(e).toBeInstanceOf(PermanentError);
    expect((e as PermanentError).hint).toBe("invoice_has_payments");
  });
});
