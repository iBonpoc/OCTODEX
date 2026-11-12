import { describe, it, expect } from "vitest";
import type { CustomLine } from "@octo/estimating-engine";
import type { CatalogItem } from "../src/data/types";
import { catalogUnitPrice } from "../src/features/estimateDoc";
import { applyPatch, canHide, catalogOffer, clearLine, dropLine, duplicateLine, isBlank, leaveDecision, reinsertLine, replaceLine, restoreLine, rowFigures, rowProblems, rowSummary } from "../src/features/estimateRows";

const line = (over: Partial<CustomLine> = {}): CustomLine => ({ id: "l1", name: "Gutter 5in", group: "material", quantity: "120", unit: "LF", unitPriceCents: 850, ...over });
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const mark = { module: "gutters", key: "run" } as never;

describe("estimate row in place (DS §8.3, Р1–Р2)", () => {
  it("the line under the name of a folded row", () => {
    expect(rowSummary(line(), money, String)).toBe("120 LF × $8.50");
  });
  it("blank = nothing typed: name empty, price 0, no description", () => {
    expect(isBlank(line({ name: "", unitPriceCents: 0 }))).toBe(true);
    expect(isBlank(line({ name: "", unitPriceCents: 0, description: " x " }))).toBe(false);
    expect(isBlank(line({ name: "A", unitPriceCents: 0 }))).toBe(false);
  });
  it("problems: an empty name, a quantity that is not a number, a negative price", () => {
    expect(rowProblems(line()).map((p) => p.id)).toEqual([]);
    expect(rowProblems(line({ name: " " })).map((p) => p.id)).toEqual(["name"]);
    for (const q of ["abc", "-1", "1e5", "", "0", "0.00", "00"]) expect(rowProblems(line({ quantity: q })).map((p) => p.id), q).toEqual(["qty"]);
    expect(rowProblems(line({ unitPriceCents: -5 })).map((p) => p.id)).toEqual(["price"]);
    expect(rowProblems(line({ name: "", quantity: "x", unitPriceCents: -1 })).map((p) => p.id)).toEqual(["name", "qty", "price"]);
  });
  it("replace: the place, the quantity and the module's mark stay; name, prices, kind go", () => {
    const old = line({ id: "keep", quantity: "7", sectionId: "s1", source: mark, optional: true });
    const from = line({ id: "new", name: "Downspout", group: "material", unit: "ea", unitPriceCents: 1200, unitCostCents: 700, catalogItemId: "cat-1", quantity: "1" });
    const r = replaceLine(old, from);
    expect(r).toMatchObject({ id: "keep", quantity: "7", sectionId: "s1", name: "Downspout", unitPriceCents: 1200, unitCostCents: 700, catalogItemId: "cat-1", optional: true });
    expect(r.source).toEqual(old.source);
  });
  it("replace: a hidden line stays hidden only if the new price is $0", () => {
    const hidden = line({ unitPriceCents: 0, clientVisible: false });
    expect(replaceLine(hidden, line({ unitPriceCents: 0, name: "Free" })).clientVisible).toBe(false);
    expect(replaceLine(hidden, line({ unitPriceCents: 500, name: "Paid" })).clientVisible).toBeUndefined();
  });
  it("clear: empties the line, keeps its place, quantity and the module's mark", () => {
    const c = clearLine(line({ sectionId: "s1", catalogItemId: "x", unitCostCents: 5, source: mark }));
    expect(c).toMatchObject({ id: "l1", name: "", unitPriceCents: 0, quantity: "120", sectionId: "s1" });
    expect(c.source).toEqual(mark);
    expect(c.catalogItemId).toBeUndefined();
    expect(c.unitCostCents).toBeUndefined();
  });
  it("duplicate: right after the line, own id, no module mark", () => {
    const lines = [line({ id: "a", source: mark }), line({ id: "b" })];
    const d = duplicateLine(lines, "a", () => "copy")!;
    expect(d.lines.map((l) => l.id)).toEqual(["a", "copy", "b"]);
    expect(d.lines[1]!.source).toBeUndefined();
    expect(duplicateLine(lines, "zz")).toBeNull();
  });
  it("figures: the total by the engine; profit and margin only for who sees costs", () => {
    const l = line({ quantity: "120", unitPriceCents: 850, unitCostCents: 540 });
    expect(rowFigures(l, true)).toEqual({ total: 102000, profit: 37200, marginPct: "36.5" });
    expect(rowFigures(l, false)).toEqual({ total: 102000, profit: null, marginPct: null });
    expect(rowFigures(line({ unitCostCents: undefined }), true).profit).toBeNull();
  });
  it("figures: a loss is negative", () => {
    const f = rowFigures(line({ quantity: "10", unitPriceCents: 500, unitCostCents: 700 }), true);
    expect(f.profit).toBe(-2000);
  });
});

describe("«Отменить» takes back its own action only", () => {
  it("delete → another row edited → undo: the row is back at its place, the edit stays", () => {
    const a = line({ id: "a" }), b = line({ id: "b", name: "B" }), c = line({ id: "c", name: "C" });
    const afterDelete = [b, c];
    const afterEdit = afterDelete.map((l) => (l.id === "b" ? { ...l, name: "B edited" } : l));
    const undone = reinsertLine(afterEdit, a, 0);
    expect(undone.map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(undone[1]!.name).toBe("B edited");
    expect(undone[0]).toBe(a);
  });
  it("undo of delete twice does not double the row; an index past the end appends", () => {
    const a = line({ id: "a" });
    expect(reinsertLine([a], a, 0)).toHaveLength(1);
    expect(reinsertLine([line({ id: "z" })], a, 9).map((l) => l.id)).toEqual(["z", "a"]);
  });
  it("replace / clear undone: that row as it was, others untouched", () => {
    const a = line({ id: "a", name: "A", unitPriceCents: 100 }), b = line({ id: "b", name: "B" });
    const replaced = [replaceLine(a, line({ id: "x", name: "New", unitPriceCents: 900 })), { ...b, name: "B edited" }];
    const back = restoreLine(replaced, a);
    expect(back[0]).toBe(a);
    expect(back[1]!.name).toBe("B edited");
  });
  it("duplicate undone: the copy goes, the rest stays", () => {
    const d = duplicateLine([line({ id: "a" }), line({ id: "b" })], "a", () => "cp")!;
    expect(dropLine(d.lines, "cp").map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("rows with odd data", () => {
  it("figures with a quantity that is not a number: no throw, no profit", () => {
    const f = rowFigures(line({ quantity: "abc", unitCostCents: 5 }), true);
    expect(f.profit).toBeNull();
    expect(f.marginPct).toBeNull();
  });
  it("replace from a catalog thing with no cost: the old cost does not stay", () => {
    const old = line({ id: "keep", unitCostCents: 700 });
    const r = replaceLine(old, line({ id: "n", name: "No cost", unitCostCents: undefined }));
    expect(r.unitCostCents).toBeUndefined();
  });
});

describe("the open row is asked to close (DS §8.3)", () => {
  const typed = line();
  const blank = line({ name: "", unitPriceCents: 0 });
  it("a blank row vanishes, a right one folds", () => {
    expect(leaveDecision(blank, 0, false)).toBe("remove");
    expect(leaveDecision(blank, 3, true)).toBe("remove");
    expect(leaveDecision(typed, 0, false)).toBe("fold");
    expect(leaveDecision(typed, 0, true)).toBe("fold");
  });
  it("a wrong row stays; it speaks (errors, scroll, vibration) only when the ask is not a finger starting to scroll", () => {
    expect(leaveDecision(typed, 2, false)).toBe("stay-loud");
    expect(leaveDecision(typed, 2, true)).toBe("stay-quiet");
  });
});

describe("«Скрыть от клиента» (Р3)", () => {
  it("only a line priced $0 may be hidden", () => {
    expect(canHide(line({ unitPriceCents: 0 }))).toBe(true);
    expect(canHide(line({ unitPriceCents: 1 }))).toBe(false);
  });
  it("a price typed into a hidden line shows it again", () => {
    const hidden = line({ unitPriceCents: 0, clientVisible: false });
    const r = applyPatch(hidden, { unitPriceCents: 500 });
    expect(r.unhidden).toBe(true);
    expect(r.line.clientVisible).toBeUndefined();
    expect(r.line.unitPriceCents).toBe(500);
  });
  it("a price of $0 or another field keeps it hidden; a visible line is never touched", () => {
    const hidden = line({ unitPriceCents: 0, clientVisible: false });
    expect(applyPatch(hidden, { name: "x" })).toMatchObject({ unhidden: false, line: { clientVisible: false } });
    expect(applyPatch(line({ unitPriceCents: 100 }), { unitPriceCents: 200 }).unhidden).toBe(false);
  });
});

describe("«Сохранить в каталог» (Р1, К1)", () => {
  it("a service / labor goes as the line says", () => {
    const o = catalogOffer(line({ group: "labor", name: " Install ", unit: "hr", unitPriceCents: 6500, description: "two people" }), true);
    expect(o).toEqual({ state: "offered", item: { kind: "labor", name: "Install", unit: "hr", priceCents: 6500, description: "two people" } });
  });
  it("a row that is not finished waits (no name, a wrong price)", () => {
    expect(catalogOffer(line({ name: " " }), true)).toEqual({ state: "later" });
    expect(catalogOffer(line({ unitPriceCents: -1 }), true)).toEqual({ state: "later" });
  });
  it("a material: the price in the catalog is the line's price (a grid of costs and prices)", () => {
    let n = 0;
    for (const cost of [1, 2, 7, 99, 100, 333, 1000, 1213, 4999, 10000]) {
      for (const factor of [1, 1.0001, 1.05, 1.3333, 2, 3.5, 7, 10.99, 11]) {
        const price = Math.round(cost * factor);
        const o = catalogOffer(line({ group: "material", unitCostCents: cost, unitPriceCents: price }), true);
        if (o.state !== "offered") continue;
        n += 1;
        expect(catalogUnitPrice({ id: "x", ...o.item } as CatalogItem), `cost ${cost} price ${price}`).toBe(price);
      }
    }
    expect(n).toBeGreaterThan(50);
  });
  it("a material is refused with the reason: no cost, below the cost, above 11 ×, no cost for who does not see costs", () => {
    const m = (over: Partial<CustomLine>, costs = true) => catalogOffer(line({ group: "material", unitCostCents: 1000, unitPriceCents: 1500, ...over }), costs);
    expect(m({ unitCostCents: undefined })).toEqual({ state: "refused", reason: "noCost" });
    expect(m({}, false)).toEqual({ state: "refused", reason: "noCost" });
    expect(m({ unitPriceCents: 900 })).toEqual({ state: "refused", reason: "belowCost" });
    expect(m({ unitPriceCents: 12000 })).toEqual({ state: "refused", reason: "aboveMax" });
    expect(m({}).state).toBe("offered");
  });
});
