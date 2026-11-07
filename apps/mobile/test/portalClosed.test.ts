/**
 * 7а-3 (docs/specs/22 §3.5): the client signs or pays while the owner closes the company. The server says
 * «company closed» (42501); the page must not show that raw English text — it reloads and shows «closed» in the
 * client's language (security-check 07.11).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const answers: Record<string, { data: unknown; error: { message: string; code: string } | null }> = {};
const asked: string[] = [];
vi.mock("../src/cloud/client", () => ({
  supabase: { rpc: (fn: string) => (asked.push(fn), Promise.resolve(answers[fn] ?? { data: null, error: null })) },
}));

import { acceptPortal, fromRaw, isCompanyClosed, paySimulated } from "../src/cloud/portal";

const closed = { status: "closed", company: { name: "Sunset Gutters" }, doc_language: "es" };
const refused = { data: null, error: { message: "company closed", code: "42501" } };

afterEach(() => {
  asked.length = 0;
  for (const k of Object.keys(answers)) delete answers[k];
});

describe("unit:portalClosed — a company closed by its owner (S22a)", () => {
  it("signing refused as «company closed» → the page is read again: closed, in the client's language", async () => {
    answers.portal_accept = refused;
    answers.portal_estimate = { data: closed, error: null };
    const p = await acceptPortal("tok", { optionId: "o", addonIds: [], signer: "Ann", svg: "M0 0" });
    expect(asked).toEqual(["portal_accept", "portal_estimate"]);
    expect(p).toMatchObject({ status: "closed", lang: "es", company: { name: "Sunset Gutters" }, doc: null });
  });
  it("paying refused as «company closed» → the same", async () => {
    answers.portal_pay_simulated = refused;
    answers.portal_estimate = { data: closed, error: null };
    expect(await paySimulated("tok", "inv")).toMatchObject({ status: "closed", lang: "es" });
  });
  it("another refusal is still an error (not hidden as «closed»)", async () => {
    answers.portal_accept = { data: null, error: { message: "the estimate link has expired or was revoked", code: "22023" } };
    await expect(acceptPortal("tok", { optionId: "o", addonIds: [], signer: "Ann", svg: "M0 0" })).rejects.toThrow(/expired/);
    expect(asked).toEqual(["portal_accept"]);
  });
  it("the closed answer has no phone and no «Pay by card»", () => {
    const p = fromRaw(closed as never);
    expect(p.company.phone).toBeUndefined();
    expect(p.invoices).toEqual([]);
    expect(p.simulatedPay).toBe(false);
    expect(isCompanyClosed({ message: "company closed" })).toBe(true);
    expect(isCompanyClosed(null)).toBe(false);
  });
});
