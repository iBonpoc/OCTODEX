/** engine:purchase — the core supplier order (docs/specs/37 §3): packs of the purchase unit, decimal. */
import { describe, expect, it } from "vitest";
import { orderCostCents, packCostCents, purchasePacks, sumQty } from "../src/purchase";

describe("purchasePacks", () => {
  it("rounds up to whole packs (65 brackets, a box of 50 → 2 boxes)", () => {
    expect(purchasePacks("65", "50")).toEqual({ packs: "2", checkPack: false });
    expect(purchasePacks("50", "50")).toEqual({ packs: "1", checkPack: false });
    expect(purchasePacks("0", "50")).toEqual({ packs: "0", checkPack: false });
  });
  it("a fractional pack size (2.6 ft a lb): 152.5 ft → 59 lb", () => {
    expect(purchasePacks("152.5", "2.6").packs).toBe("59");
  });
  it("no pack size: one unit a pack, rounded up, «check the pack size»", () => {
    expect(purchasePacks("12.2")).toEqual({ packs: "13", checkPack: true });
    expect(purchasePacks("3", "")).toEqual({ packs: "3", checkPack: true });
    expect(purchasePacks("3", "0")).toEqual({ packs: "3", checkPack: true });
  });
  it("a negative quantity is an error", () => {
    expect(() => purchasePacks("-1", "2")).toThrow();
  });
  it("sums decimals exactly (0.1 + 0.2 = 0.3)", () => {
    expect(sumQty(["0.1", "0.2"])).toBe("0.3");
    expect(sumQty([])).toBe("0");
  });
});

describe("pack and order costs (test prices)", () => {
  it("a box of 50 at $0.37 an item = $18.50; a coil lb of 2.6 ft at $1.15 a ft = $2.99 (half up)", () => {
    expect(packCostCents(37, "50")).toBe(1850);
    expect(packCostCents(115, "2.6")).toBe(299);
    expect(packCostCents(115)).toBe(115);
  });
  it("an order: 2 boxes × $18.50 + 1.5 × $3.33 (4.995 → 5.00) = $42.00", () => {
    expect(orderCostCents([{ qty: "2", costCents: 1850 }, { qty: "1.5", costCents: 333 }])).toBe(4200);
  });
});
