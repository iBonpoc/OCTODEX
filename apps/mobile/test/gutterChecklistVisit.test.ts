/**
 * #607: the Gutters starter checklists, once the office has added them, come into every «работа» visit by themselves — and into
 * no inspection («осмотр»). The template is the company's own afterwards: the office may untick «работа» there.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("../src/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import type { ChecklistTemplate } from "../src/data/types";
import { checklistFor, itemsFromTemplate, starterTemplate, templatesOfActiveModules } from "../src/features/checklist";

const t = (k: string) => `«${k}»`;
let gutters: typeof import("../src/modules/gutters/module").default;
const templates = () => (gutters.checklistTemplates ?? []).map((s) => ({ key: s.key, tpl: starterTemplate("gutters", s, t as never, `tpl-${s.key}`)! }));
const byKey = (k: string) => templates().find((x) => x.key === k)!.tpl;

describe("starter checklists of Gutters in visits (#607, decided with the review)", () => {
  it("loads", async () => {
    gutters = (await import("../src/modules/gutters/module")).default;
    expect(gutters.checklistTemplates).toHaveLength(3);
  });
  it("«Перед монтажом» and «Сдача работы» apply to «работа» visits; «Чистка» to none by itself (no catalog service of cleaning to tie it to)", () => {
    expect(byKey("pre").appliesTo).toEqual({ everyVisit: false, visitKinds: ["work"], catalogItemIds: [] });
    expect(byKey("handover").appliesTo).toEqual({ everyVisit: false, visitKinds: ["work"], catalogItemIds: [] });
    expect(byKey("clean").appliesTo).toEqual({ everyVisit: false, visitKinds: [], catalogItemIds: [] });
  });
  it("an installation visit gets the items of two templates and none of the cleaning; an inspection gets none; every item has its templateId", () => {
    const ts = templates().map((x) => x.tpl);
    let n = 0;
    const work = checklistFor({ kind: "work" }, ts, () => `i${++n}`);
    expect(work).toHaveLength(byKey("pre").items.length + byKey("handover").items.length);
    for (const it of work) expect(["tpl-pre", "tpl-handover"], it.label).toContain(it.templateId);
    const clean = new Set(byKey("clean").items.map((i) => i.label));
    expect(work.some((i) => clean.has(i.label))).toBe(false);
    expect(checklistFor({ kind: "inspection" }, ts, () => `j${++n}`)).toEqual([]);
  });
  it("a visit with the service the office tied «Чистка» to gets the cleaning template (the office's own tie)", () => {
    const tied = { ...byKey("clean"), appliesTo: { everyVisit: false, visitKinds: [], catalogItemIds: ["svc-clean"] } };
    const ts = [byKey("pre"), byKey("handover"), tied];
    const w = checklistFor({ kind: "work", catalogItemIds: ["svc-clean"] }, ts, () => "x");
    expect(w.filter((i) => i.templateId === "tpl-clean")).toHaveLength(tied.items.length);
    expect(checklistFor({ kind: "work", catalogItemIds: ["other"] }, ts, () => "x").some((i) => i.templateId === "tpl-clean")).toBe(false);
  });
  it("the office's own choice stays: «работа» unticked — no visit takes it; an archived one never; a template twice in the list once", () => {
    const off = { ...byKey("pre"), appliesTo: { ...byKey("pre").appliesTo, visitKinds: [] } };
    const arch = { ...byKey("handover"), archivedAt: "2026-11-01T00:00:00Z" };
    expect(checklistFor({ kind: "work" }, [off, arch], () => "x")).toEqual([]);
    const twice = checklistFor({ kind: "work" }, [byKey("pre"), byKey("pre")], () => "x");
    expect(twice).toHaveLength(byKey("pre").items.length);
  });
  it("a module switched off puts nothing into new visits (its templates stay); the company's own always come", () => {
    const own: ChecklistTemplate = { id: "own", name: "Own", items: [{ id: "o1", label: "mine", kind: "check" as const, required: true }], appliesTo: { everyVisit: true, visitKinds: [], catalogItemIds: [] } };
    const all = [byKey("pre"), byKey("handover"), own];
    expect(templatesOfActiveModules(all, () => false).map((x) => x.id)).toEqual(["own"]);
    expect(templatesOfActiveModules(all, (k) => k === "gutters")).toHaveLength(3);
    expect(checklistFor({ kind: "work" }, templatesOfActiveModules(all, () => false), () => "x").map((i) => i.label)).toEqual(["mine"]);
  });
  it("a template put into a visit twice: the second time nothing (itemsFromTemplate — the visit already has its items)", () => {
    const tpl = byKey("pre");
    const first = checklistFor({ kind: "work" }, [tpl], () => "x").map((i) => ({ ...i }));
    expect(itemsFromTemplate({ checklist: first } as never, tpl, () => "y")).toEqual([]);
  });
});
