/**
 * unit:estimateTax — the tax in the editor (Р6, #1097): a new estimate has none; on — on the whole amount; an old «by kind»
 * estimate asks «was / will be» before it changes; «as in the last estimate». The money is the engine's.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_TAX, taxRatePpm, type CustomLine, type CustomOption } from "@octo/estimating-engine";
import { newDoc, optionTotals } from "../src/features/estimateDoc";
import { isPartialTax, lastTaxRatePpm, taxChange, wholeTax } from "../src/features/estimateTax";
import type { Estimate, EstimateDoc } from "../src/data/types";

const L = (id: string, group: CustomLine["group"], cents: number): CustomLine => ({ id, name: id, group, quantity: "1", unit: "ea", unitPriceCents: cents });
const opt = (): CustomOption => ({ id: "o", name: "Good", lines: [L("m", "material", 10000), L("w", "labor", 20000)] });
const docWith = (tax: Partial<EstimateDoc["settings"]["tax"]>): EstimateDoc => {
  const d = newDoc();
  return { ...d, options: [opt()], settings: { ...d.settings, tax: { ...d.settings.tax, ...tax } } };
};

describe("unit:estimateTax — a new estimate", () => {
  it("has no tax; on — every group, one rate on the whole amount after the discount (no «by kind»)", () => {
    expect(DEFAULT_TAX.enabled).toBe(false);
    const doc = docWith({});
    expect(isPartialTax(doc.settings.tax)).toBe(false);
    const ch = taxChange(doc, doc.options[0]!, { enabled: true, ratePpm: 102500 });
    expect(ch.ask).toBeNull();
    expect(ch.tax).toMatchObject({ enabled: true, groups: { service: true, labor: true, material: true } });
    expect(taxRatePpm(ch.tax)).toBe(102500);
    // 10.25 % of $300.00 = $30.75, once
    const d2 = { ...doc, settings: { ...doc.settings, tax: ch.tax } };
    expect(optionTotals(d2, d2.options[0]!).tax).toBe(3075);
  });
  it("a rate with three decimals keeps them: 8.875 % → 88750 ppm and 888/889 basis points beside it (#1229)", () => {
    const t = wholeTax(DEFAULT_TAX, { enabled: true, ratePpm: 88750 });
    expect(taxRatePpm(t)).toBe(88750);
    expect(t.rateBps).toBe(888);
  });
});

describe("unit:estimateTax — an old estimate with tax only on some kinds", () => {
  const partial = { enabled: true, rateBps: 1000, groups: { service: false, labor: false, material: true } };
  it("is recognised", () => {
    expect(isPartialTax(partial)).toBe(true);
  });
  it("turning on / a new rate changes the client's sum: it asks first, with was and will be (the engine's numbers)", () => {
    const doc = docWith(partial);
    const was = optionTotals(doc, doc.options[0]!).total; // 10 % of the materials only: $10.00
    expect(was).toBe(31000);
    const ch = taxChange(doc, doc.options[0]!, {});
    expect(ch.ask).toEqual({ was: 31000, will: 33000 });
    expect(ch.tax.groups).toEqual({ service: true, labor: true, material: true });
  });
  it("nothing changes in the sum → no question", () => {
    const doc = docWith({ ...partial, enabled: false });
    expect(taxChange(doc, doc.options[0]!, { enabled: false }).ask).toBeNull();
  });
  it("«Не менять» is simply not applying: the document is as it was (the settings object is not touched)", () => {
    const doc = docWith(partial);
    const before = JSON.stringify(doc.settings);
    taxChange(doc, doc.options[0]!, {});
    expect(JSON.stringify(doc.settings)).toBe(before);
  });
});

describe("unit:estimateTax — «as in the last estimate»", () => {
  const E = (id: string, tax: Partial<EstimateDoc["settings"]["tax"]>) => ({ id, doc: docWith(tax) }) as unknown as Estimate;
  it("the rate of the latest saved estimate with the tax on; not the one being edited; none → nothing", () => {
    const list = [E("a", { enabled: true, rateBps: 800 }), E("b", { enabled: true, rateBps: 1025, ratePpm: 102500 }), E("c", { enabled: false, rateBps: 900 })];
    expect(lastTaxRatePpm(list)).toBe(102500);
    expect(lastTaxRatePpm(list, "b")).toBe(80000);
    expect(lastTaxRatePpm([E("c", { enabled: false, rateBps: 900 })])).toBeNull();
    expect(lastTaxRatePpm([])).toBeNull();
  });
});
