import { describe, it, expect } from "vitest";
import type { CustomLine } from "@octo/estimating-engine";
import { dropLine, restoreDeleted } from "../src/features/estimateRows";

const ln = (id: string, over: Partial<CustomLine> = {}): CustomLine => ({ id, name: id, group: "material", quantity: "1", unit: "ea", unitPriceCents: 100, ...over });
const ids = (ls: CustomLine[]) => ls.map((l) => l.id).join(",");

/** delete one line the way the editor does: remember it and its index in the list as it stands now */
function del(lines: CustomLine[], id: string, series: { line: CustomLine; index: number }[]) {
  const index = lines.findIndex((l) => l.id === id);
  series.push({ line: lines[index], index });
  return dropLine(lines, id);
}

describe("unit:estimateDeleteSeries — one «Вернуть» for a series of deletions (DS §15.2, О15, #1307 в)", () => {
  it("every deleted line comes back to its own place", () => {
    const start = ["a", "b", "c", "d", "e"].map((x) => ln(x));
    const s: { line: CustomLine; index: number }[] = [];
    let l = del(start, "b", s);
    l = del(l, "d", s);
    l = del(l, "a", s);
    expect(ids(l)).toBe("c,e");
    expect(ids(restoreDeleted(l, s))).toBe("a,b,c,d,e");
  });
  it("an edit made between the deletions stays — «Вернуть» brings back only the deleted lines", () => {
    const s: { line: CustomLine; index: number }[] = [];
    let l = del(["a", "b", "c"].map((x) => ln(x)), "a", s);
    l = l.map((x) => (x.id === "b" ? { ...x, unitPriceCents: 999 } : x));
    l = del(l, "c", s);
    const back = restoreDeleted(l, s);
    expect(ids(back)).toBe("a,b,c");
    expect(back.find((x) => x.id === "b")?.unitPriceCents).toBe(999);
  });
  it("the lines come back as they were deleted, not as edited before (they were not on screen)", () => {
    const s: { line: CustomLine; index: number }[] = [];
    const l = del([ln("a", { name: "Gutter (тестовые)" }), ln("b")], "a", s);
    expect(restoreDeleted(l, s)[0].name).toBe("Gutter (тестовые)");
  });
  it("a line already back (a second tap) is not doubled", () => {
    const s: { line: CustomLine; index: number }[] = [];
    const l = del(["a", "b"].map((x) => ln(x)), "a", s);
    expect(ids(restoreDeleted(restoreDeleted(l, s), s))).toBe("a,b");
  });
});
