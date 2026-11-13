import { describe, expect, it } from "vitest";
import type { CustomLine, CustomOption } from "@octo/estimating-engine";
import { MAX_OPTIONS, cloneOption, nextOptionName, recommend, withoutOption } from "../src/features/estimateDoc";

// «Варианты для клиента» (DS §8.10, spec 39 §11.2.6): the copy, the name, «recommended», removing one
const line = (o: Partial<CustomLine> & { id: string }): CustomLine => ({ name: o.id, group: "material", quantity: "1", unit: "ea", unitPriceCents: 1000, ...o });
const opt = (id: string, name: string, over: Partial<CustomOption> = {}): CustomOption => ({ id, name, lines: [], ...over });

describe("«Вариант — копия»", () => {
  it("new ids for the lines and the sections; each line stays in its section, a subsection under its parent", () => {
    const o = opt("o1", "Better", {
      recommended: true,
      sections: [{ id: "s1", title: "Roof" }, { id: "s2", title: "Front", parentId: "s1" }],
      lines: [line({ id: "a", sectionId: "s1" }), line({ id: "b", sectionId: "s2" }), line({ id: "c" }), line({ id: "d", sectionId: "gone" })],
    });
    const c = cloneOption(o, "Good");
    expect(c.id).not.toBe("o1");
    expect(c.name).toBe("Good");
    expect(c.recommended).toBeUndefined();
    const [s1, s2] = c.sections!;
    expect([s1!.id, s2!.id]).not.toContain("s1");
    expect(s2!.parentId).toBe(s1!.id);
    expect(c.lines.map((l) => l.sectionId)).toEqual([s1!.id, s2!.id, undefined, "gone"]);
    expect(new Set(c.lines.map((l) => l.id)).size).toBe(4);
    for (const l of c.lines) expect(["a", "b", "c", "d"]).not.toContain(l.id);
  });
  it("a change in the copy does not reach the source (a full copy, not shared objects)", () => {
    const o = opt("o1", "Better", { sections: [{ id: "s1", title: "Roof" }], lines: [line({ id: "a", sectionId: "s1" })] });
    const c = cloneOption(o, "Good");
    c.lines[0]!.unitPriceCents = 5;
    c.sections![0]!.title = "Gutters";
    expect(o.lines[0]!.unitPriceCents).toBe(1000);
    expect(o.sections![0]!.title).toBe("Roof");
    expect(o.lines[0]!.sectionId).toBe("s1");
  });
});

describe("the new option's name", () => {
  it("the first free of Good / Better / Best — never a repeat after a delete", () => {
    expect(nextOptionName([{ name: "Good" }])).toBe("Better");
    expect(nextOptionName([{ name: "Better" }])).toBe("Good");
    expect(nextOptionName([{ name: "Good" }, { name: "Best" }])).toBe("Better");
    expect(nextOptionName([{ name: "Good" }, { name: "Better" }, { name: "Best" }])).toBe("Option 4");
    expect(nextOptionName([{ name: "A" }, { name: "Option 3" }])).toBe("Good");
  });
  it("no more than three", () => expect(MAX_OPTIONS).toBe(3));
});

describe("«★ рекомендуем»", () => {
  const three = [opt("a", "Good", { recommended: true }), opt("b", "Better"), opt("c", "Best")];
  it("one at most: marking another takes it from the first", () => {
    expect(recommend(three, "b", true).map((o) => !!o.recommended)).toEqual([false, true, false]);
  });
  it("off again — none; the others untouched (the same objects)", () => {
    const r = recommend(three, "a", false);
    expect(r.map((o) => !!o.recommended)).toEqual([false, false, false]);
    expect(r[1]).toBe(three[1]);
    expect("recommended" in r[0]!).toBe(false);
  });
});

describe("removing an option", () => {
  const three = [opt("a", "Good"), opt("b", "Better", { recommended: true }), opt("c", "Best")];
  it("the one before is picked; «recommended» stays on its option", () => {
    const r = withoutOption(three, "c");
    expect(r.options.map((o) => o.id)).toEqual(["a", "b"]);
    expect(r.cur).toBe(1);
    expect(r.options[1]!.recommended).toBe(true);
    expect(withoutOption(three, "a").cur).toBe(0);
  });
  it("the last option stays", () => {
    const one = [opt("a", "Good")];
    expect(withoutOption(one, "a").options).toBe(one);
  });
});
