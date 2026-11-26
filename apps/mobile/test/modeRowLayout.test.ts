import { describe, expect, it } from "vitest";
import { component, space } from "@octo/design-tokens";
import { modeRowOneLine } from "../src/ui/modeRowLayout";

// #2954 (founder 26.11: «почему это всё в отдельной строке?»): a totals row is one line where all of it fits, else two lines
// «слово · сумма» / «переключатель · поле» — never the field and the sum hanging on a line of their own
describe("modeRowOneLine — the totals row's layout (DS §8.7а, #2954)", () => {
  const need = (sw: number) => component.modeRow.titleW + sw + component.modeRow.fieldW + component.modeRow.sumW + 3 * space[3];
  it("a phone (390: the row is 326 wide, the switch ~200): two lines", () => {
    expect(modeRowOneLine(326, 200)).toBe(false);
  });
  it("exactly enough room: one line; a point less: two", () => {
    expect(modeRowOneLine(need(200), 200)).toBe(true);
    expect(modeRowOneLine(need(200) - 1, 200)).toBe(false);
  });
  it("a wide row (1280 column in one line): one line", () => {
    expect(modeRowOneLine(700, 200)).toBe(true);
  });
  it("not measured yet: two lines (no jump on a phone)", () => {
    expect(modeRowOneLine(0, 200)).toBe(false);
    expect(modeRowOneLine(700, 0)).toBe(false);
  });
});
