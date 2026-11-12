import { describe, it, expect } from "vitest";
import { bpsFromPpm, ppmOk, taxRatePpm } from "../src/decimal.js";
import { computeOption } from "../src/estimate.js";
import { computeCustomOption, parsePctToPpm, ppmToPctText, DEFAULT_TAX, type CustomSettings } from "../src/custom.js";
import { jobLinesTotals } from "../src/jobLines.js";

// #1219: a tax rate with three decimals. The same numbers in the database: supabase/tests/core_rls.sql T201. Test prices.
const S = (tax: Partial<CustomSettings["tax"]>): CustomSettings => ({
  discount: null, deposit: { kind: "none" }, tax: { ...DEFAULT_TAX, enabled: true, ...tax },
});
const opt = { id: "o", name: "A", lines: [{ id: "l", name: "Work", group: "labor" as const, quantity: "1", unit: "ea", unitPriceCents: 100000 }] };

describe("tax rate in ppm (#1219)", () => {
  it("$1000 × 8.875 % = $88.75 (the basis points gave 8.88 % = $88.80)", () => {
    expect(computeCustomOption(opt, S({ rateBps: 888, ratePpm: 88750 })).tax).toBe(8875);
    expect(computeCustomOption(opt, S({ rateBps: 888 })).tax).toBe(8880);
  });
  it("7.375 % and 9.125 %: round half up on the cents", () => {
    // 12345 × 0.07375 = 910.44 → 910; 12345 × 0.09125 = 1126.48 → 1126; 20000 × 0.07375 = 1475
    const t = (cents: number, p: number) => computeOption([{ name: "x", quantity: 1, unitPriceCents: cents, taxable: true }], { mode: "added_on_top", enabled: true, rateBps: bpsFromPpm(p), ratePpm: p }).tax;
    expect(t(12345, 73750)).toBe(910);
    expect(t(12345, 91250)).toBe(1126);
    expect(t(20000, 73750)).toBe(1475);
    expect(t(200, 73750)).toBe(15); // 14.75 → 15
  });
  it("an older document (only rateBps) counts as before", () => {
    expect(taxRatePpm({ rateBps: 950 })).toBe(95000);
    expect(computeCustomOption(opt, S({ rateBps: 950 })).tax).toBe(9500);
  });
  it("a broken ratePpm is not trusted: the basis points count", () => {
    for (const bad of [-1, 1.5, 1_000_001, Number.NaN]) expect(taxRatePpm({ rateBps: 950, ratePpm: bad })).toBe(95000);
    // the rate changed by something that writes only the basis points (the estimate editor, an older phone): the ppm
    // left behind does not round to them — stale, the basis points count
    expect(taxRatePpm({ rateBps: 950, ratePpm: 88750 })).toBe(95000);
    expect(taxRatePpm({ rateBps: 888, ratePpm: 88750 })).toBe(88750);
    // no basis points: 0 — the server the same (app.doc_tax_ppm, T201)
    expect(taxRatePpm({ ratePpm: 88750 } as unknown as { rateBps: number; ratePpm: number })).toBe(0);
    expect(ppmOk(0) && ppmOk(1_000_000) && !ppmOk("88750")).toBe(true);
  });
  it("the basis points next to ppm: round half up, as the server", () => {
    expect(bpsFromPpm(88750)).toBe(888);
    expect(bpsFromPpm(73750)).toBe(738);
    expect(bpsFromPpm(88749)).toBe(887);
    expect(bpsFromPpm(95000)).toBe(950);
  });
  it("a job's own lines take ppm too", () => {
    expect(jobLinesTotals([{ quantity: "1", unitPriceCents: 100000, taxable: true }], { enabled: true, rateBps: 888, ratePpm: 88750 }).tax).toBe(8875);
  });
  it("the input: three (four) decimals, comma, percent sign; more decimals or above 100 % — refused", () => {
    expect(parsePctToPpm("8.875")).toBe(88750);
    expect(parsePctToPpm("8,875 %")).toBe(88750);
    expect(parsePctToPpm("9.5")).toBe(95000);
    expect(parsePctToPpm("0.0001")).toBe(1);
    expect(parsePctToPpm("100")).toBe(1_000_000);
    expect(parsePctToPpm("8.87501")).toBeNull();
    expect(parsePctToPpm("100.01")).toBeNull();
    expect(parsePctToPpm("abc")).toBeNull();
    expect(ppmToPctText(88750)).toBe("8.875");
    expect(ppmToPctText(95000)).toBe("9.5");
    expect(ppmToPctText(0)).toBe("0");
  });
});
