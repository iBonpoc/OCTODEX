import { describe, it, expect } from "vitest";
import { evalFormula, FormulaError } from "../src/formula.js";

describe("safe formula language (ADR-005 §3)", () => {
  it("hangers formula", () => {
    expect(evalFormula("ceil(gutter_lf / hanger_spacing_ft)", { gutter_lf: "149", hanger_spacing_ft: 2 }).toString()).toBe("75");
  });
  it("precedence and parentheses", () => {
    expect(evalFormula("2 + 3 * 4", {}).toString()).toBe("14");
    expect(evalFormula("(2 + 3) * 4", {}).toString()).toBe("20");
    expect(evalFormula("-2 * 3", {}).toString()).toBe("-6");
  });
  it("conditions with if / and / or / not and booleans", () => {
    expect(evalFormula("if(guards and not tear_off, gutter_lf, 0)", { guards: true, tear_off: false, gutter_lf: 80 }).toString()).toBe("80");
    expect(evalFormula("if(stories >= 2 or tile, 1, 0)", { stories: 1, tile: false }).toString()).toBe("0");
  });
  it("decimal arithmetic is exact", () => {
    expect(evalFormula("0.1 + 0.2", {}).toString()).toBe("0.3");
    expect(evalFormula("round(2.5)", {}).toString()).toBe("3");
    expect(evalFormula("max(1, 2.5, min(4, 3))", {}).toString()).toBe("3");
  });
  it("rejects unknown variables, functions, property access and junk", () => {
    expect(() => evalFormula("constructor", {})).toThrow(FormulaError);
    expect(() => evalFormula("eval(1)", {})).toThrow(FormulaError);
    expect(() => evalFormula("a.b", { a: 1 })).toThrow(FormulaError);
    expect(() => evalFormula("1 +", {})).toThrow(FormulaError);
    expect(() => evalFormula("x; drop", { x: 1 })).toThrow(FormulaError);
    expect(() => evalFormula("1 / 0", {})).toThrow(FormulaError);
  });
});
