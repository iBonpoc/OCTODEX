/** unit:checklistStarters — starter templates of modules (docs/specs/08 §11.11; step 14 CH3b): the registry's optional slot. */
import { describe, expect, it } from "vitest";
import { starterAdded, startersToAdd, starterTemplate } from "../src/features/checklist";
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
});
