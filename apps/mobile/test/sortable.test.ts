import { describe, it, expect } from "vitest";
import type { CustomLine, CustomOption, EstimateSection } from "@octo/estimating-engine";
import { viewRows } from "../src/features/sectionLayout";
import { dragKind, insertionIndex, resolveDrop, rowKey, shiftOf, withoutBlock } from "../src/features/sortable";

const L = (id: string, sectionId?: string): CustomLine => ({ id, name: id, group: "service", quantity: "1", unit: "ea", unitPriceCents: 100, ...(sectionId ? { sectionId } : {}) });
const opt = (lines: CustomLine[], sections?: EstimateSection[]): CustomOption => ({ id: "o", name: "Good", lines, ...(sections ? { sections } : {}) });
// A: a1 a2 / sub A1: x1 / B: b1 / loose: z1 z2
const o = opt([L("a1", "A"), L("a2", "A"), L("x1", "A1"), L("b1", "B"), L("z1"), L("z2")], [{ id: "A", title: "A" }, { id: "A1", title: "A1", parentId: "A" }, { id: "B", title: "B" }]);
const rows = viewRows(o);
const keys = (rs = rows) => rs.map(rowKey);

describe("the list as rows", () => {
  it("keys and kinds", () => {
    expect(keys()).toEqual(["s:A", "l:a1", "l:a2", "s:A1", "l:x1", "s:B", "l:b1", "u", "l:z1", "l:z2"]);
    expect(rows.map((r) => dragKind(r))).toEqual(["section", "line", "line", "subsection", "line", "section", "line", null, "line", "line"]);
  });
  it("a section is taken whole; a subsection with its lines; a line alone", () => {
    expect(keys(withoutBlock(rows, "s:A").rest)).toEqual(["s:B", "l:b1", "u", "l:z1", "l:z2"]);
    expect(keys(withoutBlock(rows, "s:A1").rest)).toEqual(["s:A", "l:a1", "l:a2", "s:B", "l:b1", "u", "l:z1", "l:z2"]);
    expect(keys(withoutBlock(rows, "l:a1").rest)).toEqual(["s:A", "l:a2", "s:A1", "l:x1", "s:B", "l:b1", "u", "l:z1", "l:z2"]);
  });
});

describe("where a held line lands (resolveDrop)", () => {
  // rest (a1 held): s:A, a2, s:A1, x1, s:B, b1, u, z1, z2  → places 0..9
  it("before a line: into its section, before it", () => {
    expect(resolveDrop(rows, "l:a1", 1)).toEqual({ kind: "line", id: "a1", to: { sectionId: "A", beforeId: "a2" } });
    expect(resolveDrop(rows, "l:a1", 5)).toEqual({ kind: "line", id: "a1", to: { sectionId: "B", beforeId: "b1" } });
    expect(resolveDrop(rows, "l:a1", 7)).toEqual({ kind: "line", id: "a1", to: { sectionId: undefined, beforeId: "z1" } });
  });
  it("before a heading: at the end of the section above; right under a heading: into that section", () => {
    expect(resolveDrop(rows, "l:a1", 4)).toEqual({ kind: "line", id: "a1", to: { sectionId: "A1" } }); // after x1, before B
  });
  it("the end of the list: the end of «без раздела»; right under «без раздела»: loose", () => {
    expect(resolveDrop(rows, "l:a1", 9)).toEqual({ kind: "line", id: "a1", to: { sectionId: undefined } });
    // right under «без раздела»: before its first line, loose
    expect(resolveDrop(rows, "l:a1", 7)?.kind).toBe("line");
  });
  it("above the first heading: «без раздела»", () => {
    expect(resolveDrop(rows, "l:a1", 0)).toEqual({ kind: "line", id: "a1", to: {} });
  });
  it("into a folded section: its end", () => {
    const folded = viewRows(o, new Set(["B"]));
    // rest: s:A… s:B(closed) u z1 z2 ; place right after the folded heading
    const r = resolveDrop(folded, "l:a1", folded.length - 1 - 4);
    expect(r?.kind).toBe("line");
    const idx = withoutBlock(folded, "l:a1").rest.findIndex((x) => rowKey(x) === "s:B");
    expect(resolveDrop(folded, "l:a1", idx + 1)).toEqual({ kind: "line", id: "a1", to: { sectionId: "B" } });
  });
});

describe("where a held section lands", () => {
  it("a top section goes before the next top section, or to the end", () => {
    // rest without A: s:B, b1, u, z1, z2
    expect(resolveDrop(rows, "s:A", 0)).toEqual({ kind: "section", id: "A", to: { beforeId: "B" } });
    expect(resolveDrop(rows, "s:A", 2)).toEqual({ kind: "section", id: "A", to: {} });
  });
  it("a subsection stays in its section's children, or goes to another section", () => {
    // rest without A1: s:A a1 a2 s:B b1 u z1 z2
    expect(resolveDrop(rows, "s:A1", 2)).toEqual({ kind: "section", id: "A1", to: { parentId: "A" } });
    expect(resolveDrop(rows, "s:A1", 4)).toEqual({ kind: "section", id: "A1", to: { parentId: "B" } });
    expect(resolveDrop(rows, "s:A1", 0)).toEqual({ kind: "section", id: "A1", to: {} });
  });
  it("the «без раздела» heading cannot be carried", () => {
    expect(resolveDrop(rows, "u", 0)).toBeNull();
  });
});

describe("the geometry", () => {
  it("the place is between the middles of the other rows", () => {
    expect(insertionIndex([10, 30, 50], 5)).toBe(0);
    expect(insertionIndex([10, 30, 50], 31)).toBe(2);
    expect(insertionIndex([10, 30, 50], 99)).toBe(3);
    expect(insertionIndex([], 5)).toBe(0);
  });
  it("neighbours make room: the rows between the old and the new place move by the held row's height", () => {
    // held row slot 2 (rows 0,1 above; 2.. below once it is out); moving it up to place 0 pushes rows 0,1 down
    expect([0, 1, 2, 3].map((i) => shiftOf(i, 2, 0, 40))).toEqual([40, 40, 0, 0]);
    // moving it down to place 4 pulls rows 2,3 up
    expect([0, 1, 2, 3].map((i) => shiftOf(i, 2, 4, 40))).toEqual([0, 0, -40, -40]);
    expect(shiftOf(1, 2, 2, 40)).toBe(0);
  });
});
