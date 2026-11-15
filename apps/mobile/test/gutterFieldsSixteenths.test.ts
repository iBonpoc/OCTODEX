import { describe, expect, it } from "vitest";
import { asFields, oneIn, tapeIn, unitFields } from "../src/modules/gutters/canvas/attrs";
import { extendRun, moveEndAlong } from "../src/modules/gutters/canvas/edit";

import type { Drawing } from "../src/modules/gutters/geometry";

/** #922: a unit picked in «Длина желоба» shows the same length, not the drawn one (41′ 1″ was reset). */
describe("unitFields: one length in every unit", () => {
  it("41′ 1″ = 493″ = 12.522 m = 1252.2 cm = 12522 mm", () => {
    expect(unitFields(493, "ftin")).toMatchObject({ ft: "41", inc: "1", e16: 0 });
    expect(unitFields(493, "in").one).toBe("493");
    expect(unitFields(493, "m").one).toBe("12.522");
    expect(unitFields(493, "cm").one).toBe("1252.2");
    expect(unitFields(493, "mm").one).toBe("12522");
  });
  it("fractions stay in feet + inches: 306⅜″ = 25′ 6″ + 6/16", () => {
    expect(unitFields(306.375, "ftin")).toMatchObject({ ft: "25", inc: "6", e16: 6 });
  });
  it("there and back again: the fields read as the same length (to 1/16″)", () => {
    for (const n of [493, 306.375, 120.125, 12, 6000]) {
      for (const u of ["in", "m", "cm", "mm"] as const) expect(oneIn(unitFields(n, u).one, u)).toBe(n);
      const f = unitFields(n, "ftin");
      expect(tapeIn(f.ft, f.inc, f.e16)).toBe(n);
    }
  });
});

describe("1/16″ review of #1195: nothing falls back to eighths", () => {
  const attrs = { profile: "k", size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" } as const;
  const drawing = (lengthIn: number): Drawing => ({ runs: [{ id: "a", a: [0, 0], b: [120, 0], lengthIn, attrs: { ...attrs } }], downspouts: [] });
  it("moveEndAlong: a pulled end keeps the odd sixteenth of a taped length", () => {
    const moved = moveEndAlong(drawing(120.1875), "a", 1, [121, 0]);
    expect(moved.runs[0]!.lengthIn).toBe(121.1875);
  });
  it("extendRun: a run grown straight on keeps the odd sixteenth", () => {
    const grown = extendRun(drawing(120.1875), [120, 0], [132, 0], { ...attrs });
    expect(grown?.runs[0]?.lengthIn).toBe(132.1875);
  });
  it("the fields read back exactly in every unit, every sixteenth", () => {
    for (let k = 1; k <= 192 * 2; k++) {
      for (const u of ["in", "m", "cm", "mm"] as const) {
        const n = k / 16;
        const back = oneIn(unitFields(n, u).one, u);
        // metric fields print a rounded number: reading it back lands on the same sixteenth
        expect(back, `${n}″ in ${u}`).toBe(n);
      }
    }
  });
  it("the corner sketch: 11.97″ more is a foot, never «12″»", () => {
    expect(asFields(11.97)).toEqual({ ft: "1", inch: "0" });
    expect(asFields(23.99)).toEqual({ ft: "2", inch: "0" });
    expect(asFields(12 + 5.1875)).toEqual({ ft: "1", inch: "5.1875" });
  });
});
