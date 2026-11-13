import { describe, expect, it } from "vitest";
import { DEFAULT_TAX, computeAllOptional, computeCustomOption, type CustomLine, type CustomSettings } from "@octo/estimating-engine";
import { allOptionalFor, totalsRows } from "@/features/estimate/totalsRows";
import { exemptDoc } from "@/features/estimateDoc";

// «Итого ˅» (DS §8.9, #1362): the rows, from the engine's totals only
const L = (id: string, cents: number, over: Partial<CustomLine> = {}): CustomLine => ({ id, name: id, group: "service", quantity: "1", unit: "ea", unitPriceCents: cents, ...over });
const S = (over: Partial<CustomSettings> = {}): CustomSettings => ({ discount: null, tax: DEFAULT_TAX, deposit: { kind: "none" }, ...over });
const opt = (lines: CustomLine[]) => ({ id: "o", name: "Good", lines });
const keys = (r: { key: string }[]) => r.map((x) => x.key);

describe("totalsRows", () => {
  it("a plain estimate: subtotal and total only; no add-ons — no «если включит»", () => {
    const o = opt([L("a", 10000, { unitCostCents: 4000 })]);
    const r = totalsRows({ totals: computeCustomOption(o, S()), allOptional: computeAllOptional(o, S()), own: true, costKnown: true });
    expect(keys(r.client)).toEqual(["subtotal", "total"]);
    expect(r.own).toEqual([{ key: "cost", cents: 4000 }, { key: "profit", cents: 6000, pct: "60.0", loss: false }]);
  });
  it("discount, tax, deposit and add-ons: each its row; «если включит» = the engine's total with them in", () => {
    const o = opt([L("a", 100000), L("b", 50000, { optional: true })]);
    const s = S({ discount: { kind: "pct", value: "0.1" }, tax: { enabled: true, rateBps: 1025, groups: { service: true, labor: true, material: true } }, deposit: { kind: "pct", bps: 1000 } });
    const all = computeAllOptional(o, s);
    const r = totalsRows({ totals: computeCustomOption(o, s), allOptional: all, own: false, costKnown: false });
    expect(keys(r.client)).toEqual(["subtotal", "discount", "tax", "total", "deposit", "ifAll"]);
    expect(r.client.find((x) => x.key === "ifAll")!.cents).toBe(all!.total);
    expect(r.client.find((x) => x.key === "ifAll")!.cents).toBe(148838);
  });
  it("«Только для вас»: none for the tech or «Экран для клиента»; cost unknown — «—»; a loss is marked", () => {
    const o = opt([L("a", 1000, { unitCostCents: 3000 })]);
    const t = computeCustomOption(o, S());
    expect(totalsRows({ totals: t, allOptional: null, own: false, costKnown: true }).own).toEqual([]);
    expect(totalsRows({ totals: t, allOptional: null, own: true, costKnown: false }).own).toEqual([{ key: "cost", cents: null }, { key: "profit", cents: null, pct: null, loss: false }]);
    expect(totalsRows({ totals: t, allOptional: null, own: true, costKnown: true }).own[1]).toMatchObject({ cents: -2000, loss: true });
  });
});

describe("the editor's wiring (review of #1362, К1)", () => {
  const taxOn = S({ tax: { enabled: true, rateBps: 1025, groups: { service: true, labor: true, material: true } } });
  const o = opt([L("a", 100000), L("b", 50000, { optional: true })]);
  it("a tax-exempt client: $Y has no tax, like the total above it (the screen passes the counted settings)", () => {
    const doc = { options: [o], settings: taxOn };
    const counted = exemptDoc(doc, true);
    expect(allOptionalFor(counted, o, false)!.total).toBe(150000);
    expect(allOptionalFor(counted, o, false)!.tax).toBe(0);
    // not exempt: with the tax
    expect(allOptionalFor(exemptDoc(doc, false), o, false)!.total).toBe(165375);
  });
  it("a signed estimate: no «если включит» (the client has decided)", () => {
    expect(allOptionalFor({ settings: S() }, o, true)).toBeNull();
  });
  it("nothing typed yet: no «$0 cost, $0 profit»", () => {
    const t = computeCustomOption(opt([]), S());
    expect(totalsRows({ totals: t, allOptional: null, own: true, costKnown: true }).own).toEqual([]);
  });
  it("«если включит» equal to the total (a $0 add-on adds nothing): no row", () => {
    const t = computeCustomOption(opt([L("a", 1000)]), S());
    expect(totalsRows({ totals: t, allOptional: t, own: false, costKnown: true }).client.map((r) => r.key)).toEqual(["subtotal", "total"]);
  });
});
