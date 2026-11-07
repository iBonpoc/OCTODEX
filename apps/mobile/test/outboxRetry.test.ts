/** The outbox without the network (rule 6, cloud e2e 104): what is a network failure, the pause between tries. */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/cloud/client", () => ({ supabase: {} }));
import { PermanentError } from "../src/cloud/ops";
import { backoffMs, isNetworkError, RETRY_FIRST_MS, RETRY_MAX_MS } from "../src/data/outboxRetry";

describe("unit:outboxRetry", () => {
  it("no network, no answer, a timeout or an abort is a network failure (not a try)", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true); // the browser
    expect(isNetworkError(new TypeError("Network request failed"))).toBe(true); // React Native
    expect(isNetworkError(new Error("TypeError: Failed to fetch"))).toBe(true); // supabase-js passes the text on
    expect(isNetworkError(new Error("Load failed"))).toBe(true); // Safari
    expect(isNetworkError(new Error("fetch failed"))).toBe(true); // node
    expect(isNetworkError(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }))).toBe(true);
    expect(isNetworkError(new Error("request timed out"))).toBe(true);
    expect(isNetworkError("Failed to fetch")).toBe(true);
  });
  it("an answer of the server is not: a refusal, an error, a broken row", () => {
    expect(isNetworkError(new PermanentError("new row violates row-level security policy"))).toBe(false);
    expect(isNetworkError(new PermanentError("Failed to fetch"))).toBe(false); // permanent wins
    expect(isNetworkError(new Error("upstream 503 from the server"))).toBe(false);
    expect(isNetworkError(new Error("JWT expired"))).toBe(false);
    expect(isNetworkError(new Error("duplicate key value"))).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
  it("the pause grows 1.5 s, 3 s, 6 s … and stops at 60 s", () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([1500, 3000, 6000, 12000]);
    expect(backoffMs(0)).toBe(RETRY_FIRST_MS);
    expect(backoffMs(7)).toBe(RETRY_MAX_MS);
    expect(backoffMs(50)).toBe(RETRY_MAX_MS);
  });
});
