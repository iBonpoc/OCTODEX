/** HeaderIcon `badge` (wave 3): the bell / the offline queue count — none at 0, «99+» past 99; GroupRow's hour is said first. */
import { describe, expect, it } from "vitest";
import { badgeText } from "../src/ui/headerIconRules";
import { rowSaid } from "../src/ui/groupedListLogic";

describe("header icon count", () => {
  it("none at 0 or less, the number up to 99, then 99+", () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(-2)).toBeNull();
    expect(badgeText(Number.NaN)).toBeNull();
    expect(badgeText(1)).toBe("1");
    expect(badgeText(99)).toBe("99");
    expect(badgeText(100)).toBe("99+");
  });
  it("a row led by its hour says the hour first", () => {
    expect(rowSaid({ title: "David Kim", subtitle: "Siding", when: "8:30 AM" })).toBe("8:30 AM, David Kim, Siding");
  });
});
