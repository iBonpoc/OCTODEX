/** Debt 5 of «Сметы» №1: after a tech's change the server has no margin; the office sees it counted from its document,
 *  or «not counted» with how many lines have no cost — never an empty place. */
import { describe, expect, it } from "vitest";
import { marginView } from "../src/features/estimateDoc";
import type { EstimateDoc } from "../src/data/types";

const settings = { discount: null, tax: { enabled: false, rateBps: 0, groups: { service: false, labor: false, material: false } }, deposit: { kind: "none" } };
const doc = (lines: Record<string, unknown>[]): EstimateDoc =>
  ({ options: [{ id: "o", name: "A", recommended: true, lines: lines.map((l, i) => ({ id: `l${i}`, name: `L${i}`, group: "labor", unit: "ea", quantity: "1", ...l })) }], settings }) as unknown as EstimateDoc;

describe("marginView", () => {
  it("the server's margin first", () => {
    expect(marginView({ marginPct: "40.0", doc: doc([{ unitPriceCents: 100 }]) })).toEqual({ kind: "pct", pct: "40.0" });
  });
  it("no server margin, every line has a cost: counted from the document", () => {
    expect(marginView({ marginPct: null, doc: doc([{ unitPriceCents: 10000, unitCostCents: 6000 }, { unitPriceCents: 10000, unitCostCents: 4000 }]) })).toEqual({ kind: "pct", pct: "50.0" });
  });
  it("a line without a cost: not counted, with how many", () => {
    expect(marginView({ marginPct: null, doc: doc([{ unitPriceCents: 10000, unitCostCents: 6000 }, { unitPriceCents: 500 }, { unitPriceCents: 700 }]) })).toEqual({ kind: "missing", lines: 2 });
  });
  it("a quantity-0 line and an add-on the client did not take do not count", () => {
    const d = doc([{ unitPriceCents: 10000, unitCostCents: 5000 }, { unitPriceCents: 500, quantity: "0" }, { unitPriceCents: 700, optional: true }]);
    expect(marginView({ marginPct: null, doc: d })).toEqual({ kind: "pct", pct: "50.0" });
    expect(marginView({ marginPct: null, doc: d, approval: { optionId: "o", addonIds: ["l2"] } })).toEqual({ kind: "missing", lines: 1 });
  });
  it("nothing to count: no document, no lines", () => {
    expect(marginView({ marginPct: null })).toBeNull();
    expect(marginView({ marginPct: null, doc: doc([]) })).toBeNull();
  });
});
