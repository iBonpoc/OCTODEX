import { describe, expect, it } from "vitest";
import { docMoney, rowQtyLine, rowSum } from "../src/features/estimate/rowLine";
import { shownQty } from "../src/features/estimateDoc";

describe("rowQtyLine — «кол-во × цена» of a folded line (visual v2 №5)", () => {
  it("several — «120 sq ft × $1.50»", () => {
    expect(rowQtyLine({ quantity: "120", unit: "sq ft", unitPriceCents: 150 }, shownQty)).toBe("120 sq ft × $1.50");
    expect(rowQtyLine({ quantity: "12", unit: "ea", unitPriceCents: 1213 }, shownQty)).toBe("12 ea × $12.13");
  });
  it("one — «1 flat» (the sum says the price)", () => {
    expect(rowQtyLine({ quantity: "1", unit: "flat", unitPriceCents: 15000 }, shownQty)).toBe("1 flat");
  });
  it("no unit — the number alone", () => {
    expect(rowQtyLine({ quantity: "3", unit: "", unitPriceCents: 1000 }, shownQty)).toBe("3 × $10.00");
  });
  it("the sum with cents", () => {
    expect(rowSum(15000)).toBe("$150.00");
    expect(rowSum(14556)).toBe("$145.56");
  });
});

describe("docMoney — money of the estimate editor, always with cents (#2451, #2457)", () => {
  it("a whole sum keeps its cents: «$36.00», «$200.00», «$0.00» — not «$36» next to «$12.00 × 3»", () => {
    expect(docMoney(3600)).toBe("$36.00");
    expect(docMoney(20000)).toBe("$200.00");
    expect(docMoney(0)).toBe("$0.00");
  });
  it("cents and thousands as in US: «$1,234.56»; a minus is «−» (U+2212)", () => {
    expect(docMoney(123456)).toBe("$1,234.56");
    expect(docMoney(-2500)).toBe("−$25.00");
  });
  it("the row's sum is the same writing", () => expect(rowSum(3600)).toBe(docMoney(3600)));
});
