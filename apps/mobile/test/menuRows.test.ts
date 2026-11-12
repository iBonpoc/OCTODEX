import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { component } from "@octo/design-tokens";

const src = (...p: string[]) => readFileSync(join(__dirname, "..", "src", ...p), "utf8");

/** #1164, DS А2 / А3: a menu is at most 6.5 rows; a list of more than 12 is a sheet with search */
describe("long lists: the menu's height and the picker", () => {
  it("the token: 6.5 rows", () => {
    expect(component.menuMaxRows).toBe(6.5);
  });
  it("Menu cuts its list to menuMaxRows and opens at the chosen item", () => {
    const m = src("ui", "overlays.tsx");
    expect(m).toMatch(/component\.menuMaxRows \* size\.hitMin/);
    expect(m).toMatch(/findIndex\(\(it\) => it\.selected\)/);
  });
  it("SelectField opens a PickerSheet for more than 12 items, never a menu", () => {
    const f = src("ui", "selectField.tsx");
    expect(f).toMatch(/MENU_MAX = 12/);
    expect(f).toMatch(/items\.length > MENU_MAX/);
    expect(f).toMatch(/<PickerSheet/);
  });
  it("the picker's list is the sheet's own scroll: no ScrollView of its own", () => {
    expect(src("ui", "pickerSheet.tsx")).not.toMatch(/ScrollView/);
  });
});
