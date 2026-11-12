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
    const ch = taxChange(doc, { enabled: true, ratePpm: 102500 });
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
    const ch = taxChange(doc, {});
    expect(ch.ask).toEqual([{ name: "Good", was: 31000, will: 33000 }]);
    expect(ch.tax.groups).toEqual({ service: true, labor: true, material: true });
  });
  it("nothing changes in the sum → no question; an old estimate with the tax OFF and «only materials» asks when it is turned on", () => {
    const off = docWith({ ...partial, enabled: false });
    expect(taxChange(off, { enabled: false }).ask).toBeNull();
    expect(taxChange(off, { enabled: true }).ask).toEqual([{ name: "Good", was: 30000, will: 33000 }]);
  });
  it("the tax is one for Good / Better / Best: a change that moves only Better is asked about (not only the open option)", () => {
    const base = docWith(partial);
    const good: CustomOption = { id: "g", name: "Good", lines: [] }; // nothing to tax in it: the question would not come from it
    const better: CustomOption = { id: "b", name: "Better", lines: [L("m", "material", 10000), L("w2", "labor", 20000)] };
    const doc = { ...base, options: [good, better] };
    expect(taxChange(doc, {}).ask).toEqual([{ name: "Better", was: 31000, will: 33000 }]);
    // with only the empty option nothing moves: no question
    expect(taxChange({ ...base, options: [good] }, {}).ask).toBeNull();
  });
  it("«Не менять» is simply not applying: the document is as it was (the settings object is not touched)", () => {
    const doc = docWith(partial);
    const before = JSON.stringify(doc.settings);
    taxChange(doc, {});
    expect(JSON.stringify(doc.settings)).toBe(before);
  });
});

describe("unit:estimateTax — «as in the last estimate»", () => {
  const E = (id: string, tax: Partial<EstimateDoc["settings"]["tax"]>, savedAt?: string, sentAt?: string) => ({ id, savedAt, sentAt, doc: docWith(tax) }) as unknown as Estimate;
  it("the rate of the estimate saved LAST, whatever the order of the list (the cloud lists by id, a re-saved one keeps its place)", () => {
    const list = [
      E("z-late-id-old-save", { enabled: true, rateBps: 800 }, "2026-11-01T10:00:00Z"),
      E("a-early-id-new-save", { enabled: true, rateBps: 1025, ratePpm: 102500 }, "2026-11-12T10:00:00Z"),
      E("m", { enabled: true, rateBps: 900 }, "2026-11-05T10:00:00Z"),
    ];
    expect(lastTaxRatePpm(list)).toBe(102500);
    expect(lastTaxRatePpm([...list].reverse())).toBe(102500);
  });
  it("not the one being edited; the tax off does not count; none → nothing; no save mark → the send time, then the list's order", () => {
    const list = [E("a", { enabled: true, rateBps: 800 }, "2026-11-01T10:00:00Z"), E("b", { enabled: true, rateBps: 1025, ratePpm: 102500 }, "2026-11-12T10:00:00Z"), E("c", { enabled: false, rateBps: 900 }, "2026-11-13T10:00:00Z")];
    expect(lastTaxRatePpm(list, "b")).toBe(80000);
    expect(lastTaxRatePpm([E("c", { enabled: false, rateBps: 900 })])).toBeNull();
    expect(lastTaxRatePpm([])).toBeNull();
    expect(lastTaxRatePpm([E("s1", { enabled: true, rateBps: 700 }, undefined, "2026-11-02T00:00:00Z"), E("s2", { enabled: true, rateBps: 750 }, undefined, "2026-11-03T00:00:00Z")])).toBe(75000);
    expect(lastTaxRatePpm([E("x", { enabled: true, rateBps: 700 }), E("y", { enabled: true, rateBps: 750 })])).toBe(75000);
  });
});
