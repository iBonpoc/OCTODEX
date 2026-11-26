/** IconRow limits: row ≤ 5, inline ≤ 2; the over-limit is cut and named (BUILD-PLAN §1 поток Б). */
import { describe, expect, it } from "vitest";
import { component, font } from "@octo/design-tokens";
import { ICON_ROW_MAX, iconRowCell, iconRowItems } from "../src/ui/iconRowRules";

const six = ["a", "b", "c", "d", "e", "f"];
describe("IconRow limits", () => {
  it("row keeps 5, says the sixth is lost", () => {
    const r = iconRowItems(six, "row");
    expect(ICON_ROW_MAX.row).toBe(5);
    expect(r.shown).toEqual(["a", "b", "c", "d", "e"]);
    expect(r.over).toBe(1);
    expect(r.problem).toMatch(/6 actions, at most 5/);
  });
  it("inline keeps 2", () => {
    const r = iconRowItems(six, "inline");
    expect(r.shown).toEqual(["a", "b"]);
    expect(r.over).toBe(4);
  });
  it("within the limit — all, no problem", () => {
    expect(iconRowItems(["a", "b", "c"], "row")).toEqual({ shown: ["a", "b", "c"], over: 0, problem: undefined });
    expect(iconRowItems([], "inline").shown).toEqual([]);
  });
});

// #2761: at 1.25 on 390 the equal 64 cell broke «Позвонить» (78 wide at 1.25) into «Позвони / ть»
describe("IconRow cell at the system text size (DS §4.3)", () => {
  const W = component.quickAction.labelW;
  const cell = (k: number) => iconRowCell(k, W, font.labelMaxScale);
  it("the standard size: equal cells, 64 at most (as before)", () => {
    expect(cell(1)).toEqual({ equal: true, maxWidth: 64 });
    expect(cell(0.85)).toEqual({ equal: true, maxWidth: 64 }); // a smaller system text keeps the 64 cell
    expect(cell(NaN)).toEqual({ equal: true, maxWidth: 64 });
  });
  it("bigger: a cell by its word, wide enough for «Позвонить» (62 at 1.0)", () => {
    const c = cell(1.25);
    expect(c.equal).toBe(false);
    expect(c.maxWidth).toBe(80);
    expect(c.maxWidth).toBeGreaterThanOrEqual(Math.ceil(62 * 1.25));
  });
  it("the caption grows no more than labelMaxScale, nor its cell", () => {
    expect(cell(3).maxWidth).toBe(Math.round(W * font.labelMaxScale));
    expect(cell(1.5).maxWidth).toBe(cell(3).maxWidth);
  });
  it("five RU captions at 1.25 with the gaps fit the 358 row of a 390 phone", () => {
    const words = [62, 25, 35, 53, 49].map((w) => Math.max(component.roundButton.quick, Math.ceil(w * 1.25)));
    const total = words.reduce((a, b) => a + b, 0) + 4 * component.iconRow.gap;
    expect(words.every((w) => w <= cell(1.25).maxWidth)).toBe(true);
    expect(total).toBeLessThanOrEqual(358);
  });
});
