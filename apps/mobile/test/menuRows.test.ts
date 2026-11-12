import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { component } from "@octo/design-tokens";
import { menuListHeight, menuScrollTo } from "../src/ui/menuLayout";

const src = (...p: string[]) => readFileSync(join(__dirname, "..", "src", ...p), "utf8");
const ROW = 44;
const base = { rowH: ROW, maxRows: component.menuMaxRows, pad: 8, titleH: 0 };

/** #1164, DS А2 / А3: a menu is at most 6.5 rows; where it scrolls; a list of more than 12 is a sheet with search */
describe("the height of a long menu", () => {
  it("12 rows: 6.5 rows high; 20 rows too", () => {
    expect(menuListHeight({ ...base, count: 12, room: 800 })).toBe(6.5 * ROW);
    expect(menuListHeight({ ...base, count: 20, room: 800 })).toBe(6.5 * ROW);
  });
  it("fewer than 6.5 rows: all of them, no cut", () => {
    expect(menuListHeight({ ...base, count: 5, room: 800 })).toBe(5 * ROW);
    expect(menuListHeight({ ...base, count: 1, room: 800 })).toBe(ROW);
    expect(menuListHeight({ ...base, count: 6, room: 800 })).toBe(6 * ROW);
  });
  it("a low window (a phone on its side) cuts it further, the title takes its row", () => {
    expect(menuListHeight({ ...base, count: 12, room: 300 })).toBe(300 - 16);
    expect(menuListHeight({ ...base, count: 12, room: 300, titleH: ROW })).toBe(300 - 16 - ROW);
    expect(menuListHeight({ ...base, count: 12, room: 10 })).toBe(0);
  });
});

describe("where a long menu scrolls to", () => {
  const view = 6.5 * ROW;
  const content = 12 * ROW;
  it("the first row: the top", () => {
    expect(menuScrollTo({ rowY: 0, rowH: ROW, viewH: view, contentH: content })).toBe(0);
  });
  it("a row in the middle: in the middle of the window", () => {
    expect(menuScrollTo({ rowY: 6 * ROW, rowH: ROW, viewH: view, contentH: content })).toBe(6 * ROW - (view - ROW) / 2);
  });
  it("the last row: the end of the list, not past it", () => {
    expect(menuScrollTo({ rowY: 11 * ROW, rowH: ROW, viewH: view, contentH: content })).toBe(content - view);
  });
  it("a list that fits does not scroll", () => {
    expect(menuScrollTo({ rowY: 4 * ROW, rowH: ROW, viewH: 5 * ROW, contentH: 5 * ROW })).toBe(0);
  });
  it("rows of unequal height (a wrapped label): by the real place and height", () => {
    expect(menuScrollTo({ rowY: 300, rowH: 66, viewH: 286, contentH: 700 })).toBe(300 - (286 - 66) / 2);
  });
});

describe("the wiring", () => {
  it("the token: 6.5 rows", () => {
    expect(component.menuMaxRows).toBe(6.5);
  });
  it("Menu takes its height and its scroll from menuLayout", () => {
    const m = src("ui", "overlays.tsx");
    expect(m).toMatch(/menuListHeight\(/);
    expect(m).toMatch(/menuScrollTo\(/);
  });
  it("SelectField opens a PickerSheet for more than 12 items, never a menu", () => {
    const f = src("ui", "selectField.tsx");
    expect(f).toMatch(/MENU_MAX = 12/);
    expect(f).toMatch(/items\.length > MENU_MAX/);
    expect(f).toMatch(/<PickerSheet/);
  });
  it("the picker's list is the sheet's own scroll: no ScrollView of its own", () => {
    expect(src("ui", "pickerSheet.tsx")).not.toMatch(/<ScrollView|import[^;]*ScrollView/);
  });
});
