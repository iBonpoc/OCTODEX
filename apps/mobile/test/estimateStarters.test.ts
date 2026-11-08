/**
 * E3c (docs/specs/07 §12): starter estimate templates of a module — the registry's slot and its check, what to offer,
 * the starter as the company's template (the client's text in the document language, prices from the catalog only),
 * a template's copy and the builder's edit of its lines; a starter is sent as «insert or nothing» (ifNew, §12 №6).
 * A module stand-in («fakemod»): no module of the app has starters yet (Gutters fills its own slot).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const writes: { table: string; kind: string; row?: unknown; opts?: unknown; filters: unknown[][] }[] = [];
/** what an update … select("id") gives back: the rows it changed (0 — row_version moved on the server) */
const updated = { rows: [{ id: "x" }] as unknown[] };
const chain = (table: string): Record<string, unknown> => {
  let w: (typeof writes)[number] | undefined;
  let selected = false;
  const c: Record<string, unknown> = {
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => Promise.resolve({ data: selected ? updated.rows : null, error: null }).then(r, j),
  };
  for (const k of ["insert", "upsert", "update", "delete"])
    c[k] = (row?: unknown, opts?: unknown) => {
      w = { table, kind: k, row, opts, filters: [] };
      writes.push(w);
      return c;
    };
  for (const k of ["eq", "in", "is", "not", "order", "limit"])
    c[k] = (...a: unknown[]) => {
      w?.filters.push([k, ...a]);
      return c;
    };
  c.select = () => {
    selected = true;
    return c;
  };
  return c;
};
vi.mock("../src/cloud/client", () => ({ supabase: { from: (t: string) => chain(t), rpc: () => Promise.resolve({ data: null, error: null }) } }));

import { computeCustomOption } from "@octo/estimating-engine";
import type { CatalogItem, EstimateTemplate } from "@/data/types";
import {
  clearedCosts, copyTemplate, editedTemplate, estimateStartersToAdd, fromTemplate, starterEstimateId, starterEstimateTemplate, starterItem, templateForEdit, validTemplateDoc,
} from "@/features/estimateTemplate";
import { starterTemplateId } from "@/features/checklist";
import { registerModule, type ModuleDef, type StarterEstimate } from "../src/modules/registry";
import { applyOp, estimateTemplateToDb } from "../src/cloud/ops";
import { estimateTemplateFromDb } from "../src/cloud/repo";

// test prices («тестовые», rule 9)
const catalog: CatalogItem[] = [
  { id: "svc", kind: "service", name: "Service call", unit: "ea", priceCents: 15000, costCents: 5000, placeholder: true, attributes: { work: "call" } },
  { id: "mat", kind: "material", name: "Part", unit: "ft", priceCents: 0, costCents: 1000, vendorTaxBps: 0, markupBps: 5000, placeholder: true, attributes: { part: "run", size: "5" } },
  { id: "mat-ea", kind: "material", name: "Part each", unit: "ea", priceCents: 900, placeholder: true, attributes: { part: "run", size: "5" } },
  { id: "kit", kind: "kit", name: "Kit", unit: "ea", priceCents: 0, components: [], placeholder: true, attributes: { work: "kit" } },
];
const S: StarterEstimate = {
  key: "basic", nameKey: "est.tpl.title", noteKey: "est.tpl.hint",
  options: [
    {
      key: "good", nameKey: "est.tpl.blank", recommended: true,
      lines: [
        { key: "call", nameKey: "est.tpl.use", group: "service", quantity: "1", unit: "ea", match: { work: "call" } },
        { key: "run", nameKey: "est.tpl.copy", group: "material", quantity: "2.5", unit: "ft", match: { part: "run", size: "5" } },
        { key: "none", nameKey: "est.tpl.rename", group: "labor", quantity: "1", unit: "hr", match: { work: "nothing" } },
        { key: "kit", nameKey: "est.tpl.archive", group: "labor", quantity: "1", unit: "ea", match: { work: "kit" }, optional: true },
      ],
    },
  ],
};
const def = (over: Partial<ModuleDef>): ModuleDef => ({ key: "fakemod", titleKey: "est.tpl.title", hintKey: "est.tpl.who", trialDays: 7, priceCentsMonthly: 0, ...over });
const app = (k: string) => `app:${k}`;
const docT = (k: string) => `doc:${k}`;
const ctx = (over: Partial<Parameters<typeof starterEstimateTemplate>[2]> = {}) => ({ id: "fixed", catalog, tApp: app, tDoc: docT, depositBps: 1000, costsVisible: true, ...over });

beforeEach(() => {
  writes.length = 0;
  updated.rows = [{ id: "x" }];
});

describe("unit:estimateStarters", () => {
  it("the registry: a module without the slot, a good starter, a bad one refused", () => {
    expect(() => registerModule(def({}))).not.toThrow();
    expect(() => registerModule(def({ estimateTemplates: [S] }))).not.toThrow();
    expect(() => registerModule(def({ estimateTemplates: [S, S] }))).toThrow(/own key/);
    expect(() => registerModule(def({ estimateTemplates: [{ ...S, options: [] }] }))).toThrow(/1..10/);
    const bad = (line: Partial<StarterEstimate["options"][0]["lines"][0]>) => ({ ...S, options: [{ ...S.options[0]!, lines: [{ ...S.options[0]!.lines[0]!, ...line }] }] });
    expect(() => registerModule(def({ estimateTemplates: [bad({ quantity: "1,5" })] }))).toThrow(/decimal/);
    expect(() => registerModule(def({ estimateTemplates: [bad({ unit: "x".repeat(21) })] }))).toThrow(/unit/);
    const twice = { ...S, options: [{ ...S.options[0]!, lines: [S.options[0]!.lines[0]!, S.options[0]!.lines[0]!] }] };
    expect(() => registerModule(def({ estimateTemplates: [twice] }))).toThrow(/line keys/);
  });

  it("the fixed id: per company, module and key; never a checklist starter's id", () => {
    expect(starterEstimateId("c1", "fakemod", "basic")).toBe(starterEstimateId("c1", "fakemod", "basic"));
    expect(starterEstimateId("c2", "fakemod", "basic")).not.toBe(starterEstimateId("c1", "fakemod", "basic"));
    expect(starterEstimateId("c1", "fakemod", "basic")).not.toBe(starterTemplateId("c1", "fakemod", "basic"));
  });

  it("what to offer: not added (an archived one counts as added); a module without the slot offers none", () => {
    const mods = [{ key: "fakemod", estimateTemplates: [S] }, { key: "plain" }];
    expect(estimateStartersToAdd(mods, [], "c1")).toEqual([{ module: "fakemod", starter: S }]);
    const had: EstimateTemplate = { id: starterEstimateId("c1", "fakemod", "basic"), name: "x", doc: { options: [], settings: {} as never }, archivedAt: "2026-11-01T00:00:00Z" };
    expect(estimateStartersToAdd(mods, [had], "c1")).toEqual([]);
    // another company's id is not this one's
    expect(estimateStartersToAdd(mods, [had], "c2")).toHaveLength(1);
  });

  it("a line's item: by properties and the same unit; a kit never; nothing wanted — nothing", () => {
    expect(starterItem(catalog, { part: "run", size: "5" }, "ft")?.id).toBe("mat");
    expect(starterItem(catalog, { part: "run", size: "5" }, "EA")?.id).toBe("mat-ea");
    expect(starterItem(catalog, { work: "kit" }, "ea")).toBeUndefined();
    expect(starterItem(catalog, undefined, "ea")).toBeUndefined();
  });

  it("the starter as the company's template: name in the app's language, the rest in the document language, prices from the catalog", () => {
    const tpl = starterEstimateTemplate("fakemod", S, ctx())!;
    expect(tpl.id).toBe("fixed");
    expect(tpl.module).toBe("fakemod");
    expect(tpl.name).toBe("app:est.tpl.title");
    expect(tpl.doc.note).toBe("doc:est.tpl.hint");
    const o = tpl.doc.options[0]!;
    expect(o.name).toBe("doc:est.tpl.blank");
    expect(o.recommended).toBe(true);
    const [call, run, none, kit] = o.lines;
    expect(call).toMatchObject({ name: "doc:est.tpl.use", catalogItemId: "svc", unitPriceCents: 15000, quantity: "1" });
    // material: cost × (1 + tax) × (1 + markup) — the core's catalog price, never the module's
    expect(run).toMatchObject({ catalogItemId: "mat", unitPriceCents: 1500, quantity: "2.5" });
    expect(none!.unitPriceCents).toBe(0);
    expect(none!.catalogItemId).toBeUndefined();
    expect(kit).toMatchObject({ unitPriceCents: 0, optional: true, selected: false });
    expect(kit!.catalogItemId).toBeUndefined();
    // costs only beside the doc (estimate_template_line_costs), and the server would take the doc
    expect(tpl.costs).toEqual({ [call!.id]: 5000, [run!.id]: 1000 });
    expect(JSON.stringify(tpl.doc)).not.toContain("unitCostCents");
    expect(validTemplateDoc(tpl.doc, tpl.costs)).toBe(true);
    // tax and deposit — the company's; no discount
    expect(tpl.doc.settings.deposit).toEqual({ kind: "pct", bps: 1000 });
    expect(tpl.doc.settings.discount ?? null).toBeNull();
  });

  it("who does not see costs gets none; a used starter: catalog lines at today's price, unpriced lines «проверьте цену»", () => {
    const tpl = starterEstimateTemplate("fakemod", S, ctx({ costsVisible: false }))!;
    expect(tpl.costs).toBeUndefined();
    const used = fromTemplate(tpl.doc, catalog.map((x) => (x.id === "svc" ? { ...x, priceCents: 17500 } : x)), {}, false, true);
    const lines = used.doc.options[0]!.lines;
    expect(lines[0]!.unitPriceCents).toBe(17500);
    expect(used.checkPrice).toEqual([lines[2]!.id, lines[3]!.id]);
    // the engine sums (rule 8): 175.00 + 2.5 × 15.00 + 0 = 212.50; the add-on is not in the total
    expect(computeCustomOption(used.doc.options[0]!, used.doc.settings).subtotal).toBe(21250);
  });

  it("a company's own template: a $0 line without a link is meant (no «проверьте цену»); a gone item still is", () => {
    const own = { options: [{ id: "o", name: "A", lines: [
      { id: "free", name: "Free estimate", group: "service" as const, quantity: "1", unit: "ea", unitPriceCents: 0 },
      { id: "gone", name: "Old", group: "service" as const, quantity: "1", unit: "ea", unitPriceCents: 500, catalogItemId: "not-there" },
    ] }], settings: starterEstimateTemplate("fakemod", S, ctx())!.doc.settings };
    const r = fromTemplate(own, catalog, {}, false);
    expect(r.checkPrice).toEqual([r.doc.options[0]!.lines[1]!.id]);
    expect(fromTemplate(own, catalog, {}, false, true).checkPrice).toHaveLength(2);
  });

  it("a copy: new ids, the name given, no module's mark, no uses; costs only for who sees them", () => {
    const tpl = { ...starterEstimateTemplate("fakemod", S, ctx())!, uses: 3, lastUsedAt: "2026-11-02T00:00:00Z" };
    const c = copyTemplate(tpl, "Basic (copy)", true)!;
    expect(c.id).not.toBe(tpl.id);
    expect(c.name).toBe("Basic (copy)");
    expect(c.module).toBeUndefined();
    expect(c.uses).toBeUndefined();
    const ids = c.doc.options[0]!.lines.map((l) => l.id);
    expect(ids.some((id) => tpl.doc.options[0]!.lines.some((l) => l.id === id))).toBe(false);
    expect(Object.values(c.costs ?? {})).toEqual([5000, 1000]);
    expect(Object.keys(c.costs ?? {}).every((k) => ids.includes(k))).toBe(true);
    expect(copyTemplate(tpl, "Basic (copy)", false)!.costs).toBeUndefined();
    expect(copyTemplate(tpl, "   ", true)).toBeNull();
  });

  it("the builder edits a template's lines: its own ids kept (their costs stay theirs), the same id and mark", () => {
    const tpl = starterEstimateTemplate("fakemod", S, ctx())!;
    const doc = templateForEdit(tpl, true);
    expect(doc.options[0]!.lines[0]!.unitCostCents).toBe(5000);
    expect(templateForEdit(tpl, false).options[0]!.lines[0]!.unitCostCents).toBeUndefined();
    const lines = doc.options[0]!.lines;
    const changed = { ...doc, options: [{ ...doc.options[0]!, lines: [{ ...lines[0]!, quantity: "2" }, lines[1]!] }] };
    const next = editedTemplate(tpl, changed, true, "Renamed")!;
    expect(next).toMatchObject({ id: tpl.id, module: "fakemod", name: "Renamed" });
    expect(next.doc.options[0]!.id).toBe(tpl.doc.options[0]!.id);
    expect(next.doc.options[0]!.lines.map((l) => l.id)).toEqual([lines[0]!.id, lines[1]!.id]);
    expect(next.doc.options[0]!.lines[0]!.quantity).toBe("2");
    expect(next.costs).toEqual({ [lines[0]!.id]: 5000, [lines[1]!.id]: 1000 });
    // who does not see costs: no cost key at all — the server keeps the line's cost
    const blind = editedTemplate(tpl, templateForEdit(tpl, false), false)!;
    expect(blind.costs).toBeUndefined();
    expect(JSON.stringify(blind.doc)).not.toContain("unitCostCents");
  });

  it("the queue: a starter is inserted once and never updated over the office's edits (ifNew) — only a removed one revives", async () => {
    const tpl = starterEstimateTemplate("fakemod", S, ctx())!;
    await applyOp({ k: "est.template.save", template: tpl, ifNew: true }, "c1", "u1");
    expect(writes.map((w) => w.kind)).toEqual(["upsert", "update"]);
    expect(writes[0]!.opts).toMatchObject({ onConflict: "id", ignoreDuplicates: true });
    expect((writes[0]!.row as { module_key: string }).module_key).toBe("fakemod");
    // the revive: only a row with deleted_at set (a live one — another phone's, maybe edited — is never touched)
    expect(writes[1]!.row).toMatchObject({ deleted_at: null });
    expect(writes[1]!.filters).toEqual([["eq", "id", tpl.id], ["not", "deleted_at", "is", null]]);
    writes.length = 0;
    await applyOp({ k: "est.template.save", template: tpl }, "c1", "u1");
    expect(writes.map((w) => w.kind)).toEqual(["upsert", "update"]);
    expect(writes[1]!.row).not.toHaveProperty("module_key");
  });
});

describe("unit:estimateTemplateFollowups (§12.7)", () => {
  const tpl = (): EstimateTemplate => ({ ...starterEstimateTemplate("fakemod", S, ctx())!, rowVersion: 4 });

  it("the builder's edit goes over its row_version; a moved one is «someone changed it first», never retried", async () => {
    await applyOp({ k: "est.template.save", template: tpl(), baseRowVersion: 4 }, "c1", "u1");
    expect(writes.map((w) => w.kind)).toEqual(["upsert", "update"]);
    expect(writes[1]!.filters).toEqual([["eq", "id", "fixed"], ["eq", "row_version", 4]]);
    expect(writes[1]!.row).not.toHaveProperty("row_version");
    updated.rows = [];
    await expect(applyOp({ k: "est.template.save", template: tpl(), baseRowVersion: 4 }, "c1", "u1")).rejects.toMatchObject({ name: "PermanentError", hint: "row_version_conflict" });
  });

  it("a wiped cost goes as null (the server clears it); a kept one as its number; nothing else gets the key", () => {
    const x = tpl();
    const [l1, l2, l3] = x.doc.options[0]!.lines;
    const doc = templateForEdit(x, true);
    doc.options[0]!.lines = doc.options[0]!.lines.map((l) => (l.id === l1!.id ? { ...l, unitCostCents: undefined } : l));
    expect(clearedCosts(x, doc, true)).toEqual([l1!.id]);
    expect(clearedCosts(x, doc, false)).toEqual([]);
    const next = editedTemplate(x, doc, true)!;
    const lines = (estimateTemplateToDb(next, "c1", [l1!.id]).doc as { options: { lines: Record<string, unknown>[] }[] }).options[0]!.lines;
    expect(lines[0]!.unitCostCents).toBeNull();
    expect(lines[1]!.unitCostCents).toBe(1000);
    expect(lines[2]).not.toHaveProperty("unitCostCents");
    expect(l2 && l3).toBeTruthy();
  });

  it("«Отменить» after sending: the template is removed (deleted_at), not deleted", async () => {
    await applyOp({ k: "est.template.remove", id: "t9" }, "c1", "u1");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.kind).toBe("update");
    expect(Object.keys(writes[0]!.row as object)).toEqual(["deleted_at"]);
    expect(writes[0]!.filters).toEqual([["eq", "id", "t9"]]);
  });

  it("the phone reads row_version", () => {
    expect(estimateTemplateFromDb({ id: "t", name: "n", doc: tpl().doc, row_version: 7 }, [], []).rowVersion).toBe(7);
    expect(estimateTemplateFromDb({ id: "t", name: "n", doc: tpl().doc }, [], []).rowVersion).toBeUndefined();
  });
});
