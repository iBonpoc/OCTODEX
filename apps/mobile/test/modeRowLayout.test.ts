import { describe, expect, it } from "vitest";
import { component, space } from "@octo/design-tokens";
import { modeRowShape } from "../src/ui/modeRowLayout";

// #2954 (founder 26.11: «Депозит, маленький переключатель… Текстовое поле 10% и итоговая сумма»): a totals row is ONE line on a
// phone; two lines only when even the narrow parts do not fit (a large font)
describe("modeRowShape — the totals row's layout (DS §8.7а, #2954)", () => {
  const tog = component.modeToggle.cell * 3;
  const g = 3 * space[2];
  const lineNeed = component.modeToggle.titleMinW + tog + component.modeToggle.fieldNarrowW + component.modeToggle.sumMinW + g;
  const wideNeed = component.modeRow.titleW + tog + component.modeRow.fieldW + component.modeRow.sumW + g;
  it("a phone (390: the row is 326 wide): one line", () => {
    expect(lineNeed).toBeLessThanOrEqual(326);
    expect(modeRowShape(326, tog)).toBe("line");
  });
  it("the 820 totals column (the row is 320 wide — narrower than a phone's): one line too", () => {
    expect(modeRowShape(320, tog)).toBe("line");
  });
  it("a wide row: one line with the word as a column", () => {
    expect(modeRowShape(wideNeed, tog)).toBe("wide");
    expect(modeRowShape(wideNeed - 1, tog)).toBe("line");
  });
  it("too narrow even for the narrow parts (a large font): two lines", () => {
    expect(modeRowShape(lineNeed - 1, tog)).toBe("two");
  });
  it("not measured yet: one line (no jump on a phone)", () => {
    expect(modeRowShape(0, tog)).toBe("line");
    expect(modeRowShape(326, 0)).toBe("line");
  });
});
