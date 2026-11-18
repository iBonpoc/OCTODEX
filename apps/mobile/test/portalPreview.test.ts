/**
 * #2020 — «open as client»: the office's own look at the client's page only shows (docs/15-story-map.md §7 п.9: scenarios
 * ДАНО / КОГДА / ТОГДА, the test carries the scenario's number).
 * С1 ДАНО a cloud company's estimate on the phone, КОГДА the office opens it «as client», ТОГДА the page is a preview with no card button.
 * С2 ДАНО the demo (no cloud), КОГДА the same, ТОГДА the page works as the client's (card simulation on, not a preview).
 * С3 ДАНО the server's answer, КОГДА simulated_pay is missing or false, ТОГДА no card button; only true offers it.
 * С4 ДАНО any caller of portalFromEstimate that does not say «demo» (the PDF), ТОГДА closed by default: a preview, no card button.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/cloud/client", () => ({ supabase: {} }));

import { fromRaw, localPortal, portalFromEstimate } from "@/cloud/portal";
import { makeSeed } from "../src/data/seed";
import type { DB, Estimate } from "../src/data/types";

function withSent(): { db: DB; e: Estimate } {
  const db = makeSeed();
  const c = db.customers[0]!;
  const e: Estimate = {
    id: "eP", customerId: c.id, propertyId: db.properties.find((p) => p.customerId === c.id)?.id ?? db.properties[0]!.id,
    title: "Porch", totalCents: 10000, status: "sent", sentAt: new Date().toISOString(), number: "EST-0472", token: "tok_preview_0123456789",
  } as Estimate;
  db.estimates = [...db.estimates, e];
  return { db, e };
}

type Raw = Parameters<typeof fromRaw>[0];
const raw = { title: "Gutters", status: "approved", invoices: [{ id: "i1", kind: "final", total: 1000, paid: 0 }] } as unknown as Raw;

describe("#2020 «open as client»: the preview only shows", () => {
  it("С1 a cloud company: a preview, no card simulation", () => {
    const { db } = withSent();
    const p = localPortal(db, "tok_preview_0123456789", "Co", false)!;
    expect(p.source).toBe("local");
    expect(p.preview).toBe(true);
    expect(p.simulatedPay).toBe(false);
  });
  it("С2 the demo: the client's page as before", () => {
    const { db } = withSent();
    const p = localPortal(db, "tok_preview_0123456789", "Co", true)!;
    expect(p.preview).toBe(false);
    expect(p.simulatedPay).toBe(true);
  });
  it("С3 the server: only an explicit true offers the card", () => {
    expect(fromRaw(raw).simulatedPay).toBe(false);
    expect(fromRaw({ ...raw, simulated_pay: false }).simulatedPay).toBe(false);
    expect(fromRaw({ ...raw, simulated_pay: null } as unknown as Raw).simulatedPay).toBe(false);
    expect(fromRaw({ ...raw, simulated_pay: true }).simulatedPay).toBe(true);
    expect(fromRaw({ ...raw, simulated_pay: true }).preview).toBeFalsy();
  });
  it("С4 not told demo: closed by default", () => {
    const { db, e } = withSent();
    const p = portalFromEstimate(db, e, "Co");
    expect(p.preview).toBe(true);
    expect(p.simulatedPay).toBe(false);
    expect(localPortal(db, "tok_preview_0123456789", "Co")!.simulatedPay).toBe(false);
  });
});
