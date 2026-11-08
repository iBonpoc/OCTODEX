/** unit:checklistStarters — starter templates of modules (docs/specs/08 §11.11; step 14 CH3b): the registry's optional slot. */
import { describe, expect, it } from "vitest";
import { stableUuid, starterAdded, startersToAdd, starterTemplate, starterTemplateId } from "../src/features/checklist";
import { registerModule, type ModuleDef, type StarterChecklist } from "../src/modules/registry";
import type { ChecklistTemplate } from "../src/data/types";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const S1: StarterChecklist = {
  key: "install", nameKey: "chk2.title", visitKinds: ["work"], minPhotosAfter: 2,
  items: [{ id: U(1), labelKey: "chk3.label", kind: "check", required: true, hintKey: "chk3.hint" }, { id: U(2), labelKey: "chk2.kindPhoto", kind: "photo", required: false }],
};
const S2: StarterChecklist = { key: "clean", nameKey: "chk2.every", items: [{ id: U(3), labelKey: "chk3.label", kind: "check", required: true }] };
const t = (k: string) => `«${k}»`;
const tpl = (over: Partial<ChecklistTemplate>): ChecklistTemplate => ({ id: "t", name: "x", items: [], appliesTo: { everyVisit: false, visitKinds: [], catalogItemIds: [] }, ...over });
const def = (over: Partial<ModuleDef>): ModuleDef => ({ key: "fakemod", titleKey: "chk2.title", hintKey: "chk2.hint", trialDays: 7, priceCentsMonthly: 0, ...over });

describe("unit:checklistStarters", () => {
  it("a starter as the company's template: a new id, the text in the language given, the module's item ids", () => {
    expect(starterTemplate("fakemod", S1, t, "new-id")).toEqual({
      id: "new-id", name: "«chk2.title»", module: "fakemod", minPhotosAfter: 2,
      items: [{ id: U(1), label: "«chk3.label»", kind: "check", required: true, hint: "«chk3.hint»" }, { id: U(2), label: "«chk2.kindPhoto»", kind: "photo", required: false }],
      appliesTo: { everyVisit: false, visitKinds: ["work"], catalogItemIds: [] },
    });
  });
  it("added = a template of that module with its items — an archived one too; another module's does not count", () => {
    expect(starterAdded("fakemod", S1, [tpl({ module: "fakemod", items: [{ id: U(2), label: "y", kind: "check", required: true }], archivedAt: "2026-11-01T00:00:00Z" })])).toBe(true);
    expect(starterAdded("fakemod", S1, [tpl({ module: "other", items: [{ id: U(1), label: "y", kind: "check", required: true }] })])).toBe(false);
    expect(starterAdded("fakemod", S1, [])).toBe(false);
  });
  it("what to offer: the modules' starters not added yet; a module without the slot offers none", () => {
    const have = [tpl({ module: "fakemod", items: [{ id: U(3), label: "y", kind: "check", required: true }] })];
    expect(startersToAdd([{ key: "fakemod", checklistTemplates: [S1, S2] }, { key: "plain" }], have).map((x) => `${x.module}:${x.starter.key}`)).toEqual(["fakemod:install"]);
  });
  it("the registry refuses starter item ids the server would refuse (not lowercase uuid, repeated)", () => {
    expect(() => registerModule(def({ checklistTemplates: [{ ...S2, items: [{ ...S2.items[0]!, id: "A0000000-0000-4000-8000-000000000001" }] }] }))).toThrow(/uuid/);
    expect(() => registerModule(def({ checklistTemplates: [S1, { ...S2, items: [{ ...S2.items[0]!, id: U(1) }] }] }))).toThrow(/uuid/);
    expect(() => registerModule(def({ checklistTemplates: [S1, S2] }))).not.toThrow();
  });
  it("the registry refuses an empty starter, more than 100 items, a repeated key", () => {
    expect(() => registerModule(def({ checklistTemplates: [{ ...S2, items: [] }] }))).toThrow(/1..100/);
    expect(() => registerModule(def({ checklistTemplates: [S2, { ...S1, key: "clean" }] }))).toThrow(/own key/);
    const many = Array.from({ length: 101 }, (_, i) => ({ id: U(100 + i), labelKey: "chk3.label" as const, kind: "check" as const, required: true }));
    expect(() => registerModule(def({ checklistTemplates: [{ ...S2, items: many }] }))).toThrow(/1..100/);
  });
  it("a starter's template id: the same in one company (two phones — one row), other in another company; a uuid the server takes", () => {
    const a = starterTemplateId("co1", "fakemod", "install");
    expect(a).toBe(starterTemplateId("co1", "fakemod", "install"));
    expect(a).not.toBe(starterTemplateId("co2", "fakemod", "install"));
    expect(a).not.toBe(starterTemplateId("co1", "fakemod", "clean"));
    for (const x of [a, stableUuid(""), stableUuid("x".repeat(500))]) expect(x).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(Array.from({ length: 2000 }, (_, i) => stableUuid(`s${i}`))).size).toBe(2000);
  });
  it("added by its fixed id even when the office replaced every item (the company's own now)", () => {
    const own = tpl({ id: starterTemplateId("co1", "fakemod", "install"), module: "fakemod", items: [{ id: U(9), label: "mine", kind: "check", required: true }] });
    expect(starterAdded("fakemod", S1, [own], "co1")).toBe(true);
    expect(startersToAdd([{ key: "fakemod", checklistTemplates: [S1] }], [own], "co1")).toEqual([]);
  });
});
