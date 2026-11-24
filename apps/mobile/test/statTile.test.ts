import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { statColumns, statRows, statSaid, statShown, STAT_ONE_COLUMN_SCALE } from "../src/ui/statTileLogic";

describe("StatTile / StatGrid (BUILD-SPEC §1)", () => {
  it("two in a row; one column from fontScale 1.35", () => {
    expect(statColumns(1)).toBe(2);
    expect(statColumns(1.34)).toBe(2);
    expect(statColumns(STAT_ONE_COLUMN_SCALE)).toBe(1);
    expect(statColumns(2)).toBe(1);
  });
  it("a zero tile is not drawn", () => {
    for (const z of [0, "0", "$0", "$0.00", " 0 ", ""]) expect(statShown(z), String(z)).toBe(false);
    for (const v of [3, "12", "$12,400", "$0.50", "10"]) expect(statShown(v), String(v)).toBe(true);
  });
  it("rows of the grid: 2×2, the last one may hold one", () => {
    expect(statRows([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
    expect(statRows([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(statRows([1, 2], 1)).toEqual([[1], [2]]);
  });
  // visual v2 «Плитки» (21.11): a card tile with an icon in a circle, not a pastel; the one yellow tile is `accent`
  it("the tile is a card with its word and an icon in a circle; one may be the yellow; «!» is the warn icon, the tile keeps its colour", () => {
    const src = readFileSync(join(__dirname, "..", "src", "ui", "statTile.tsx"), "utf8");
    expect(src).not.toMatch(/pastels/);
    expect(src).toMatch(/label: string;/);
    expect(src).toMatch(/c\.status\.warn\.text/);
    expect(src).toMatch(/minHeight: dense \? component\.statTile\.hSm \+ space\[2\] : small \? component\.statTile\.hSm : component\.statTile\.h/);
    expect(src).toMatch(/backgroundColor: accent \? c\.acc/);
    expect(src).toMatch(/component\.statTile\.icon/);
  });
  it("the sub line under the figure is said with it (wave 3: «Выезды 1 · 0 закрыто»)", () => {
    expect(statSaid("Выезды", 1, "0 закрыто")).toBe("Выезды: 1, 0 закрыто");
    expect(statSaid("Должны", "$1,840", undefined, "2 просрочены")).toBe("Должны: $1,840, 2 просрочены");
    expect(statSaid("Должны", "$1,840", "за 7 дн", "2 просрочены")).toBe("Должны: $1,840, за 7 дн, 2 просрочены");
    const src = readFileSync(join(__dirname, "..", "src", "ui", "statTile.tsx"), "utf8");
    expect(src).toMatch(/sub\?: string;/);
  });
});
