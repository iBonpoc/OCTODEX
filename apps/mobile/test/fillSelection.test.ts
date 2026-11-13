/**
 * «Заливка» — the one look of a chosen item (DS «Выделение выбранного», #1306): a neutral raised fill + the small shadow, never
 * the accent (rule 2) and never an ink frame. The guards read the sources of the controls that show a choice.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (f: string) => readFileSync(join(__dirname, "..", "src", f), "utf8");

describe("«Заливка» of the chosen (#1306)", () => {
  it("the fill is surf2 with the small shadow", () => {
    const f = src("ui/fill.ts");
    expect(f).toMatch(/backgroundColor: c\.surf2/);
    expect(f).toMatch(/component\.shadowSm\.opacity/);
    expect(f).not.toMatch(/c\.acc/);
  });
  it("Segmented, ChoiceChips, MultiChips, the filter bar and the tab bar take it", () => {
    for (const f of ["ui/controls.tsx", "ui/filterBar.tsx", "nav/TabBar.tsx"]) expect(src(f), f).toMatch(/fillStyle\(c\)/);
  });
  it("the chosen is never the accent and never an ink frame", () => {
    const c = src("ui/controls.tsx");
    expect(c).not.toMatch(/sel \? c\.acc/);
    expect(c).not.toMatch(/sel \? c\.ink : c\.bd/);
    expect(src("ui/filterBar.tsx")).not.toMatch(/sel \? c\.ink : c\.bd|active \? c\.ink : c\.bd/);
    expect(src("nav/TabBar.tsx")).not.toMatch(/borderColor: c\.ink/);
  });
  it("a chosen chip of several carries a check icon, not «✓ » as text", () => {
    const c = src("ui/controls.tsx");
    expect(c).not.toMatch(/"✓ "/);
  });
});
