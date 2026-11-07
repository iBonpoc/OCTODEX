import { describe, it, expect } from "vitest";
import { CA_WRITTEN_CONTRACT_THRESHOLD_CENTS, caWrittenContractRequired, invoicedCents, jobLinesBelowInvoiced } from "../src/caContract.js";
import { jobLinesTotals } from "../src/jobLines.js";

// test prices
const base = { companyState: "CA", propertyKind: "single_family", hasEstimate: false, totalCents: 50_001 } as const;

describe("CA written contract warning (B&P §7159, 17-job §11.1)", () => {
  it("$500.00 is not over, $500.01 is", () => {
    expect(CA_WRITTEN_CONTRACT_THRESHOLD_CENTS).toBe(50_000);
    expect(caWrittenContractRequired({ ...base, totalCents: 50_000 })).toBe(false);
    expect(caWrittenContractRequired({ ...base, totalCents: 50_001 })).toBe(true);
  });
  it("only in CA (any case), not commercial, not with an estimate", () => {
    expect(caWrittenContractRequired({ ...base, companyState: "ca " })).toBe(true);
    expect(caWrittenContractRequired({ ...base, companyState: "NV" })).toBe(false);
    expect(caWrittenContractRequired({ ...base, companyState: undefined })).toBe(false);
    expect(caWrittenContractRequired({ ...base, propertyKind: "commercial" })).toBe(false);
    expect(caWrittenContractRequired({ ...base, hasEstimate: true })).toBe(false);
  });
  it("an empty kind, multi-family and HOA common areas are warned (safer)", () => {
    for (const k of [undefined, null, "", "multi_family", "hoa_common"]) expect(caWrittenContractRequired({ ...base, propertyKind: k })).toBe(true);
  });
  it("the total comes from the engine: 3 × $166.67 = $500.01 → warned", () => {
    const t = jobLinesTotals([{ quantity: "3", unitPriceCents: 16_667 }], { enabled: false, rateBps: 0 });
    expect(t.total).toBe(50_001);
    expect(caWrittenContractRequired({ ...base, totalCents: t.total })).toBe(true);
  });
});

describe("job lines never go below what is invoiced (db T69)", () => {
  const inv = [{ totalCents: 30_000 }, { totalCents: 10_000, void: true }, { totalCents: 5_000 }];
  it("void invoices do not count", () => {
    expect(invoicedCents(inv)).toBe(35_000);
  });
  it("below — refused; equal or above — fine", () => {
    expect(jobLinesBelowInvoiced(34_999, inv)).toBe(true);
    expect(jobLinesBelowInvoiced(35_000, inv)).toBe(false);
    expect(jobLinesBelowInvoiced(0, [])).toBe(false);
  });
});
