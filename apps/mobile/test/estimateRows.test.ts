import { describe, it, expect } from "vitest";
import type { CustomLine } from "@octo/estimating-engine";
import type { CatalogItem } from "../src/data/types";
import { catalogUnitPrice } from "../src/features/estimateDoc";
import { applyPatch, canHide, catalogOffer, clearLine, settleOpenRow, dropLine, duplicateLine, isBlank, leaveDecision, reinsertLine, replaceLine, restoreLine, rowFigures, rowProblems, rowSummary, rowActions, setHidden } from "../src/features/estimateRows";

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
  it("a material: the price in the catalog is the line's price — offered in EVERY cell of a cost up to $100.00 and a price up to 11 × the cost", () => {
    let n = 0;
    const costs = [1, 2, 3, 7, 33, 99, 100, 101, 333, 999, 1000, 1213, 4999, 5000, 9999, 10000];
    for (const cost of costs) {
      const prices = new Set<number>([cost, cost + 1, cost * 2, cost * 11, cost * 11 - 1, Math.round(cost * 1.0001), Math.round(cost * 1.05), Math.round(cost * 1.3333), Math.round(cost * 3.5), Math.round(cost * 10.99)]);
      for (const price of prices) {
        if (price < cost || price > cost * 11) continue;
        const o = catalogOffer(line({ group: "material", unitCostCents: cost, unitPriceCents: price }), true);
        expect(o.state, `cost ${cost} price ${price}`).toBe("offered");
        if (o.state === "offered") expect(catalogUnitPrice({ id: "x", ...o.item } as CatalogItem), `cost ${cost} price ${price}`).toBe(price);
        n += 1;
      }
    }
    expect(n).toBeGreaterThan(100);
  });
  it("a cost above $100.00 may have no exact markup: refused with its own reason, never a wrong price", () => {
    let refused = 0;
    for (const cost of [10001, 12345, 55555, 99999]) {
      for (let price = cost; price <= cost + 40; price++) {
        const o = catalogOffer(line({ group: "material", unitCostCents: cost, unitPriceCents: price }), true);
        if (o.state === "refused") {
          expect(o.reason).toBe("noExact");
          refused += 1;
        } else if (o.state === "offered") expect(catalogUnitPrice({ id: "x", ...o.item } as CatalogItem)).toBe(price);
      }
    }
    expect(refused).toBeGreaterThan(0);
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

describe("the row closes: one step for the screen and for «Сохранить» (settleOpenRow)", () => {
  const ctx = (over: Record<string, unknown> = {}) => ({ openId: "r", wantCatalog: ["r"], costsVisible: true, catalog: [], problems: 0, quiet: false, newId: () => "NEW", ...over }) as Parameters<typeof settleOpenRow>[1];
  const opt = (...lines: CustomLine[]) => ({ lines });
  it("a right line with the catalog on: the thing is made and the link is already in the option that «Сохранить» will save", () => {
    const r = settleOpenRow(opt(line({ id: "r", group: "service" })), ctx());
    expect(r.closed).toBe(true);
    expect(r.newItems.map((i) => i.id)).toEqual(["NEW"]);
    expect(r.option.lines[0]!.catalogItemId).toBe("NEW");
    expect(r.wantCatalog).toEqual([]);
  });
  it("a line already linked to a live thing creates nothing (after «Заменить»: no copy)", () => {
    const r = settleOpenRow(opt(line({ id: "r", catalogItemId: "cat-1" })), ctx({ catalog: [{ id: "cat-1" }] }));
    expect(r.newItems).toEqual([]);
    expect(r.option.lines[0]!.catalogItemId).toBe("cat-1");
    expect(r.wantCatalog).toEqual([]);
  });
  it("a link to a thing that is gone does not count: the thing is made anew", () => {
    const r = settleOpenRow(opt(line({ id: "r", catalogItemId: "gone", group: "service" })), ctx());
    expect(r.newItems).toHaveLength(1);
  });
  it("the catalog off or a material that is refused: nothing is made; the row still closes", () => {
    expect(settleOpenRow(opt(line({ id: "r" })), ctx({ wantCatalog: [] })).newItems).toEqual([]);
    const m = settleOpenRow(opt(line({ id: "r", group: "material", unitCostCents: undefined })), ctx());
    expect(m.newItems).toEqual([]);
    expect(m.closed).toBe(true);
  });
  it("a wrong row stays open (nothing is made); the scroll asks quietly", () => {
    const loud = settleOpenRow(opt(line({ id: "r" })), ctx({ problems: 1 }));
    expect(loud).toMatchObject({ closed: false, decision: "stay-loud", newItems: [] });
    expect(settleOpenRow(opt(line({ id: "r" })), ctx({ problems: 1, quiet: true })).decision).toBe("stay-quiet");
  });
  it("a blank row is gone, with its choice", () => {
    const r = settleOpenRow(opt(line({ id: "r", name: "", unitPriceCents: 0 })), ctx());
    expect(r.option.lines).toEqual([]);
    expect(r.wantCatalog).toEqual([]);
  });
  it("no open row: nothing changes", () => {
    const o = opt(line());
    expect(settleOpenRow(o, ctx({ openId: null }))).toMatchObject({ closed: true, decision: "none", option: o });
  });
});

describe("row actions: menu, swipe and screen reader share one list (DS Б13, Р2)", () => {
  it("an ordinary line: «⋯» has replace, duplicate, hide, move, delete (delete last); swipe left — replace, delete; right — hide", () => {
    const a = rowActions(line(), {});
    expect(a.menu).toEqual(["replace", "duplicate", "hide", "move", "delete"]);
    expect(a.swipeLeft).toEqual(["replace", "delete"]);
    expect(a.swipeRight).toEqual(["hide"]);
  });
  it("a hidden line offers «show», not «hide»", () => {
    const a = rowActions(line({ unitPriceCents: 0, clientVisible: false }), {});
    expect(a.menu).toContain("show");
    expect(a.menu).not.toContain("hide");
    expect(a.swipeRight).toEqual(["show"]);
  });
  it("a module's line is not moved by hand", () => {
    expect(rowActions(line({ source: mark }), {}).menu).not.toContain("move");
  });
  it("the template editor keeps no hidden line: no hide / show", () => {
    const a = rowActions(line(), { noHide: true });
    expect(a.menu).not.toContain("hide");
    expect(a.swipeRight).toEqual([]);
  });
  it("a signed estimate has no actions at all", () => {
    expect(rowActions(line(), { locked: true })).toEqual({ menu: [], swipeLeft: [], swipeRight: [] });
  });
  it("hide: only a $0 line; a priced one is refused with a reason and nothing changes", () => {
    const lines = [line({ id: "a", unitPriceCents: 0 }), line({ id: "b", unitPriceCents: 500 })];
    expect(setHidden(lines, "b", "hide")).toBe("needZero");
    const r = setHidden(lines, "a", "hide");
    expect(r).not.toBe("needZero");
    expect((r as typeof lines)[0]!.clientVisible).toBe(false);
    expect((r as typeof lines)[1]).toBe(lines[1]);
  });
  it("show clears the mark (also on a priced line that came hidden)", () => {
    const lines = [line({ id: "b", unitPriceCents: 500, clientVisible: false })];
    const r = setHidden(lines, "b", "show") as typeof lines;
    expect(r[0]!.clientVisible).toBeUndefined();
  });
  it("an unknown id changes nothing", () => {
    const lines = [line()];
    expect(setHidden(lines, "zzz", "hide")).toBe(lines);
  });
});
