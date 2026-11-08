/**
 * 19 §9 (P1, P2): the tech does not see our costs. The server keeps the price list's cost and the estimates' margin in
 * side tables only can_view_costs reads (catalog_item_costs, estimate_version_costs; migration 20261108130000, T99/T100).
 * loadCompanyDB takes them from there; a server before the migration has no such tables — then the old places
 * (catalog_items' cost columns, totals.marginPct) are read, as before. catalog.save writes the item's exact cost to
 * the side table, so it can be cleared; no right (sales, 42501) or no table — the item is still saved.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

let rows: Record<string, Record<string, unknown>[]> = {};
/** tables a read of which answers with an error (no such table before the migration) */
let missing = new Set<string>();
/** tables a read of which fails like a dropped connection */
let dropped = new Set<string>();
const writes: { table: string; row: unknown; opts: unknown }[] = [];
const writeErr: Record<string, { code: string }> = {};
/** onlyNew's read-back (#377): which tables were read back, and what this company sees under the id */
const readBacks: string[] = [];
const readBackRow: { value: { id: string; deleted_at: string | null } | null } = { value: { id: "i1", deleted_at: null } };
function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "order", "limit", "in", "not", "range", "gte"]) b[m] = () => b;
  b.then = (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) =>
    Promise.resolve(
      dropped.has(table)
        ? { data: null, error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 }
        : missing.has(table)
        ? { data: null, error: { message: `relation "public.${table}" does not exist`, code: "PGRST205" }, status: 404 }
        : { data: rows[table] ?? [], error: null },
    ).then(ok, bad);
  b.maybeSingle = () => {
    readBacks.push(table);
    return Promise.resolve({ data: readBackRow.value, error: null });
  };
  b.upsert = (row: unknown, opts: unknown) => {
    writes.push({ table, row, opts });
    const e = writeErr[table];
    return Promise.resolve(e ? { data: null, error: { message: "no", code: e.code }, status: 403 } : { data: null, error: null });
  };
  return b;
}
vi.mock("../src/cloud/client", () => ({
  supabase: { from: (t: string) => builder(t), rpc: () => Promise.resolve({ data: null, error: null }) },
}));
import { costsVisibleFor, loadCompanyDB } from "../src/cloud/repo";
import { applyOp, catalogCostChange } from "../src/cloud/ops";
import { editClean, editOk, editPrice } from "../src/features/catalogEdit";

const base = (role: string) => ({
  memberships: [{ user_id: "u-me", role, status: "active", users: { full_name: "Me" } }],
  customers: [{ id: "c-1", display_name: "Ann", status: "active" }],
  properties: [{ id: "p-1", customer_id: "c-1", address_line1: "1 Elm St", address_city: "Pasadena" }],
  estimates: [{ id: "e-1", customer_id: "c-1", property_id: "p-1", title: "Gutters", status: "draft", current_version_id: "v-1", number: "EST-1" }],
});
afterEach(() => {
  rows = {};
  missing = new Set();
  dropped = new Set();
  writes.length = 0;
  readBacks.length = 0;
  readBackRow.value = { id: "i1", deleted_at: null };
  for (const k of Object.keys(writeErr)) delete writeErr[k];
});

describe("unit:techNoCosts — read (loadCompanyDB)", () => {
  it("the office: cost, supplier tax, markup and margin come from the side tables", async () => {
    rows = {
      ...base("office"),
      catalog_items: [{ id: "i1", kind: "material", name: "Bracket (test)", unit: "ea", unit_price_cents: 1213, unit_cost_cents: null, vendor_tax_bps: null, markup_bps: null }],
      catalog_item_costs: [{ item_id: "i1", unit_cost_cents: 1000, vendor_tax_bps: 1025, markup_bps: 1000 }],
      estimate_versions: [{ id: "v-1", estimate_id: "e-1", totals: { total: 100000, deposit: 10000 } }],
      estimate_version_costs: [{ version_id: "v-1", margin_pct: "41.2" }],
    };
    const db = await loadCompanyDB("co-1", "u-me");
    expect(db.catalog[0]).toMatchObject({ priceCents: 1213, costCents: 1000, vendorTaxBps: 1025, markupBps: 1000 });
    expect(db.estimates[0]!.marginPct).toBe("41.2");
  });
  it("a margin of null in the side table (costs not complete) is null, not the old totals", async () => {
    rows = {
      ...base("office"),
      estimate_versions: [{ id: "v-1", estimate_id: "e-1", totals: { total: 1, deposit: 0, marginPct: "9.9" } }],
      estimate_version_costs: [{ version_id: "v-1", margin_pct: null }],
    };
    expect((await loadCompanyDB("co-1", "u-me")).estimates[0]!.marginPct).toBeNull();
  });
  it("a server before the migration (no side tables): the old columns and totals.marginPct, as before", async () => {
    rows = {
      ...base("office"),
      catalog_items: [{ id: "i1", kind: "material", name: "Bracket (test)", unit: "ea", unit_price_cents: 1213, unit_cost_cents: 1000, vendor_tax_bps: 1025, markup_bps: 1000 }],
      estimate_versions: [{ id: "v-1", estimate_id: "e-1", totals: { total: 100000, deposit: 10000, marginPct: "41.2" } }],
    };
    missing = new Set(["catalog_item_costs", "estimate_version_costs"]);
    const db = await loadCompanyDB("co-1", "u-me");
    expect(db.catalog[0]).toMatchObject({ costCents: 1000, vendorTaxBps: 1025, markupBps: 1000 });
    expect(db.estimates[0]!.marginPct).toBe("41.2");
  });
  it("a dropped read of a side table fails the load — never «no cost» that the next save would write back (M2)", async () => {
    rows = { ...base("office"), catalog_items: [{ id: "i1", kind: "material", name: "B (test)", unit: "ea", unit_price_cents: 1 }] };
    dropped = new Set(["catalog_item_costs"]);
    await expect(loadCompanyDB("co-1", "u-me")).rejects.toBeTruthy();
    dropped = new Set(["estimate_version_costs"]);
    await expect(loadCompanyDB("co-1", "u-me")).rejects.toBeTruthy();
  });
  it("the tech: the server gives no side rows and blank columns — no cost, no margin on the phone", async () => {
    rows = {
      ...base("tech"),
      catalog_items: [{ id: "i1", kind: "material", name: "Bracket (test)", unit: "ea", unit_price_cents: 1213, unit_cost_cents: null, vendor_tax_bps: null, markup_bps: null }],
      estimate_versions: [{ id: "v-1", estimate_id: "e-1", totals: { total: 100000, deposit: 10000 } }],
    };
    const db = await loadCompanyDB("co-1", "u-me");
    expect(db.catalog[0]!.priceCents).toBe(1213);
    expect(db.catalog[0]!.costCents).toBeUndefined();
    expect(db.catalog[0]!.markupBps).toBeUndefined();
    expect(db.catalog[0]!.vendorTaxBps).toBeUndefined();
    expect(db.estimates[0]!.marginPct).toBeNull();
  });
});

const item = (over: object = {}) => ({ id: "i1", kind: "material" as const, name: "Bracket (test)", unit: "ea", priceCents: 1213, placeholder: true, ...over });

describe("unit:techNoCosts — write (catalog.save)", () => {
  it("only the changed cost fields go to the server; a cleared markup is sent as null", async () => {
    const prev = item({ costCents: 900, vendorTaxBps: 1025, markupBps: 1000 });
    const now = item({ costCents: 1000, vendorTaxBps: 1025 });
    const costs = catalogCostChange(prev, now);
    expect(costs).toEqual({ costCents: 1000, markupBps: null });
    await applyOp({ k: "catalog.save", item: now, costs }, "co-1", "u-1");
    expect(writes.map((w) => w.table)).toEqual(["catalog_items", "catalog_item_costs"]);
    expect(writes[0]!.row).not.toHaveProperty("vendor_tax_bps");
    expect(writes[0]!.row).toMatchObject({ unit_cost_cents: 1000, markup_bps: null });
    expect(writes[1]).toEqual({ table: "catalog_item_costs", row: { item_id: "i1", company_id: "co-1", unit_cost_cents: 1000, markup_bps: null }, opts: { onConflict: "item_id" } });
  });
  it("review #383 №2: a phone without costs (old cache, a failed load, sales made office) saves a name — no cost is sent, nothing is erased", async () => {
    const cached = item({ name: "Bracket" }); // no cost on the phone
    const costs = catalogCostChange(cached, { ...cached, name: "Bracket 2" });
    expect(costs).toEqual({});
    await applyOp({ k: "catalog.save", item: { ...cached, name: "Bracket 2" }, costs }, "co-1", "u-1");
    expect(writes.map((w) => w.table)).toEqual(["catalog_items"]);
    for (const col of ["unit_cost_cents", "vendor_tax_bps", "markup_bps"]) expect(writes[0]!.row).not.toHaveProperty(col);
  });
  it("a new item sends what it has; an op queued by an older build (no costs) writes every cost column as it did", async () => {
    expect(catalogCostChange(undefined, item({ costCents: 5 }))).toEqual({ costCents: 5 });
    await applyOp({ k: "catalog.save", item: item({ costCents: 5 }) }, "co-1", "u-1");
    expect(writes[0]!.row).toMatchObject({ unit_cost_cents: 5, vendor_tax_bps: null, markup_bps: null });
  });
  it("no right to see costs (sales, 42501) or no table yet: the item is saved, no error", async () => {
    writeErr.catalog_item_costs = { code: "42501" };
    await expect(applyOp({ k: "catalog.save", item: item({ costCents: 1 }), costs: { costCents: 1 } }, "co-1", "u-1")).resolves.toBeUndefined();
    writeErr.catalog_item_costs = { code: "PGRST205" };
    await expect(applyOp({ k: "catalog.save", item: item({ costCents: 1 }), costs: { costCents: 1 } }, "co-1", "u-1")).resolves.toBeUndefined();
  });
  it("any other failure of the cost stops the op (the queue retries)", async () => {
    writeErr.catalog_item_costs = { code: "08006" };
    await expect(applyOp({ k: "catalog.save", item: item({ costCents: 1 }), costs: { costCents: 1 } }, "co-1", "u-1")).rejects.toBeTruthy();
  });
  it("onlyNew (a module's item, #377/#378) keeps its read-back and never writes the side table: an item already there keeps its cost", async () => {
    await applyOp({ k: "catalog.save", item: item({ costCents: 1 }), onlyNew: true }, "co-1", "u-1");
    expect(writes.map((w) => w.table)).toEqual(["catalog_items"]);
    expect(writes[0]!.opts).toEqual({ onConflict: "id", ignoreDuplicates: true });
    // the test cost goes with the insert; the server moves it to catalog_item_costs only for a row really inserted (T99)
    expect(writes[0]!.row).toMatchObject({ unit_cost_cents: 1 });
    expect(readBacks).toEqual(["catalog_items"]);
    // another company's id: still the server's «no», side table untouched
    readBackRow.value = null;
    writes.length = 0;
    await expect(applyOp({ k: "catalog.save", item: item({ costCents: 1 }), onlyNew: true }, "co-1", "u-1")).rejects.toMatchObject({ hint: "id_taken" });
    expect(writes.map((w) => w.table)).toEqual(["catalog_items"]);
  });
  it("a plain save: no read-back, the side table written — both paths side by side", async () => {
    await applyOp({ k: "catalog.save", item: item({ costCents: 5 }), costs: { costCents: 5 } }, "co-1", "u-1");
    expect(readBacks).toEqual([]);
    expect(writes.map((w) => w.table)).toEqual(["catalog_items", "catalog_item_costs"]);
  });
});

describe("unit:techNoCosts — who gets costs (= app.can_view_costs)", () => {
  it("owner / admin / office yes; tech and sub never, also with view_costs; sales only with view_costs; no row or not active — no", () => {
    for (const role of ["owner", "admin", "office"]) expect(costsVisibleFor({ role, status: "active" })).toBe(true);
    for (const role of ["tech", "subcontractor"]) expect(costsVisibleFor({ role, status: "active", permissions_override: { view_costs: true } })).toBe(false);
    expect(costsVisibleFor({ role: "sales", status: "active" })).toBe(false);
    expect(costsVisibleFor({ role: "sales", status: "active", permissions_override: { view_costs: true } })).toBe(true);
    expect(costsVisibleFor({ role: "owner", status: "disabled" })).toBe(false);
    expect(costsVisibleFor(undefined)).toBe(false);
  });
  it("loadCompanyDB says it for me", async () => {
    rows = { ...base("sales") };
    expect((await loadCompanyDB("co-1", "u-me")).costsVisible).toBe(false);
    rows = { ...base("office") };
    expect((await loadCompanyDB("co-1", "u-me")).costsVisible).toBe(true);
  });
});

describe("unit:techNoCosts — the item editor without costs (review #383 №1)", () => {
  const mat = item({ priceCents: 1213 });
  it("sales without costs: a material's price is kept / edited as it is, never counted from a cost they do not have", () => {
    const typed = { ...mat, name: "Bracket renamed", costCents: 1000 }; // even a cost typed in by hand changes nothing
    expect(editPrice(typed, [], true)).toBe(1213);
    expect(editOk({ ...mat, costCents: undefined }, true)).toBe(true);
    expect(editClean({ ...mat, name: " Bracket renamed " }, [], true)).toMatchObject({ name: "Bracket renamed", priceCents: 1213, costCents: undefined });
  });
  it("who gets costs: the price is counted from the cost as before ($10 + 10.25% + 10% = $12.13)", () => {
    const m = { ...mat, costCents: 1000, vendorTaxBps: 1025, markupBps: 1000 };
    expect(editPrice(m, [], false)).toBe(1213);
    expect(editOk({ ...m, costCents: undefined }, false)).toBe(false);
  });
});
