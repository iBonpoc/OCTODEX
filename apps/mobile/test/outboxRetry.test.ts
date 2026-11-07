/** The outbox without the network (rule 6, cloud e2e 104): what is a network failure, the pause between tries. */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/cloud/client", () => ({ supabase: {} }));
import { PermanentError } from "../src/cloud/ops";
import { backoffMs, classify, isNetworkError, needsSignIn, RETRY_FIRST_MS, RETRY_MAX_MS } from "../src/data/outboxRetry";
import { ServerError } from "../src/cloud/ops";

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
  it("an answer of the server is never «network», whatever its text (review #244 №4)", () => {
    expect(isNetworkError(new PermanentError("new row violates row-level security policy", 403, "42501"))).toBe(false);
    expect(isNetworkError(new PermanentError("Failed to fetch"))).toBe(false); // our own «will not change»
    expect(isNetworkError(new ServerError("current transaction is aborted, commands ignored", 400, "25P02"))).toBe(false);
    expect(isNetworkError(new ServerError("canceling statement due to statement timeout", 500, "57014"))).toBe(false);
    expect(isNetworkError(new Error("duplicate key value"))).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
  it("«not now» from the server is transient: 5xx, 408, 429, 401, an expired JWT, a restart, a deadlock", () => {
    for (const st of [500, 502, 503, 504, 408, 429, 401]) expect(classify(new ServerError("x", st, ""))).toBe("transient");
    for (const code of ["PGRST301", "PGRST000", "40001", "40P01", "57P01", "57P03", "53300", "08006", "57014"]) expect(classify(new ServerError("x", 400, code))).toBe("transient");
    expect(classify({ message: "JWT expired", code: "PGRST301" })).toBe("transient"); // a raw PostgREST error object
    expect(needsSignIn(new ServerError("JWT expired", 401, "PGRST301"))).toBe(true);
    expect(needsSignIn(new ServerError("x", 503, ""))).toBe(false);
  });
  it("«no» from the server is a refusal: other 4xx, permission / constraint / data codes", () => {
    for (const st of [400, 403, 404, 409, 422]) expect(classify(new ServerError("x", st, ""))).toBe("refusal");
    for (const code of ["42501", "23505", "22P02", "P0001", "25P02"]) expect(classify(new ServerError("x", 400, code))).toBe("refusal");
    expect(classify(new ServerError("TypeError: Failed to fetch", 0, ""))).toBe("network"); // status 0: no answer
    expect(classify(new Error("something odd"))).toBe("refusal");
  });
  it("the pause grows 1.5 s, 3 s, 6 s … and stops at 60 s", () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([1500, 3000, 6000, 12000]);
    expect(backoffMs(0)).toBe(RETRY_FIRST_MS);
    expect(backoffMs(7)).toBe(RETRY_MAX_MS);
    expect(backoffMs(50)).toBe(RETRY_MAX_MS);
  });
});
