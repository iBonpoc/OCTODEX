/**
 * #1316 (founder 13.11): a length typed without «Done» — feet, «Далее», inches (the cursor goes on by itself), the fraction by buttons.
 */
import { describe, expect, it, vi } from "vitest";
import { inchesComplete, inchesTooBig, nextStage } from "../src/modules/gutters/draw/lengthEntry";

vi.mock("react-native", () => ({ ScrollView: () => null, View: () => null }));
vi.mock("@/theme/ThemeProvider", () => ({ useTheme: () => ({ c: {} }) }));
vi.mock("@/ui/controls", () => ({ ChoiceChips: () => null }));
vi.mock("@/ui/primitives", () => ({ Press: () => null, T: () => null }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (k: string) => k }) }));

describe("the stages of the entry", () => {
  it("feet → inches → fraction; the fraction is the last", () => {
    expect(nextStage("ft")).toBe("in");
    expect(nextStage("in")).toBe("frac");
    expect(nextStage("frac")).toBe("frac");
  });
});

describe("the inches are typed to the end → the cursor goes to the fraction", () => {
  it("a first digit 2–9 is complete (inches are under 12), 0 too (0″ needs no «Далее»); «1» may be 10 or 11 and waits", () => {
    for (const d of ["0", "2", "3", "7", "9"]) expect(inchesComplete(d)).toBe(true);
    expect(inchesComplete("1")).toBe(false);
    expect(inchesComplete("")).toBe(false);
  });
  it("12 and more are wrong at once (not at «Применить»): 12, 15, 99; 11 and 7 are fine", () => {
    for (const s of ["12", "15", "99", "100"]) expect(inchesTooBig(s)).toBe(true);
    for (const s of ["0", "7", "11", "", "7."]) expect(inchesTooBig(s)).toBe(false);
  });
  it("two digits are complete: 10, 11 (and a wrong 15 — the field says so on «Применить»)", () => {
    for (const s of ["10", "11", "15"]) expect(inchesComplete(s)).toBe(true);
  });
  it("a decimal point is not the end: «7.» goes on", () => {
    expect(inchesComplete("7.")).toBe(false);
    expect(inchesComplete("7.5")).toBe(false);
  });
});

describe("the fraction buttons (FracPicker): eighths in the main row, the odd sixteenths behind «1/16»", () => {
  it("fifteen fractions in two rows of eight; every fraction 0..15 is on exactly one row", async () => {
    const { EIGHTHS, ODD_SIXTEENTHS } = await import("../src/modules/gutters/draw/FracPicker");
    expect(EIGHTHS).toHaveLength(8);
    expect(ODD_SIXTEENTHS).toHaveLength(8);
    for (let e = 0; e < 16; e++) {
      const inEighths = e % 2 === 0 && EIGHTHS.includes((e / 2) as (typeof EIGHTHS)[number]);
      const inSixteenths = (ODD_SIXTEENTHS as readonly number[]).includes(e);
      expect(inEighths !== inSixteenths).toBe(true);
    }
  });
  it("an even number of sixteenths is an eighth (its key in the main row); an odd one is not", async () => {
    const { eighthKey } = await import("../src/modules/gutters/draw/FracPicker");
    expect(eighthKey(0)).toBe("0");
    expect(eighthKey(10)).toBe("5"); // ⅝
    expect(eighthKey(14)).toBe("7");
    expect(eighthKey(11)).toBeNull(); // 11/16
    expect(eighthKey(1)).toBeNull();
  });
});
