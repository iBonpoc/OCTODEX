/**
 * unit:portalPayLimit — the client page reads stripe-pay's «too many tries» (docs/specs/35-stripe.md §4д): the code and how
 * long to wait, from the body or else from Retry-After; a 429 without a body is still «rate_limited».
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/cloud/client", () => ({ supabase: {} }));
import { startOnlinePay } from "@/cloud/portal";

const answer = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.fn(async () => new Response(body === undefined ? "" : JSON.stringify(body), { status, headers }));

afterEach(() => vi.unstubAllGlobals());

describe("startOnlinePay — the rate limit", () => {
  it("429 with a body: the code and the wait", async () => {
    vi.stubGlobal("fetch", answer(429, { error: "rate_limited", retryAfter: 250 }, { "Retry-After": "250" }));
    expect(await startOnlinePay("tok_0123456789abcdef", "a1950000-0000-4000-8000-000000000001")).toEqual({ state: "error", error: "rate_limited", retryAfterS: 250 });
  });
  it("429 without a body: still «too many», the wait from Retry-After", async () => {
    vi.stubGlobal("fetch", answer(429, undefined, { "Retry-After": "61" }));
    expect(await startOnlinePay("tok_0123456789abcdef", "a1950000-0000-4000-8000-000000000001")).toEqual({ state: "error", error: "rate_limited", retryAfterS: 61 });
  });
  it("another refusal keeps its own code and no wait", async () => {
    vi.stubGlobal("fetch", answer(409, { error: "nothing_to_pay" }));
    expect(await startOnlinePay("tok_0123456789abcdef", "a1950000-0000-4000-8000-000000000001")).toEqual({ state: "error", error: "nothing_to_pay" });
  });
});
