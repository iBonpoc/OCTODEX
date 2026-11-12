/**
 * Estimate editor, РС-3 (spec docs/audit/2026-11-12-estimate-editor-spec.md Р1, Р3, Р4, Р6): hidden lines, the tax on
 * the whole amount for a new estimate (an older one counts as it was written), section subtotals, a line's profit, the
 * markup that saves a material to the catalog at exactly the line's price. Test prices.
 */
import { describe, expect, it } from "vitest";
import {
  CATALOG_MARKUP_MAX_BPS, DEFAULT_TAX, SECTIONS_MAX, catalogMarkupFor, catalogPrice, computeCustomOption, lineProfit, sectionSubtotals,
  type CustomLine, type CustomOption, type CustomSettings,
} from "../src/custom.js";
import { computeOption } from "../src/estimate.js";

const line = (x: Partial<CustomLine> & { id: string }): CustomLine => ({ name: x.id, group: "labor", quantity: "1", unit: "ea", unitPriceCents: 10000, ...x });
const settings = (tax: Partial<CustomSettings["tax"]> = {}): CustomSettings => ({ discount: null, tax: { ...DEFAULT_TAX, ...tax }, deposit: { kind: "none" } });

describe("Р3: a hidden line never changes the client's total", () => {
  it("hidden at $0: its cost is in the cost and profit, the total stays", () => {
    const o: CustomOption = { id: "o", name: "A", lines: [line({ id: "a", unitPriceCents: 100000 }), line({ id: "h", unitPriceCents: 0, unitCostCents: 5000, clientVisible: false })] };
    const t = computeCustomOption(o, settings());
    expect(t.total).toBe(100000);
    expect(t.cost).toBe(5000);
  });
  it("a priced line marked hidden (an older phone, a bad copy) counts as visible — the app never meets the refusal", () => {
    const o: CustomOption = { id: "o", name: "A", lines: [line({ id: "a", unitPriceCents: 100000 }), line({ id: "b", unitPriceCents: 10000, clientVisible: false })] };
    expect(() => computeCustomOption(o, settings())).not.toThrow();
    expect(computeCustomOption(o, settings()).total).toBe(110000);
    // the engine's own refusal stays for a line given to it directly
    expect(() => computeOption([{ name: "b", quantity: "1", unitPriceCents: 10000, clientVisible: false }], { mode: "added_on_top", enabled: false, rateBps: 0 })).toThrow();
  });
});

describe("Р6: the tax — a new estimate on the whole amount; an older one as it was written", () => {
  const lines = [line({ id: "m", group: "material", unitPriceCents: 14556 }), line({ id: "l", group: "labor", unitPriceCents: 15000 }), line({ id: "s", group: "service", unitPriceCents: 25000 })];
  it("DEFAULT_TAX: off, every group once on", () => {
    expect(DEFAULT_TAX).toEqual({ enabled: false, rateBps: 0, groups: { service: true, labor: true, material: true } });
    // 545.56 × 10.25% = 55.92 → 601.48, rounded once
    expect(computeCustomOption({ id: "o", name: "A", lines }, settings({ enabled: true, rateBps: 1025 })).tax).toBe(5592);
  });
  it("an older estimate taxed on materials only: to the cent as before (145.56 × 9.5% = 13.83 → 559.39)", () => {
    const t = computeCustomOption({ id: "o", name: "A", lines }, settings({ enabled: true, rateBps: 950, groups: { service: false, labor: false, material: true } }));
    expect([t.subtotal, t.tax, t.total]).toEqual([54556, 1383, 55939]);
  });
  it("after a discount, an add-on only when chosen", () => {
    const o: CustomOption = { id: "o", name: "A", lines: [...lines, line({ id: "x", unitPriceCents: 10000, optional: true })] };
    const s: CustomSettings = { ...settings({ enabled: true, rateBps: 1000 }), discount: { kind: "fixed", cents: 4556 } };
    expect(computeCustomOption(o, s).tax).toBe(5000); // (545.56 − 45.56) × 10%
    o.lines[3]!.selected = true;
    expect(computeCustomOption(o, s).tax).toBe(6000);
  });
});

describe("Р4: section subtotals", () => {
  const o = (): CustomOption => ({
    id: "o", name: "A",
    sections: [{ id: "roof", title: "Roof" }, { id: "mat", kind: "material", parentId: "roof" }, { id: "wall", title: "Walls" }],
    lines: [
      line({ id: "a", sectionId: "mat", unitPriceCents: 1000 }),
      line({ id: "b", sectionId: "roof", unitPriceCents: 2000 }),
      line({ id: "c", sectionId: "wall", unitPriceCents: 4000 }),
      line({ id: "d", unitPriceCents: 8000 }),
      line({ id: "e", sectionId: "gone", unitPriceCents: 16000 }), // an older phone's clone: no such section
      line({ id: "f", sectionId: "wall", unitPriceCents: 32000, optional: true }),
    ],
  });
  it("a section holds its subsections; an orphan and a line with no section go apart; Σ = subtotal", () => {
    const x = o();
    const r = sectionSubtotals(x, settings());
    expect(r).toEqual({ bySection: { roof: 3000, mat: 1000, wall: 4000 }, unsectioned: 24000 });
    expect(r.bySection.roof! + r.bySection.wall! + r.unsectioned).toBe(computeCustomOption(x, settings()).subtotal);
  });
  it("a chosen add-on lies in its section and counts there; not chosen — nowhere", () => {
    const x = o();
    x.lines[5]!.selected = true;
    const r = sectionSubtotals(x, settings());
    expect(r.bySection.wall).toBe(36000);
    expect(r.bySection.roof! + r.bySection.wall! + r.unsectioned).toBe(computeCustomOption(x, settings()).subtotal);
  });
  it("the data is never rewritten (an orphan keeps its sectionId); past 40 sections — «без раздела»", () => {
    const x = o();
    const before = JSON.stringify(x);
    sectionSubtotals(x, settings());
    expect(JSON.stringify(x)).toBe(before);
    const many: CustomOption = { id: "o", name: "A", sections: Array.from({ length: SECTIONS_MAX + 1 }, (_, i) => ({ id: `s${i}` })), lines: [line({ id: "z", sectionId: `s${SECTIONS_MAX}` })] };
    expect(sectionSubtotals(many, settings()).unsectioned).toBe(10000);
    // a subsection under a parent that does not count is not counted either
    const lost: CustomOption = { id: "o", name: "A", sections: [{ id: "sub", parentId: "nope" }], lines: [line({ id: "y", sectionId: "sub" })] };
    expect(sectionSubtotals(lost, settings())).toEqual({ bySection: {}, unsectioned: 10000 });
    // a repeated id counts once, the first: Σ stays the subtotal
    const twice: CustomOption = { id: "o", name: "A", sections: [{ id: "a" }, { id: "a", parentId: "b" }, { id: "b" }], lines: [line({ id: "w", sectionId: "a" })] };
    expect(sectionSubtotals(twice, settings())).toEqual({ bySection: { a: 10000, b: 0 }, unsectioned: 0 });
  });
});

describe("Р1: a line's profit; «Сохранить в каталог» for a material", () => {
  it("lineProfit = total − cost (2.5 × $20.40 − 2.5 × $13.00 = $18.50); a loss is negative", () => {
    expect(lineProfit(line({ id: "p", quantity: "2.5", unitPriceCents: 2040, unitCostCents: 1300 }))).toBe(1850);
    expect(lineProfit(line({ id: "q", unitPriceCents: 1000, unitCostCents: 1500 }))).toBe(-500);
    expect(lineProfit(line({ id: "r", unitPriceCents: 1000 }))).toBe(1000);
    // a quantity being typed: no number yet — null, not an error (the editor calls it on every keystroke)
    expect(lineProfit(line({ id: "t", quantity: "abc", unitPriceCents: 1000 }))).toBeNull();
    expect(lineProfit(line({ id: "u", quantity: "", unitPriceCents: 1000 }))).toBeNull();
  });
  it("the catalog price is the line's price, for every cost up to $100 and price up to 11 × cost", () => {
    const bad: string[] = [];
    for (let c = 1; c <= 10000; c += c < 200 ? 1 : 37) {
      for (const p of [c, c + 1, Math.round(c * 1.1), Math.round(c * 1.37) + 1, c * 2, c * 11]) {
        const r = catalogMarkupFor(c, p);
        if (!r.ok || catalogPrice(c, 0, r.markupBps) !== p || r.markupBps > CATALOG_MARKUP_MAX_BPS) bad.push(`${c}/${p}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("the edge: a cost of exactly $100.00 (one bp is one cent), every price up to 11 × cost", () => {
    for (const c of [9999, 10000]) {
      for (let p = c; p <= c * 11; p++) {
        const r = catalogMarkupFor(c, p);
        if (!r.ok || catalogPrice(c, 0, r.markupBps) !== p) throw new Error(`${c}/${p}`);
      }
    }
  });
  it("not saved: no cost, a price below the cost, no exact markup", () => {
    expect(catalogMarkupFor(undefined, 100)).toEqual({ ok: false, reason: "noCost" });
    expect(catalogMarkupFor(0, 100)).toEqual({ ok: false, reason: "noCost" });
    expect(catalogMarkupFor(500, 499)).toEqual({ ok: false, reason: "belowCost" });
    expect(catalogMarkupFor(500, 5501)).toEqual({ ok: false, reason: "aboveMax" }); // more than 11 × the cost
    expect(catalogMarkupFor(500, 5500)).toEqual({ ok: true, markupBps: 100000 });
    // $1,000.03 cost: one bp is 10 cents, $1,000.08 is between two steps
    expect(catalogMarkupFor(100003, 100008)).toEqual({ ok: false, reason: "noExact" });
    expect(catalogMarkupFor(1000, 1100)).toEqual({ ok: true, markupBps: 1000 }); // the line's own 10%, not 9.99% (999 rounds to $11.00 too)
  });
});
