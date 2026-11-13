import { describe, it, expect } from "vitest";
import type { CustomLine } from "@octo/estimating-engine";
import { hiddenSpend, noPrice, rowPriceTimes } from "../src/features/estimateRows";
import { DEFAULT_ROW_VIEW, parseRowView } from "../src/features/estimate/rowView";

const line = (over: Partial<CustomLine> = {}): CustomLine => ({ id: "l1", name: "Gutter 5in", group: "material", quantity: "86", unit: "LF", unitPriceCents: 1200, ...over });
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const qty = (q: CustomLine["quantity"]) => String(q);

describe("unit:estimateRowView — the folded row (DS §8.3, #1307 а)", () => {
  it("«Подробно» says the price first: «$12.00 × 86 LF»", () => {
    expect(rowPriceTimes(line(), money, qty)).toBe("$12.00 × 86 LF");
  });
  it("«Нет цены»: a line the client sees, priced $0; a hidden $0 line is not «no price»", () => {
    expect(noPrice(line({ unitPriceCents: 0 }))).toBe(true);
    expect(noPrice(line({ unitPriceCents: 0, clientVisible: false }))).toBe(false);
    expect(noPrice(line())).toBe(false);
  });
  it("«расход $X» of a hidden line: only for who sees costs, never on «Экран для клиента»", () => {
    const hidden = line({ unitPriceCents: 0, clientVisible: false, quantity: "2", unitCostCents: 14000 });
    expect(hiddenSpend(hidden, { costsVisible: true, clientScreen: false })).toBe(28000);
    expect(hiddenSpend(hidden, { costsVisible: false, clientScreen: false })).toBeNull();
    expect(hiddenSpend(hidden, { costsVisible: true, clientScreen: true })).toBeNull();
    // no cost known — nothing to say; a visible line has no «расход»
    expect(hiddenSpend(line({ unitPriceCents: 0, clientVisible: false }), { costsVisible: true, clientScreen: false })).toBeNull();
    expect(hiddenSpend(line({ unitCostCents: 500 }), { costsVisible: true, clientScreen: false })).toBeNull();
  });
  it("«Кратко» by default; the device remembers «Подробно»", () => {
    expect(DEFAULT_ROW_VIEW).toBe("brief");
    expect(parseRowView(null)).toBe("brief");
    expect(parseRowView('"full"')).toBe("full");
    expect(parseRowView("garbage")).toBe("brief");
  });
});
