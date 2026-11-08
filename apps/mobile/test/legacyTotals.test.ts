/** The old quick estimate (no document): the phone shows what the server signs (core_rls T121 — the same numbers). */
import { describe, expect, it } from "vitest";
import { legacyForEstimate, legacyTotals, serverDepositRule } from "../src/cloud/legacyTotals";

const line = (lineTotalCents: number, x: Partial<{ taxable: boolean; optional: boolean; clientVisible: boolean }> = {}) =>
  ({ lineTotalCents, taxable: false, optional: false, clientVisible: true, ...x });
const plain = { taxEnabled: false, taxRateBps: null, depositRule: { kind: "pct", value: "0.1", contractType: "ca_hic" }, discountMode: null, discountValue: null };

describe("legacyTotals", () => {
  it("as estimate.add wrote it: $100.00 / 3 → 3 × $33.33 = $99.99; the old deposit rule has no bps — no deposit, as the server", () => {
    expect(legacyTotals([line(9999)], plain)).toEqual({ totalCents: 9999, depositCents: 0 });
  });
  it("the server's formula: discount, tax on the taxable part, deposit by bps; add-ons and hidden lines left out", () => {
    const v = { taxEnabled: true, taxRateBps: 825, depositRule: { kind: "pct", bps: 1000 }, discountMode: "pct", discountValue: 500 };
    expect(legacyTotals([line(9999), line(5000, { taxable: true }), line(7000, { optional: true }), line(4000, { clientVisible: false })], v)).toEqual({ totalCents: 14641, depositCents: 1464 });
  });
  it("a fixed discount, a fixed deposit above the total, taxable lines with the tax off, no lines", () => {
    const v = { taxEnabled: false, taxRateBps: 825, depositRule: { kind: "fixed", cents: 999999 }, discountMode: "fixed", discountValue: 1000 };
    expect(legacyTotals([line(9999, { taxable: true })], v)).toEqual({ totalCents: 8999, depositCents: 8999 });
    expect(legacyTotals([], plain)).toEqual({ totalCents: 0, depositCents: 0 });
  });
  it("deposit rules as the server reads them", () => {
    expect(serverDepositRule({ kind: "pct", bps: 1000 })).toEqual({ kind: "pct", bps: 1000 });
    expect(serverDepositRule({ kind: "fixed", cents: 5000 })).toEqual({ kind: "fixed", cents: 5000 });
    expect(serverDepositRule({ kind: "pct", value: "0.1" })).toEqual({ kind: "none" });
    expect(serverDepositRule(null)).toEqual({ kind: "none" });
    // the server casts the text: "1000" is 10% there too (review PR-B №6)
    expect(serverDepositRule({ kind: "pct", bps: "1000" })).toEqual({ kind: "pct", bps: 1000 });
    expect(serverDepositRule({ kind: "pct", bps: "ten" })).toEqual({ kind: "none" });
  });
});

describe("legacyForEstimate — the glue of repo.ts (director's review #420 №2)", () => {
  const ver = (id: string, x: Record<string, unknown> = {}) => [id, { id, calc_inputs: null, tax_enabled: false, tax_rate_bps: null, deposit_rule: null, ...x }] as [string, Record<string, unknown>];
  const versionOf = new Map([ver("vSent"), ver("vCur"), ver("vDoc", { calc_inputs: { options: [] } })]);
  const options = [
    { id: "oSentB", version_id: "vSent", position: 1, created_at: "2026-11-01T00:00:00Z" },
    { id: "oSentA2", version_id: "vSent", position: 0, created_at: "2026-11-02T00:00:00Z" },
    { id: "oSentA1", version_id: "vSent", position: 0, created_at: "2026-11-01T00:00:00Z" },
    { id: "oCur", version_id: "vCur", position: 0, created_at: "2026-11-03T00:00:00Z" },
    { id: "oDoc", version_id: "vDoc", position: 0, created_at: "2026-11-03T00:00:00Z" },
  ];
  const lines = [
    { option_id: "oSentA1", line_total_cents: 1000 }, { option_id: "oSentA2", line_total_cents: 2000 }, { option_id: "oSentB", line_total_cents: 3000 },
    { option_id: "oCur", line_total_cents: 4000 }, { option_id: "oDoc", line_total_cents: 5000 },
  ];
  const d = { versionOf, options, lines, signed: false };
  it("sent / viewed: the sent version, its first option by position, then created_at", () => {
    for (const status of ["sent", "viewed"]) expect(legacyForEstimate({ status, sent_version_id: "vSent", current_version_id: "vCur" }, d)).toEqual({ totalCents: 1000, depositCents: 0 });
  });
  it("any other status: the current version", () => {
    for (const status of ["draft", "declined", "expired"]) expect(legacyForEstimate({ status, sent_version_id: "vSent", current_version_id: "vCur" }, d)).toEqual({ totalCents: 4000, depositCents: 0 });
    expect(legacyForEstimate({ status: "sent", sent_version_id: null, current_version_id: "vCur" }, d)).toEqual({ totalCents: 4000, depositCents: 0 });
  });
  it("signed: what was signed (null here — repo takes the selection); a version with a document: null", () => {
    expect(legacyForEstimate({ status: "sent", sent_version_id: "vSent", current_version_id: "vCur" }, { ...d, signed: true })).toBeNull();
    expect(legacyForEstimate({ status: "draft", current_version_id: "vDoc" }, d)).toBeNull();
    expect(legacyForEstimate({ status: "draft", current_version_id: "nope" }, d)).toBeNull();
  });
});
