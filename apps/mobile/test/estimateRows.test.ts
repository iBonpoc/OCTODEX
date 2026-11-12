import { describe, it, expect } from "vitest";
import type { CustomLine } from "@octo/estimating-engine";
import { clearLine, dropLine, duplicateLine, isBlank, leaveDecision, reinsertLine, replaceLine, restoreLine, rowFigures, rowProblems, rowSummary } from "../src/features/estimateRows";

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
