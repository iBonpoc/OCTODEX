/** The amount on an estimate's list card (agreed with the list-cards chat, 05.11). */
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, estimateListAmount, newLine, newOption, optionTotals } from "../src/features/estimateDoc";
import type { EstimateDoc } from "../src/data/types";

const doc = (prices: number[]): EstimateDoc => ({
  options: prices.map((p, i) => ({ ...newOption(i, [newLine("labor", { unitPriceCents: p })]), id: `o${i}` })),
  settings: { ...DEFAULT_SETTINGS, tax: { ...DEFAULT_SETTINGS.tax, rateBps: 0 }, deposit: { kind: "none" } },
});

describe("estimateListAmount", () => {
  it("several options, not signed: «from» the cheapest", () => {
    const d = doc([30000, 12000, 50000]);
    expect(estimateListAmount({ status: "sent", doc: d, totalCents: 30000 })).toEqual({ cents: optionTotals(d, d.options[1]!).total, from: true });
    expect(estimateListAmount({ status: "sent", doc: d, totalCents: 30000 }).cents).toBe(12000);
  });
  it("signed by the client (awaiting or approved): what the client signed, with the option's name", () => {
    const d = doc([30000, 12000]);
    const approval = { optionId: "o0", addonIds: [], signerName: "X", signature: "M0 0", at: "2026-11-05T10:00:00Z", channel: "portal" as const, totalCents: 31500, depositCents: 0 };
    for (const status of ["awaiting_countersign", "approved"] as const)
      expect(estimateListAmount({ status, doc: d, totalCents: 30000, approval })).toEqual({ cents: 31500, from: false, option: d.options[0]!.name });
  });
  it("one option or a quick estimate without options: the estimate total", () => {
    expect(estimateListAmount({ status: "sent", doc: doc([20000]), totalCents: 20000 })).toEqual({ cents: 20000, from: false });
    expect(estimateListAmount({ status: "draft", totalCents: 9900 })).toEqual({ cents: 9900, from: false });
  });
});
