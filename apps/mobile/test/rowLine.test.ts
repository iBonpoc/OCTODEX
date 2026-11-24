import { describe, expect, it } from "vitest";
import { rowQtyLine, rowSum } from "../src/features/estimate/rowLine";
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
