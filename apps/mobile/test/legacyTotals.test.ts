/** The old quick estimate (no document): the phone shows what the server signs (core_rls T112 — the same numbers). */
import { describe, expect, it } from "vitest";
import { legacyTotals, serverDepositRule } from "../src/cloud/legacyTotals";

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
  it("deposit rules as the server reads them", () => {
    expect(serverDepositRule({ kind: "pct", bps: 1000 })).toEqual({ kind: "pct", bps: 1000 });
    expect(serverDepositRule({ kind: "fixed", cents: 5000 })).toEqual({ kind: "fixed", cents: 5000 });
    expect(serverDepositRule({ kind: "pct", value: "0.1" })).toEqual({ kind: "none" });
    expect(serverDepositRule(null)).toEqual({ kind: "none" });
  });
});
