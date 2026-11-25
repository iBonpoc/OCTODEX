/** IconRow limits: row ≤ 5, inline ≤ 2; the over-limit is cut and named (BUILD-PLAN §1 поток Б). */
import { describe, expect, it } from "vitest";
import { ICON_ROW_MAX, iconRowItems } from "../src/ui/iconRowRules";

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
