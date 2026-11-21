import { describe, expect, it } from "vitest";
import { component } from "@octo/design-tokens";
import { ATTENTION_MAX, SECOND_KEY, asksFirst, attentionRows, mainCount, moreItems, shownGroups, templateLayout, type TemplateKind } from "../src/ui/templates/templateRules";
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
  it("a second step is never a second main one: it stands beside it or goes into «⋯»", () => {
    const pair = templateLayout("object", { main, second });
    expect(pair.bottom).toEqual(["second", "main"]);
    const long = templateLayout("object", { main, second: longSecond });
    expect(long.bottom).toEqual(["main"]);
    expect(moreItems([], longSecond).map((i) => i.key)).toEqual([SECOND_KEY]);
    expect(moreItems([], second)).toEqual([]);
  });
});

describe("ObjectScreen layout", () => {
  const l = templateLayout("object", { back: true, create: true, more: true, main, sections: true });
  it("«‹ назад» first on the left, «⋯» the last on the right after «＋»", () => {
    expect(l.top[0]).toBe("back");
    expect(l.top.at(-1)).toBe("more");
    expect(l.top.indexOf("create")).toBeLessThan(l.top.indexOf("more"));
  });
  it("the sections strip right under the header and its actions", () => {
    expect(l.under).toEqual(["header", "actions", "sections"]);
  });
  it("the main step pinned at the bottom (MainStep bar), not in the content", () => {
    expect(l.bottom).toEqual(["main"]);
    expect(l.body).not.toContain("main");
  });
  it("without the pinned bar (820/1280) the same one step stands at the top of the content", () => {
    const wide = templateLayout("object", { back: true, more: true, main, sections: true, noBar: true });
    expect(wide.bottom).toEqual([]);
    expect(wide.body[0]).toBe("main");
    expect(mainCount(wide)).toBe(1);
  });
  it("«Итого ˅» stands on the left of the main one", () => {
    expect(templateLayout("object", { main, total: { label: "Total" } }).bottom).toEqual(["total", "main"]);
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
    expect(templateLayout("calendar", { views: true }).under).toEqual(["views", "days"]);
    expect(templateLayout("calendar", {}).under).toEqual(["days"]);
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
  it("«Нужно внимание» shows at most three rows", () => {
    expect(attentionRows([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3], more: 2 });
    expect(attentionRows([1]).more).toBe(0);
    expect(ATTENTION_MAX).toBe(3);
  });
  it("an empty group is not drawn", () => {
    expect(shownGroups([{ rows: [] }, { rows: [1] }])).toEqual([{ rows: [1] }]);
  });
});
