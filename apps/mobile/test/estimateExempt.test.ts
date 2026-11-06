/** A tax-exempt client's estimate (wave П-2a / 4a): the phone turns the sales tax off before it counts and saves. */
import { describe, expect, it } from "vitest";
import { exemptDoc, newDoc, optionTotals } from "../src/features/estimateDoc";
import type { EstimateDoc } from "../src/data/types";

const withTax = (): EstimateDoc => {
  const d = newDoc();
  d.settings.tax = { ...d.settings.tax, enabled: true, rateBps: 950, groups: { ...d.settings.tax.groups, material: true } };
  d.options[0]!.lines = [{ id: "a", group: "material", name: "Pipe", quantity: "2", unitPriceCents: 10000 } as never];
  return d;
};

describe("exemptDoc", () => {
  it("an exempt client: tax off, so the totals carry no tax; rate and groups stay", () => {
    const d = withTax();
    expect(optionTotals(d, d.options[0]!).tax).toBeGreaterThan(0);
    const x = exemptDoc(d, true);
    expect(x.settings.tax.enabled).toBe(false);
    expect(x.settings.tax.rateBps).toBe(950);
    expect(x.settings.tax.groups.material).toBe(true);
    expect(optionTotals(x, x.options[0]!).tax).toBe(0);
  });
  it("a client with tax keeps the estimate as it is (same object)", () => {
    const d = withTax();
    expect(exemptDoc(d, false)).toBe(d);
    expect(exemptDoc(d, undefined)).toBe(d);
  });
  it("does not change the document it gets", () => {
    const d = withTax();
    exemptDoc(d, true);
    expect(d.settings.tax.enabled).toBe(true);
  });
});
