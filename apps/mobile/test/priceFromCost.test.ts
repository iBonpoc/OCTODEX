/**
 * unit:priceFromCost — #1807 (53-0б-2, spec 53 §5.3б п.4): the server counts a material's price from its cost.
 * - Who does not see our costs reads that price and cannot change it (the field is read-only, the words tell why with no
 *   number); a save keeps the price the phone read.
 * - The office gets one reason in «Требует внимания» per material whose sent price the server replaced: who sent what and
 *   what stayed, the last of 7 days; a tech and who does not see costs — none.
 * - The cloud row: price_from_cost → priceFromCost; catalog_price_recalc → priceRecalc.
 */
import { describe, expect, it } from "vitest";
import { editClean, priceLocked } from "../src/features/catalogEdit";
import { quickChanged, quickPriceItem } from "../src/features/quickPrice";
import { attentionHref, buildAttention, priceRecalcItems, PRICE_RECALC_DAYS } from "../src/features/attention";
import { makeSeed } from "../src/data/seed";
import { ru } from "../src/i18n/ru";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";
import type { CatalogItem, DB } from "../src/data/types";

const NOW = Date.parse("2026-11-17T20:00:00Z");
const mat = (o: Partial<CatalogItem> = {}): CatalogItem => ({ id: "m1", kind: "material", name: "Coil", unit: "ft", priceCents: 6000, ...o });

describe("unit:priceFromCost — the price counted by the server (#1807)", () => {
  it("locked only for a material counted from the cost, for who does not see our costs", () => {
    expect(priceLocked(mat({ priceFromCost: true }), true)).toBe(true);
    expect(priceLocked(mat({ priceFromCost: true }), false)).toBe(false);
    expect(priceLocked(mat({ priceFromCost: false }), true)).toBe(false);
    expect(priceLocked(mat({}), true)).toBe(false);
    expect(priceLocked(mat({ kind: "labor", priceFromCost: true }), true)).toBe(false);
  });

  it("a save of a locked item keeps the price the phone read (another typed one is not sent)", () => {
    const stored = mat({ priceFromCost: true });
    const edited = { ...stored, name: "Coil white", priceCents: 6500 };
    expect(editClean(edited, [stored], true).priceCents).toBe(6000);
    // not locked (sales on a hand-priced material): the typed price, as before
    const hand = mat({ priceFromCost: false });
    expect(editClean({ ...hand, priceCents: 6500 }, [hand], true).priceCents).toBe(6500);
  });

  it("the quick price sheet: a locked price is no change — no save, no «saved», the sample mark stays (review of 53-0б-2)", () => {
    const stored = mat({ priceFromCost: true, placeholder: true });
    expect(quickChanged(stored, { priceCents: 6500 }, true)).toBe(false);
    expect(quickPriceItem(stored, { priceCents: 6500 }, [stored], true)).toMatchObject({ priceCents: 6000, placeholder: true });
    // not locked: the typed price, as before
    const hand = mat({ priceFromCost: false });
    expect(quickChanged(hand, { priceCents: 6500 }, true)).toBe(true);
  });

  it("the words of the lock tell why, with no number, in every language", () => {
    for (const d of [ru, en, es]) {
      expect(d["price.fromCost.locked"]).toBeTruthy();
      expect(d["price.fromCost.locked"]).not.toMatch(/\d|\$/);
      expect(d["price.fromCost.locked"]).not.toMatch(/не удалось|ошибк|сбой/i);
    }
  });

  const db = (o: Partial<DB> = {}): DB => {
    const s = makeSeed();
    return {
      ...s,
      catalog: [...s.catalog, mat({ priceFromCost: true })],
      members: [...s.members, { id: "u-sam", name: "Sam Sales", initials: "SS", kind: "employee", roles: ["sales"] }],
      priceRecalc: [
        { id: "r1", itemId: "m1", sentCents: 6500, serverCents: 6000, by: "u-sam", at: "2026-11-17T10:00:00Z" },
        { id: "r0", itemId: "m1", sentCents: 6400, serverCents: 6000, by: "u-sam", at: "2026-11-16T10:00:00Z" },
        { id: "r9", itemId: "m1", sentCents: 1, serverCents: 2, at: "2026-11-01T10:00:00Z" },
      ],
      ...o,
    };
  };

  it("one reason per material: the last note of 7 days — who sent what, what stayed; opens the item", () => {
    const items = priceRecalcItems(db(), "director", NOW);
    expect(items).toHaveLength(1);
    const it0 = items[0]!;
    expect(it0).toMatchObject({ kind: "priceRecalc", refId: "m1", name: "Coil", status: "warn", label: "price.recalc.att" });
    expect(it0.params).toMatchObject({ who: "Sam Sales", sent: "$65", kept: "$60" });
    expect(attentionHref(it0)).toBe("/catalog/m1");
    expect(buildAttention(db(), "director", NOW).some((x) => x.id === "recalc-m1")).toBe(true);
  });

  it("older than 7 days — gone by itself; a sender not in the team — the words without a name", () => {
    expect(priceRecalcItems(db(), "director", NOW + PRICE_RECALC_DAYS * 864e5)).toHaveLength(0);
    const one = priceRecalcItems(db({ priceRecalc: [{ id: "r1", itemId: "m1", sentCents: 6500, serverCents: 6000, at: "2026-11-17T10:00:00Z" }] }), "dispatcher", NOW);
    expect(one[0]!.label).toBe("price.recalc.attNoWho");
  });

  it("a tech, who does not see our costs, no notes, an item gone from the list — no reason", () => {
    expect(priceRecalcItems(db(), "tech", NOW)).toHaveLength(0);
    expect(priceRecalcItems(db({ costsVisible: false }), "sales", NOW)).toHaveLength(0);
    expect(priceRecalcItems(db({ priceRecalc: [] }), "director", NOW)).toHaveLength(0);
    expect(priceRecalcItems(db({ catalog: makeSeed().catalog }), "director", NOW)).toHaveLength(0);
  });

  it("the reason's words in every language, with every place-holder", () => {
    for (const d of [ru, en, es]) {
      for (const p of ["{name}", "{who}", "{sent}", "{kept}"]) expect(d["price.recalc.att"]).toContain(p);
      for (const p of ["{name}", "{sent}", "{kept}"]) expect(d["price.recalc.attNoWho"]).toContain(p);
      expect(d["price.recalc.chip"]).toBeTruthy();
    }
  });
});
