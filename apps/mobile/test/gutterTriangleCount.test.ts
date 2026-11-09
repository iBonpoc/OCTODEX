import { describe, expect, it } from "vitest";
import { countOnKeyboardHide, triKey } from "../src/modules/gutters/draw/triangleCount";

const A = { ft: "10", inch: "0" };
const B = { ft: "10", inch: "0.125" };
const C = { ft: "16", inch: "4" };
const none = { ft: "", inch: "" };

describe("«Посчитать угол» from the first tap (#696)", () => {
  it("C typed, the keyboard goes → it counts (before: nothing until a second tap)", () => {
    expect(countOnKeyboardHide(A, B, C, null)).toBe(true);
  });
  it("C not typed → the keyboard going counts nothing (A or B edited only)", () => {
    expect(countOnKeyboardHide(A, B, none, null)).toBe(false);
    expect(countOnKeyboardHide(A, B, { ft: " ", inch: "" }, null)).toBe(false);
  });
  it("the same lengths already counted (by the button) → not again", () => {
    expect(countOnKeyboardHide(A, B, C, triKey(A, B, C))).toBe(false);
  });
  it("a length changed after counting → counts the new one", () => {
    expect(countOnKeyboardHide(A, B, { ft: "16", inch: "5" }, triKey(A, B, C))).toBe(true);
    expect(countOnKeyboardHide({ ft: "11", inch: "0" }, B, C, triKey(A, B, C))).toBe(true);
  });
  it("the key ignores spaces round a number", () => {
    expect(triKey(A, B, { ft: " 16", inch: "4 " })).toBe(triKey(A, B, C));
  });
});
