/**
 * #2227 PR2 (spec 33-price-key §11.3–§11.7): the core's «variant of an item». One item for every colour; the colour is the
 * line's variant. The supplier order sums by item + variant, takes ONLY the variant's code (none — «code not set», never the
 * item's or another colour's: audit 19.11 №2), the variant's supplier and pack; a line naming no variant of such an item —
 * «not set». A merged item (attributes.mergedInto) is never found or listed again, and its lines count as the new item.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/cloud/client", () => ({ supabase: {} }));
import { makeSeed } from "../src/data/seed";
import type { CatalogItem, DB, Estimate, Job } from "../src/data/types";
import { draftsForJob, jobMaterialNeeds } from "../src/features/purchaseOrders";
import { catalogMatch, mergedInto, propertyCount, resolveMerged, usableItems, variantOk } from "../src/features/catalogMatch";
import { variantsFromRow } from "../src/cloud/repo";

const words = { variantNotSet: (a: string) => `${a} not set`, variantSkuNotSet: (a: string) => `${a} code not set`, attrWord: (a: string) => (a === "color" ? "Color" : a) };
const gutter = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  id: "g", kind: "material", name: "Gutter 5in K", unit: "ft", priceCents: 800, costCents: 400, supplierId: "s1", supplierSku: "G-ANY",
  attributes: { part: "gutter", size: "5" },
  variants: { color: { white: { sku: "W-1" }, brown: { sku: "B-1", supplierId: "s2", purchaseUnit: "pc", packSize: "10" }, black: {} } },
  ...over,
});
const line = (id: string, catalogItemId: string, quantity: string, variant?: string) =>
  ({ id, name: id, group: "material", quantity, unit: "ft", unitPriceCents: 800, catalogItemId,
     ...(variant ? { source: { module: "gutters", key: `k-${variant}`, variant: { attr: "color", value: variant } } } : {}) }) as never;

function company(lines: unknown[], catalog: CatalogItem[]): DB {
  const db = makeSeed();
  const est = {
    ...(db.estimates[0] as Estimate), id: "eV", status: "approved",
    doc: { settings: { tax: { enabled: false, rateBps: 0, groups: { service: false, labor: false, material: false } }, deposit: { kind: "none" } } as never,
           options: [{ id: "o", name: "O", lines }] },
    approval: { optionId: "o", addonIds: [], signerName: "C", signature: "", at: "", channel: "on_site", totalCents: 0, depositCents: 0 },
  } as Estimate;
  const job: Job = { ...(db.jobs[0] as Job), id: "jV", estimateId: "eV" };
  return { ...db, catalog, estimates: [est, ...db.estimates], jobs: [job, ...db.jobs], purchaseOrders: [] };
}

describe("unit:itemVariants — the supplier order by item + variant", () => {
  it("white and brown of one item: two needs, summed per colour", () => {
    const db = company([line("a", "g", "100", "white"), line("b", "g", "40", "brown"), line("c", "g", "20", "white")], [gutter()]);
    expect(jobMaterialNeeds(db, "jV")).toEqual([
      { catalogItemId: "g", variant: { attr: "color", value: "white" }, qty: "120" },
      { catalogItemId: "g", variant: { attr: "color", value: "brown" }, qty: "40" },
    ]);
  });
  it("the variant's code, supplier, unit and pack; the brown line goes to its own supplier", () => {
    const g = draftsForJob(company([line("a", "g", "100", "white"), line("b", "g", "40", "brown")], [gutter()]), "jV", [], false, words);
    const s1 = g.find((x) => x.supplierId === "s1")!.lines;
    const s2 = g.find((x) => x.supplierId === "s2")!.lines;
    expect(s1).toEqual([expect.objectContaining({ name: "Gutter 5in K · white", supplierSku: "W-1", unit: "ft" })]);
    expect(s2).toEqual([expect.objectContaining({ name: "Gutter 5in K · brown", supplierSku: "B-1", unit: "pc", qty: "4" })]);
  });
  it("audit №2: a colour without its code — «Color code not set», never the item's code or another colour's", () => {
    const g = draftsForJob(company([line("a", "g", "10", "black")], [gutter()]), "jV", [], false, words);
    const l = g[0]!.lines[0]!;
    expect(l.supplierSku).toBeUndefined();
    expect(l.note).toBe("Color code not set");
    expect(l.name).toBe("Gutter 5in K · black");
  });
  it("a colour the item does not know at all — no code, «code not set»", () => {
    const l = draftsForJob(company([line("a", "g", "10", "red")], [gutter()]), "jV", [], false, words)[0]!.lines[0]!;
    expect(l.supplierSku).toBeUndefined();
    expect(l.note).toBe("Color code not set");
  });
  it("a line naming no variant of an item with variants (picked by hand) — «Color not set», no code", () => {
    const l = draftsForJob(company([line("a", "g", "10")], [gutter()]), "jV", [], false, words)[0]!.lines[0]!;
    expect(l.supplierSku).toBeUndefined();
    expect(l.note).toBe("Color not set");
    expect(l.name).toBe("Gutter 5in K");
  });
  it("an item without variants (any other trade): its own code, as before", () => {
    const plain = gutter({ variants: undefined });
    const l = draftsForJob(company([line("a", "g", "10")], [plain]), "jV", [], false, words)[0]!.lines[0]!;
    expect(l.supplierSku).toBe("G-ANY");
    expect(l.note).toBeUndefined();
  });
  it("a line of a merged per-colour item counts as the new item with its colour (§11.4, §11.7.4)", () => {
    const old: CatalogItem = { id: "gW", kind: "material", name: "Gutter · White", unit: "ft", priceCents: 800, supplierSku: "OLD-W", attributes: { part: "gutter", color: "White", mergedInto: "g" } };
    const db = company([line("a", "gW", "30"), line("b", "g", "20", "white")], [gutter(), old]);
    expect(jobMaterialNeeds(db, "jV")).toEqual([{ catalogItemId: "g", variant: { attr: "color", value: "white" }, qty: "50" }]);
    const l = draftsForJob(db, "jV", [], false, words)[0]!.lines[0]!;
    expect(l.supplierSku).toBe("W-1");
  });
  it("a module's purchase line with a variant (S11g) sums by item + variant", () => {
    const db = company([], [gutter()]);
    const g = draftsForJob(db, "jV", [{ catalogItemId: "g", qty: "5", variant: { attr: "color", value: "White" } }, { catalogItemId: "g", qty: "3", variant: { attr: "color", value: "white" } }], false, words);
    expect(g[0]!.lines).toEqual([expect.objectContaining({ name: "Gutter 5in K · white", bomQty: "8", supplierSku: "W-1" })]);
  });
});

describe("unit:itemVariants — merged items and the server's shape", () => {
  const old: CatalogItem = { id: "gW", kind: "material", name: "Gutter · White", unit: "ft", priceCents: 800, attributes: { part: "gutter", color: "white", mergedInto: "g" } };
  it("a merged item is never found, never listed; mergedInto is a service property", () => {
    expect(mergedInto(old)).toBe("g");
    expect(catalogMatch([old, gutter()], { part: "gutter" }).map((x) => x.id)).toEqual(["g"]);
    expect(catalogMatch([old], { part: "gutter", color: "white" })).toEqual([]);
    expect(usableItems([old, gutter()]).map((x) => x.id)).toEqual(["g"]);
    expect(propertyCount(old.attributes)).toBe(2);
  });
  it("resolveMerged: the new item and the variant of the old one's value; not merged — itself", () => {
    expect(resolveMerged([gutter(), old], old)).toEqual({ item: gutter(), variant: { attr: "color", value: "white" } });
    expect(resolveMerged([gutter()], gutter())).toEqual({ item: gutter() });
    // the new item is gone (or merged itself): the old one stands for itself, never a guess
    expect(resolveMerged([old], old)).toEqual({ item: old });
  });
  it("variantsFromRow keeps only strings of the server's shape", () => {
    expect(variantsFromRow({ color: { white: { sku: "W-1", extra: 1 }, brown: {} } })).toEqual({ color: { white: { sku: "W-1" }, brown: {} } });
    expect(variantsFromRow(null)).toBeUndefined();
    expect(variantsFromRow(["x"])).toBeUndefined();
    expect(variantsFromRow({ color: "white" })).toBeUndefined();
  });
});

describe("unit:itemVariants — the core never names the module's property (spec §11.3.3, audit Ж3)", () => {
  it("no «color» / «gutter» in the core's variant code (comments aside)", async () => {
    const { readFileSync } = await import("node:fs");
    const code = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const f of ["features/purchaseOrders.ts", "features/catalogMatch.ts"]) expect(code(f)).not.toMatch(/colou?r|gutter/i);
  });
});

describe("unit:itemVariants — review #2241 (№1, №2, limits)", () => {
  const oldOf = (id: string, color: string): CatalogItem => ({ id, kind: "material", name: `Gutter · ${color}`, unit: "ft", priceCents: 800, supplierSku: `OLD-${color}`, attributes: { part: "gutter", color, mergedInto: "g" } });
  it("№1: two merged colours into an item with an empty property ({color:{}}): two lines, each «Color code not set», no code", () => {
    const target = gutter({ variants: variantsFromRow({ color: {} }) });
    expect(target.variants).toEqual({ color: {} });
    const db = company([line("a", "gW", "30"), line("b", "gB", "10")], [target, oldOf("gW", "White"), oldOf("gB", "Brown")]);
    const ls = draftsForJob(db, "jV", [], false, words).flatMap((g) => g.lines);
    expect(ls.map((l) => [l.name, l.supplierSku, l.note])).toEqual([["Gutter 5in K · brown", undefined, "Color code not set"], ["Gutter 5in K · white", undefined, "Color code not set"]]);
  });
  it("№1: the new item names no property — the old one stands for itself (never the new one without a variant)", () => {
    const old = oldOf("gW", "White");
    expect(resolveMerged([gutter({ variants: undefined }), old], old)).toEqual({ item: old });
    const { color: _c, ...noColour } = old.attributes!;
    const bare = { ...old, attributes: noColour };
    expect(resolveMerged([gutter(), bare], bare)).toEqual({ item: bare });
  });
  it("№2: a line with a variant on an item without variants — no code at all, «code not set»; it never mixes with the bare line", () => {
    const plain = gutter({ variants: undefined });
    const ls = draftsForJob(company([line("a", "g", "10", "white"), line("b", "g", "5")], [plain]), "jV", [], false, words).flatMap((g) => g.lines);
    expect(ls.map((l) => [l.name, l.supplierSku, l.note, l.bomQty])).toEqual([["Gutter 5in K", "G-ANY", undefined, "5"], ["Gutter 5in K · white", undefined, "Color code not set", "10"]]);
  });
  it("the server's keys are lowered and trimmed (an old or hand-written key is still found)", () => {
    expect(variantsFromRow({ color: { " White ": { sku: "W-1" } } })).toEqual({ color: { white: { sku: "W-1" } } });
  });
  it("variantOk mirrors app.variant_skus_ok", () => {
    expect(variantOk("white", { sku: "W-1", packSize: "10", purchaseUnit: "pc" }, 1)).toBe(true);
    expect(variantOk("White", null, 1)).toBe(false);
    expect(variantOk("x".repeat(121), null, 1)).toBe(false);
    expect(variantOk("w", { sku: "S".repeat(61) }, 1)).toBe(false);
    expect(variantOk("w", {}, 51)).toBe(false);
    expect(variantOk("w", { packSize: "0" }, 1)).toBe(false);
    expect(variantOk("w", { supplierId: "not-a-uuid" }, 1)).toBe(false);
    expect(variantOk("w", { purchaseUnit: " pc" }, 1)).toBe(false);
  });
});
