// #2422 (founder 23.11; audit MAP §6 «Перенос раздела»): while a section is carried, every section folds to its title — the place to
// drop it is found on a short list; the carried section's parents stay open (a sub-section must not vanish with them); the person's
// own folding is not touched — it comes back on the drop
import { describe, expect, it } from "vitest";
import type { CustomOption, EstimateSection } from "@octo/estimating-engine";
import { foldForDrag, viewRows } from "../src/features/sectionLayout";

const sections: EstimateSection[] = [{ id: "a", title: "A" }, { id: "a1", title: "A1", parentId: "a" }, { id: "b", title: "B" }, { id: "c", title: "C" }];
const line = (id: string, sectionId?: string) => ({ id, sectionId, name: id, quantity: "1", unit: "ea", unitPriceCents: 100, unitCostCents: null }) as unknown as CustomOption["lines"][number];
const o = { sections, lines: [line("x", "a"), line("y", "a1"), line("z", "b"), line("w", "c")] } as Pick<CustomOption, "lines" | "sections">;
const titles = (set: ReadonlySet<string>) => viewRows(o, set).map((r) => (r.type === "section" ? `§${r.section.id}${r.collapsed ? "-" : "+"}` : r.type === "line" ? r.line.id : "?"));

describe("a section in the hand folds the list (#2422)", () => {
  it("nothing held: the person's own folding as it is", () => {
    expect(foldForDrag(o, ["c"], null)).toEqual(new Set(["c"]));
  });
  it("a top section held: every section is its title — no lines between", () => {
    expect(titles(foldForDrag(o, [], "b"))).toEqual(["§a-", "§b-", "§c-"]);
  });
  it("a sub-section held: its parent stays open (the held one does not vanish), the rest fold", () => {
    expect(titles(foldForDrag(o, [], "a1"))).toEqual(["§a+", "x", "§a1-", "§b-", "§c-"]);
  });
  it("the person's own folding is not changed (it is a new set; on the drop the list is as before)", () => {
    const own = ["b"];
    foldForDrag(o, own, "a");
    expect(own).toEqual(["b"]);
    expect(titles(foldForDrag(o, own, null))).toEqual(["§a+", "x", "§a1+", "y", "§b-", "§c+", "w"]);
  });
});
