import { describe, expect, it } from "vitest";
import { component } from "@octo/design-tokens";
import { ATTENTION_MAX, SECOND_KEY, asksFirst, attentionRows, filledAccents, mainCount, moreItems, shownGroups, templateLayout, type TemplateKind } from "../src/ui/templates/templateRules";
import type { MainAction } from "../src/ui/templates/types";

const main: MainAction = { label: "Send invoice", onPress: () => {}, testID: "m" };
const second: MainAction = { label: "New estimate", onPress: () => {}, testID: "s" };
const longSecond: MainAction = { label: "x".repeat(component.pair.labelMax + 1), onPress: () => {}, testID: "ls" };
const KINDS: TemplateKind[] = ["overview", "list", "object", "editor", "calendar"];

describe("screen templates: one main button (BUILD-PLAN §1 Г)", () => {
  it("every template draws at most one main button, whatever is passed", () => {
    for (const kind of KINDS)
      for (const noBar of [false, true])
        for (const s of [undefined, second, longSecond]) {
          const l = templateLayout(kind, { back: true, icons: true, create: true, more: true, main, second: s, total: undefined, sections: true, chips: true, attention: true, summary: true, details: true, views: true, noBar });
          expect(mainCount(l), `${kind} noBar=${noBar}`).toBeLessThanOrEqual(1);
        }
  });
  it("the object, the editor and the overview draw the one main step they are given; a list and a calendar draw none", () => {
    expect(mainCount(templateLayout("object", { main }))).toBe(1);
    expect(mainCount(templateLayout("editor", { main }))).toBe(1);
    expect(mainCount(templateLayout("overview", { main }))).toBe(1);
    expect(mainCount(templateLayout("list", { main }))).toBe(0);
    expect(mainCount(templateLayout("calendar", { main }))).toBe(0);
    expect(mainCount(templateLayout("object", {}))).toBe(0);
  });
  it("a second step is never a second main one: in an editor it stands beside it or goes into «⋯»; on an object always «⋯»", () => {
    expect(templateLayout("editor", { main, second }).bottom).toEqual(["second", "main"]);
    expect(templateLayout("editor", { main, second: longSecond }).bottom).toEqual(["main"]);
    expect(templateLayout("editor", { main: { ...main, reason: "No signature" }, second }).bottom).toEqual(["main"]);
    expect(moreItems([], longSecond).map((i) => i.key)).toEqual([SECOND_KEY]);
    expect(moreItems([], second)).toEqual([]);
    expect(moreItems([], second, undefined, false, "No signature").map((i) => i.key)).toEqual([SECOND_KEY]);
    expect(moreItems([], second, undefined, true).map((i) => i.key)).toEqual([SECOND_KEY]);
    expect(templateLayout("object", { main, second }).under).not.toContain("second");
  });
  it("one FILLED accent on a screen (founder 21.11, #2350): an outlined main one is none", () => {
    for (const kind of KINDS) {
      const l = templateLayout(kind, { back: true, create: true, more: true, main, second, sections: true, attention: true });
      expect(filledAccents(l, main), kind).toBeLessThanOrEqual(1);
      expect(filledAccents(l, { ...main, outline: true }), kind).toBe(0);
    }
  });
});

describe("ObjectScreen layout", () => {
  const l = templateLayout("object", { back: true, create: true, more: true, main, sections: true });
  it("«‹ назад» first on the left, «⋯» the last on the right after «＋»", () => {
    expect(l.top[0]).toBe("back");
    expect(l.top.at(-1)).toBe("more");
    expect(l.top.indexOf("create")).toBeLessThan(l.top.indexOf("more"));
  });
  it("the main step right under the header and its actions, then the sections strip; NO pinned plate (LAYOUT-RULES П3, #2350)", () => {
    expect(l.under).toEqual(["header", "actions", "main", "sections"]);
    expect(l.bottom).toEqual([]);
    expect(l.body).not.toContain("main");
    for (const noBar of [false, true]) expect(templateLayout("object", { main, total: { label: "Total" }, noBar }).bottom).toEqual([]);
  });
  it("no main step — nothing under the actions", () => {
    expect(templateLayout("object", { sections: true }).under).toEqual(["header", "actions", "sections"]);
  });
  it("an editor: «Итого ˅» on the left of the main one in the compact bar", () => {
    expect(templateLayout("editor", { main, total: { label: "Total" } }).bottom).toEqual(["total", "main"]);
  });
});

describe("the other templates", () => {
  it("a list: search is the first icon of the header, the chips one strip under the title, the field only when opened", () => {
    const shut = templateLayout("list", { icons: true, create: true, more: true, chips: true });
    expect(shut.top).toEqual(["title", "search", "icons", "create", "more"]);
    expect(shut.under).toEqual(["chips"]);
    expect(templateLayout("list", { chips: true, searchOpen: true }).under).toEqual(["searchField", "chips"]);
    expect(templateLayout("list", { empty: true }).body).toEqual(["empty"]);
  });
  it("a calendar: the views, then the day strip under the title", () => {
    expect(templateLayout("calendar", { views: true }).under).toEqual(["views", "month", "days"]);
    expect(templateLayout("calendar", {}).under).toEqual(["month", "days"]);
  });
  it("a calendar: no strip in «Месяц»; the Week / Month / board is the `view` body in place of the day's rows", () => {
    expect(templateLayout("calendar", { views: true, monthView: true }).under).toEqual(["views", "month"]);
    expect(templateLayout("calendar", { viewBody: true, unassigned: true, undated: true }).body).toEqual(["view", "unassigned", "undated"]);
    expect(templateLayout("calendar", { viewBody: true, empty: true }).body).toEqual(["view"]);
  });
  it("an overview: no «назад», the next step first", () => {
    const o = templateLayout("overview", { main, attention: true, summary: true });
    expect(o.top).not.toContain("back");
    expect(o.body.slice(0, 2)).toEqual(["next", "main"]);
  });
  it("an editor: the save step pinned at the bottom", () => {
    expect(templateLayout("editor", { back: true, main }).bottom).toEqual(["main"]);
  });
});

describe("«⋯» and the rest", () => {
  it("a dangerous item is the last and asks first", () => {
    const items = moreItems([{ key: "del", label: "Delete", destructive: true }, { key: "arch", label: "Archive" }], longSecond);
    expect(items.map((i) => i.key)).toEqual(["arch", SECOND_KEY, "del"]);
    expect(asksFirst(items.at(-1))).toBe(true);
    expect(asksFirst(items[0])).toBe(false);
  });
  it("a dangerous item that asks its own question (ownAsk) stays red and last, but is not asked twice (Gutters #3016)", () => {
    const items = moreItems([{ key: "del", label: "Удалить замер", destructive: true, ownAsk: true }, { key: "arch", label: "Archive" }]);
    expect(items.at(-1)).toMatchObject({ key: "del", destructive: true });
    expect(asksFirst(items.at(-1))).toBe(false);
  });
  it("«Нужно внимание» shows at most three rows", () => {
    expect(attentionRows([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3], more: 2 });
    expect(attentionRows([1]).more).toBe(0);
    expect(ATTENTION_MAX).toBe(3);
  });
  it("an empty group is not drawn", () => {
    expect(shownGroups([{ rows: [] }, { rows: [1] }])).toEqual([{ rows: [1] }]);
  });
});
