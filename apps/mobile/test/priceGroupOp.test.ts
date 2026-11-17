/**
 * unit:priceGroupOp — #1913 PR2 (spec 33-gutters-price-key §4.3, §4.6): the core's «price group».
 * - priceGroupOf / groupPriceChanged: what a group shares (price, placeholder, cost, tax, markup).
 * - The queue: two price writes of one group offline are one (the values of the last, what the phone saw of the first);
 *   never into the one on its way, never another person's, never another group's.
 * - A refusal «changed first» (row_version_conflict): it and the later writes of the group go, one card with the price meant.
 * - catalogMatch / starterLookup do not count priceGroup as an extra property; attributesLine does not show it.
 */
import { describe, expect, it } from "vitest";
import { groupPriceChanged, priceGroupOf } from "../src/data/priceGroup";
import { coalesceAt, coalesced } from "../src/data/outboxCoalesce";
import { dropGroupPriceOps, groupPriceRejected } from "../src/data/outboxRejected";
import type { OwnedItem, Owner } from "../src/data/outboxOwner";
import type { Op } from "../src/cloud/ops";
import { attributesLine, catalogMatch } from "../src/features/catalogMatch";
import { starterLookup } from "../src/features/estimateTemplate";
import { ru } from "../src/i18n/ru";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";
import type { CatalogItem } from "../src/data/types";

const me: Owner = { userId: "u1", companyId: "c1" };
const other: Owner = { userId: "u2", companyId: "c1" };
const gp = (group: string, price: number, expected: number, extra: Partial<Extract<Op, { k: "catalog.groupPrice" }>> = {}): Op =>
  ({ k: "catalog.groupPrice", itemId: "i-" + group, group, priceCents: price, placeholder: false, expectedPriceCents: expected, ...extra });
const item = (id: string, op: Op, owner: Owner | null = me): OwnedItem => ({ id, op, at: "2026-11-17T10:00:00Z", tries: 0, ...(owner ? { owner } : {}) });
const cat = (o: Partial<CatalogItem>): CatalogItem => ({ id: "x", kind: "material", name: "X", unit: "ft", priceCents: 800, ...o });

describe("unit:priceGroupOp — #1913 PR2", () => {
  it("the group of an item: blank is none", () => {
    expect(priceGroupOf(cat({ attributes: { priceGroup: "gutters:v1:abc" } }))).toBe("gutters:v1:abc");
    expect(priceGroupOf(cat({ attributes: { priceGroup: "  " } }))).toBeUndefined();
    expect(priceGroupOf(cat({}))).toBeUndefined();
  });

  it("what a group shares: price, placeholder, cost, tax, markup — not the name or the supplier", () => {
    const a = cat({ costCents: 400, vendorTaxBps: 0, markupBps: 10000 });
    expect(groupPriceChanged(a, { ...a, name: "Y", supplierSku: "S1" })).toBe(false);
    expect(groupPriceChanged(a, { ...a, priceCents: 900 })).toBe(true);
    expect(groupPriceChanged(a, { ...a, placeholder: true })).toBe(true);
    expect(groupPriceChanged(a, { ...a, markupBps: 5000 })).toBe(true);
  });

  it("two writes of one group offline are one: the last values, the first expected", () => {
    const q = [item("a", gp("g1", 900, 800, { costCents: 450, expectedCostCents: 400 }))];
    const newer = gp("g1", 1000, 900, { costCents: 500, expectedCostCents: 450 });
    const at = coalesceAt(q, newer, me, null);
    expect(at).toBe(0);
    const merged = coalesced(q[0]!, item("b", newer));
    expect(merged.op).toMatchObject({ k: "catalog.groupPrice", priceCents: 1000, costCents: 500, expectedPriceCents: 800, expectedCostCents: 400 });
  });

  it("never into the one on its way, another person's, another group's", () => {
    const q = [item("a", gp("g1", 900, 800))];
    expect(coalesceAt(q, gp("g1", 1000, 900), me, "a")).toBe(-1);
    expect(coalesceAt([item("a", gp("g1", 900, 800), other)], gp("g1", 1000, 900), me, null)).toBe(-1);
    expect(coalesceAt(q, gp("g2", 1000, 900), me, null)).toBe(-1);
    expect(coalesceAt(q, gp("g1", 1000, 900), null, null)).toBe(-1);
  });

  it("a refusal «changed first»: this write and the later ones of the group go; others stay; one card with the price meant", () => {
    const q = [item("a", gp("g1", 900, 800)), item("b", gp("g2", 500, 400)), item("c", gp("g1", 1000, 900)), item("d", gp("g1", 1100, 1000), other)];
    const { kept, gone } = dropGroupPriceOps(q, "g1", me);
    expect(gone.map((x) => x.id)).toEqual(["a", "c"]);
    expect(kept.map((x) => x.id)).toEqual(["b", "d"]);
    const cards = groupPriceRejected([], gone, "changed meanwhile", Date.parse("2026-11-17T12:00:00Z"), me);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: "catalog.groupPrice", what: "price", href: "/catalog/i-g1", labelKey: "price.group.rejConflict", groupPrice: { group: "g1", mineCents: 1000 } });
    // a second refusal of the same group: still one card, the newest price
    const again = groupPriceRejected(cards, [item("e", gp("g1", 1200, 1000))], "x", Date.parse("2026-11-17T12:05:00Z"), me);
    expect(again.filter((x) => x.kind === "catalog.groupPrice")).toHaveLength(1);
    expect(again[0]!.groupPrice!.mineCents).toBe(1200);
  });

  it("the words of the refusal in every language, without «не удалось / ошибка / сбой»", () => {
    for (const d of [ru, en, es]) {
      expect(d["price.group.rejConflict"]).toBeTruthy();
      expect(d["att.rejected.price"]).toBeTruthy();
      expect(d["price.group.rejConflict"]).not.toMatch(/не удалось|ошибк|сбой/i);
    }
  });

  it("priceGroup is not an item's own property: matching and the card ignore it", () => {
    const white = cat({ id: "w", name: "A gutter white", attributes: { part: "gutter", color: "white", priceGroup: "gutters:v1:g" } });
    const plain = cat({ id: "p", name: "B gutter plain", attributes: { part: "gutter", color: "white" } });
    // before: the item with priceGroup had one property more and lost to the one without it; now they are equal (by name)
    expect(catalogMatch([white, plain], { part: "gutter", color: "white" }).map((x) => x.id)).toEqual(["w", "p"]);
    // a starter estimate finds the same item before and after the move into a group
    const before = cat({ id: "w", name: "Gutter white", attributes: { part: "gutter", color: "white" } });
    expect(starterLookup([before], { part: "gutter" }, "ft").item?.id).toBe("w");
    expect(starterLookup([white], { part: "gutter" }, "ft").item?.id).toBe("w");
    expect(attributesLine(white.attributes)).toBe("white · gutter");
  });
});
