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
  it("a first chip at 0 is hidden too when it is not chosen («Ждут даты · 0» on «Работы», spec 31 §13)", () => {
    expect(visibleFilters([{ key: "unscheduled", label: "Ждут даты", count: 0 }, { key: "scheduled", label: "Запланированы", count: 5 }], "scheduled").map((x) => x.key)).toEqual(["scheduled"]);
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

import { activeFilterCount, chosenFilters, filterStoreKey, type FilterGroup } from "../src/ui/filterBarRules";

describe("the «Фильтр» sheet (spec 31 §6)", () => {
  const toggle = () => undefined;
  const groups: FilterGroup[] = [
    { key: "src", title: "Источник", onToggle: toggle, options: [{ key: "g", label: "Google", count: 1, on: true }, { key: "y", label: "Yelp", count: 0, on: false }] },
    { key: "tag", title: "Метки", onToggle: toggle, options: [{ key: "vip", label: "VIP", on: true }, { key: "hoa", label: "HOA", on: true }] },
  ];
  it("the chosen line lists what is on, group by group, in order", () => {
    expect(chosenFilters(groups).map((x) => `${x.group.key}:${x.option.key}`)).toEqual(["src:g", "tag:vip", "tag:hoa"]);
  });
  it("the button counts what is on; nothing on — 0", () => {
    expect(activeFilterCount(groups)).toBe(3);
    expect(activeFilterCount([{ ...groups[0]!, options: groups[0]!.options.map((o) => ({ ...o, on: false })) }])).toBe(0);
  });
  it("each list keeps its filters under its own key", () => {
    expect(filterStoreKey("clients")).toBe("octo.filter.clients.v1");
    expect(filterStoreKey("leads")).not.toBe(filterStoreKey("clients"));
  });
});

import { searchAfter, searchState } from "../src/ui/filterBarRules";

describe("the search as an icon (founder 07.11, spec 31 §6 п.2а)", () => {
  it("closed with nothing typed — the plain magnifier", () => expect(searchState(false, "")).toBe("closed"));
  it("closed with text — the magnifier is marked: the list is still searched", () => {
    expect(searchState(false, "mitch")).toBe("closedActive");
    expect(searchState(false, "   ")).toBe("closed");
  });
  it("open — the field, whatever is typed", () => {
    expect(searchState(true, "")).toBe("open");
    expect(searchState(true, "mitch")).toBe("open");
  });
  it("a tap opens with the same text; a blur closes and keeps it; ✕ empties and closes", () => {
    expect(searchAfter("tap", "mitch")).toEqual({ open: true, q: "mitch" });
    expect(searchAfter("blur", "")).toEqual({ open: false, q: "" });
    expect(searchAfter("blur", "mitch")).toEqual({ open: false, q: "mitch" });
    expect(searchAfter("clear", "mitch")).toEqual({ open: false, q: "" });
  });
});

import { chosenLabel, SEARCH_FROM, sheetOptions } from "../src/ui/filterBarRules";

describe("one at a time and a long group (spec 31, «План» — director 07.11)", () => {
  it("a chosen option of a one-at-a-time group says its group: «Мастер: Ivan»; the others just the option", () => {
    expect(chosenLabel({ title: "Мастер", single: true }, { label: "Ivan" })).toBe("Мастер: Ivan");
    expect(chosenLabel({ title: "Метки" }, { label: "VIP" })).toBe("VIP");
  });
  const people = (n: number, onAt = -1) => Array.from({ length: n }, (_, i) => ({ key: `m${i}`, label: i === 3 ? "Ivan Sokolov" : `Person ${i}`, on: i === onAt }));
  it("the sheet searches a searchable group only past 10 rows; what is on stays", () => {
    expect(sheetOptions({ options: people(SEARCH_FROM), searchable: true }, "ivan")).toHaveLength(SEARCH_FROM);
    expect(sheetOptions({ options: people(12), searchable: false }, "ivan")).toHaveLength(12);
    expect(sheetOptions({ options: people(12), searchable: true }, " IVAN ").map((o) => o.label)).toEqual(["Ivan Sokolov"]);
    expect(sheetOptions({ options: people(12, 7), searchable: true }, "ivan").map((o) => o.key)).toEqual(["m3", "m7"]);
    expect(sheetOptions({ options: people(12), searchable: true }, "")).toHaveLength(12);
  });
});
