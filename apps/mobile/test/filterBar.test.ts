/** One row of filters (founder 07.11): empty chips hidden — but «Все» and the chosen one always stay. */
import { describe, expect, it } from "vitest";
import { filterLabel, visibleFilters } from "../src/ui/filterBarRules";

const items = [
  { key: "all", label: "Все", count: 7 },
  { key: "owes", label: "Должны", count: 2 },
  { key: "estimate", label: "Смета у клиента", count: 0 },
  { key: "prospect", label: "Потенциальные", count: 0 },
  { key: "archived", label: "Архив", count: 1 },
];

describe("visibleFilters", () => {
  it("hides filters with nothing behind them", () => {
    expect(visibleFilters(items, "all").map((x) => x.key)).toEqual(["all", "owes", "archived"]);
  });
  it("a chosen filter that became empty stays visible (the person can see why the list is empty and leave it)", () => {
    expect(visibleFilters(items, "prospect").map((x) => x.key)).toEqual(["all", "owes", "prospect", "archived"]);
  });
  it("«Все» stays even at 0 (an empty company)", () => {
    expect(visibleFilters([{ key: "all", label: "Все", count: 0 }, { key: "owes", label: "Должны", count: 0 }], "all").map((x) => x.key)).toEqual(["all"]);
  });
  it("a filter without a count is always shown", () => {
    expect(visibleFilters([{ key: "all", label: "Все", count: 0 }, { key: "mine", label: "Мои" }], "all")).toHaveLength(2);
  });
  it("label: «Должны · 2», no count — just the word", () => {
    expect(filterLabel(items[1]!)).toBe("Должны · 2");
    expect(filterLabel({ key: "mine", label: "Мои" })).toBe("Мои");
  });
});
