/**
 * Security-check (lead, 05.11): the client's address and number come from web forms and marketplaces,
 * so the estimate's «Письмо» / «SMS» never put them into a link raw (sendEstimate → contactLinks).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const opened: string[] = [];
vi.mock("react-native", () => ({ Platform: { OS: "ios" }, Linking: { openURL: async (u: string) => void opened.push(u) }, Share: {} }));
vi.mock("expo-clipboard", () => ({}));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));

import { openEmail, openSms } from "../src/features/sendEstimate";

beforeEach(() => void (opened.length = 0));

describe("estimate links: no injection through the client's address or number", () => {
  it("an address with ?cc=…&body=… opens nothing — no copy, no other letter", async () => {
    await openEmail("a@b.com?cc=x@evil.com&body=y", "Estimate", "Hello");
    expect(opened).toEqual([]);
  });
  it("a plain address: subject and body encoded, nothing else", async () => {
    await openEmail("rosa@example.com", "Estimate EST-1", "Hi & bye?");
    expect(opened).toEqual(["mailto:rosa@example.com?subject=Estimate%20EST-1&body=Hi%20%26%20bye%3F"]);
  });
  it("SMS: only digits and +; the body encoded; iOS separator", async () => {
    await openSms("+1 (916) 555-0101&body=x", "Link: https://x.test/p/t?a=1");
    expect(opened).toHaveLength(1);
    expect(opened[0]).toBe(`sms:+19165550101&body=${encodeURIComponent("Link: https://x.test/p/t?a=1")}`);
  });
});
