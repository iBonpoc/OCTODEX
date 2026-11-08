/**
 * unit:cloudRefund — the app's side of a refund (step 20д, cloud/refund.ts; review 20д-2 №1, №4): our words for the
 * server's answers, and «no answer» never reads as a final «no» — the sheet keeps the same key, so a lost answer is never
 * a second refund (FINAL_REFUSALS).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("../src/cloud/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), auth: { getSession: async () => ({ data: { session: { access_token: "jwt" } } }) } },
}));
vi.mock("../src/config/backend", () => ({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "pk" }));
import { refundRecord, refundStripe } from "../src/cloud/refund";
import { FINAL_REFUSALS } from "../src/features/payments/refund";

const ASK = { paymentId: "p1", amountCents: 1000, reasonKind: "goodwill" as const, reason: null, key: "rf-key-0001" };
const fetchAnswer = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => ({ status, json: async () => (body === undefined ? Promise.reject(new Error("no json")) : body) })));

beforeEach(() => {
  rpc.mockReset();
  vi.unstubAllGlobals();
});

describe("unit:cloudRefund — a record (refund_record)", () => {
  it("the row → ok with tax and revenue; the key goes as it is", async () => {
    rpc.mockResolvedValue({ data: { id: "r1", status: "succeeded", tax_cents: 40, net_cents: 960 }, error: null });
    expect(await refundRecord(ASK)).toEqual({ ok: true, status: "succeeded", taxCents: 40, netCents: 960 });
    expect(rpc).toHaveBeenCalledWith("refund_record", expect.objectContaining({ p_key: "rf-key-0001", p_amount_cents: 1000 }));
  });
  it("the database's words → ours; 42501 → not allowed", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "refund_above_available" } });
    expect(await refundRecord(ASK)).toEqual({ ok: false, error: "refund_above_available" });
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "only owner/admin can refund" } });
    expect(await refundRecord(ASK)).toEqual({ ok: false, error: "not_allowed" });
    // spec 35 §4г: 42501 «the company is closed» — its own words, a final no
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "the company is closed" } });
    expect(await refundRecord(ASK)).toEqual({ ok: false, error: "company_closed" });
    expect(FINAL_REFUSALS).toContain("company_closed");
  });
  it("no answer (no SQLSTATE: the network) or a throw → «later», never a final no", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "", message: "TypeError: Failed to fetch" } });
    const a = await refundRecord(ASK);
    expect(a).toEqual({ ok: false, error: "retry_later" });
    rpc.mockRejectedValue(new Error("boom"));
    expect(await refundRecord(ASK)).toEqual({ ok: false, error: "retry_later" });
    expect(FINAL_REFUSALS).not.toContain("retry_later");
    expect(FINAL_REFUSALS).not.toContain("failed");
    expect(FINAL_REFUSALS).not.toContain("offline");
  });
});

describe("unit:cloudRefund — through Stripe (the edge function)", () => {
  it("the refund → ok; pending stays pending", async () => {
    fetchAnswer(200, { refund: { id: "r1", status: "pending", tax_cents: 0, net_cents: 1000 } });
    expect(await refundStripe(ASK)).toEqual({ ok: true, status: "pending", taxCents: 0, netCents: 1000 });
  });
  it("its error comes before its refund; Stripe's no → stripe_refused; 403 → not allowed", async () => {
    fetchAnswer(200, { error: "retry_later", refund: { status: "pending" } });
    expect(await refundStripe(ASK)).toEqual({ ok: false, error: "retry_later" });
    fetchAnswer(200, { refund: { status: "failed" } });
    expect(await refundStripe(ASK)).toEqual({ ok: false, error: "stripe_refused" });
    fetchAnswer(403, { error: "not_allowed" });
    expect(await refundStripe(ASK)).toEqual({ ok: false, error: "not_allowed" });
    fetchAnswer(403, { error: "company_closed" });
    expect(await refundStripe(ASK)).toEqual({ ok: false, error: "company_closed" });
  });
  it("a gateway (5xx without JSON), a crash or a timeout → «later» with the same key", async () => {
    fetchAnswer(502, undefined);
    expect(await refundStripe(ASK)).toEqual({ ok: false, error: "retry_later" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("aborted"); }));
    expect(await refundStripe(ASK)).toEqual({ ok: false, error: "retry_later" });
  });
});
