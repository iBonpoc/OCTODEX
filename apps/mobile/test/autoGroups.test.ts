/**
 * unit:autoGroups — #2363 q75 (founder 21.11.2026: «смета по видам, автоматически»): an estimate with no sections of its own and
 * lines of two kinds or more is SHOWN in kind groups; the option itself (what is saved, sent, signed) is not changed, and the
 * money is the same.
 */
import { describe, expect, it } from "vitest";
import type { CustomLine, CustomOption } from "@octo/estimating-engine";
import { newDoc, optionTotals } from "../src/features/estimateDoc";
import type { EstimateDoc } from "../src/data/types";
import { addSection, autoGroups } from "../src/features/sectionLayout";

const L = (id: string, group: CustomLine["group"], cents: number): CustomLine => ({ id, name: id, group, quantity: "1", unit: "ea", unitPriceCents: cents });
const mixed = (): CustomOption => ({ id: "o", name: "Good", lines: [L("a", "service", 15000), L("b", "labor", 18000), L("c", "material", 14556), L("d", "labor", 2500)] });
const docWith = (o: CustomOption): EstimateDoc => ({ ...newDoc(), options: [o] });

describe("unit:autoGroups — the kind groups of an estimate are a view", () => {
  it("mixed kinds, no own sections: every line stands in its kind's group, the ids are the same on every call", () => {
    const o = mixed();
    const g = autoGroups(o)!;
    expect(g.sections!.map((s) => s.kind)).toEqual(["material", "labor", "service"]);
    const kindOf = (id: string) => g.sections!.find((s) => s.id === g.lines.find((l) => l.id === id)!.sectionId)!.kind;
    expect(["a", "b", "c", "d"].map(kindOf)).toEqual(["service", "labor", "material", "labor"]);
    expect(autoGroups(o)!.sections!.map((s) => s.id)).toEqual(g.sections!.map((s) => s.id));
  });
  it("the option itself is not touched and the money is the same", () => {
    const o = mixed();
    const before = JSON.stringify(o);
    const g = autoGroups(o)!;
    expect(JSON.stringify(o)).toBe(before);
    expect(optionTotals(docWith(g), g).total).toBe(optionTotals(docWith(o), o).total);
  });
  it("one kind only, or the person's own sections: shown as it is", () => {
    expect(autoGroups({ id: "o", name: "x", lines: [L("a", "labor", 1), L("b", "labor", 2)] })).toBeNull();
    const own = addSection(mixed(), { title: "Двор" }, () => "Y")!.option;
    expect(autoGroups(own)).toBeNull();
  });
});
