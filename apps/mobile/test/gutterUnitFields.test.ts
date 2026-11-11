import { describe, expect, it } from "vitest";
import { oneIn, tapeIn, unitFields } from "../src/modules/gutters/canvas/attrs";

/** #922: a unit picked in «Длина желоба» shows the same length, not the drawn one (41′ 1″ was reset). */
describe("unitFields: one length in every unit", () => {
  it("41′ 1″ = 493″ = 12.522 m = 1252.2 cm = 12522 mm", () => {
    expect(unitFields(493, "ftin")).toMatchObject({ ft: "41", inc: "1", e8: 0 });
    expect(unitFields(493, "in").one).toBe("493");
    expect(unitFields(493, "m").one).toBe("12.522");
    expect(unitFields(493, "cm").one).toBe("1252.2");
    expect(unitFields(493, "mm").one).toBe("12522");
  });
  it("eighths stay in feet + inches: 306⅜″ = 25′ 6″ + ⅜", () => {
    expect(unitFields(306.375, "ftin")).toMatchObject({ ft: "25", inc: "6", e8: 3 });
  });
  it("there and back again: the fields read as the same length (to 1/8″)", () => {
    for (const n of [493, 306.375, 120.125, 12, 6000]) {
      for (const u of ["in", "m", "cm", "mm"] as const) expect(oneIn(unitFields(n, u).one, u)).toBe(n);
      const f = unitFields(n, "ftin");
      expect(tapeIn(f.ft, f.inc, f.e8)).toBe(n);
    }
  });
});
