/**
 * #1219: a tax rate with three decimals (New York 8.875 %) — ppm beside the basis points, the same rule as the engine
 * (taxPpm.test.ts) and the server (db T201). A job's own tax, the version estimate.save writes, an estimate the server
 * counts from its rows (legacyTotals), the rate field. Test prices.
 */
import { describe, expect, it, vi } from "vitest";

const writes: { table: string; kind: string; row?: unknown }[] = [];
const found: Record<string, unknown> = {
  estimates: { status: "draft", current_version_id: "v-1" },
  estimate_versions: { locked_at: null, version_no: 1 },
  estimate_options: [],
};
const chain = (table: string): Record<string, unknown> => {
  let write = false;
  const result = () => Promise.resolve(write ? { data: null, error: null } : { data: found[table] ?? null, count: 0, error: null });
  const c: Record<string, unknown> = { then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => result().then(r, j) };
  for (const k of ["insert", "upsert", "update", "delete"])
    c[k] = (row?: unknown) => {
      write = true;
      writes.push({ table, kind: k, row });
      return c;
    };
  for (const k of ["select", "eq", "neq", "in", "not", "is", "order", "limit", "range"]) c[k] = () => c;
  c.maybeSingle = () => result();
  c.single = () => result();
  return c;
};
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (t: string) => chain(t),
    rpc: (fn: string) => Promise.resolve(fn === "save_estimate_version" ? { data: null, error: { code: "PGRST202", message: "no function" }, status: 404 } : { data: null, error: null }),
  },
}));

import { applyOp, type Op } from "../src/cloud/ops";
import { legacyTotals } from "../src/cloud/legacyTotals";
import { versionRows } from "../src/cloud/estimateRows";
import { jobRateText, percentToRate, taxBefore, totalOf, withJobLine, withJobTax } from "../src/features/jobLines";
import { makeSeed } from "../src/data/seed";
import type { DB, EstimateDoc } from "../src/data/types";

const doc = (tax: Record<string, unknown>) =>
  ({
    options: [{ id: "o1", name: "A", lines: [{ id: "l1", name: "Install", group: "labor", quantity: "1", unit: "ea", unitPriceCents: 100000 }] }],
    settings: { tax: { enabled: true, groups: { service: true, labor: true, material: true }, ...tax }, deposit: { kind: "none" }, discount: null },
  }) as unknown as EstimateDoc;
const save = (d: EstimateDoc) =>
  ({ k: "estimate.save", id: "e-1", versionId: "v-1", customerId: "c-1", propertyId: "p-1", title: "T", doc: d, costs: {}, totalCents: 0, depositCents: 0, marginPct: null }) as unknown as Op;
const versionUpdate = () => writes.find((w) => w.table === "estimate_versions" && w.kind === "update")!.row as Record<string, unknown>;

describe("unit:taxRatePpm — a rate with three decimals (#1219)", () => {
  it("a job's own lines at 8.875 %: $1000 → $1088.75; the rate as people read it", () => {
    let d: DB = makeSeed();
    d = withJobLine(d, { id: "l1", jobId: "j3", position: 0, name: "Labor", quantity: "1", unitPriceCents: 100000, taxable: true });
    const rate = percentToRate("8.875")!;
    expect(rate).toEqual({ taxRatePpm: 88750, taxRateBps: 888 });
    d = withJobTax(d, "j3", { taxEnabled: true, ...rate });
    const j = d.jobs.find((x) => x.id === "j3")!;
    expect(j.amountCents).toBe(108875);
    expect(jobRateText(j)).toBe("8.875");
    expect(taxBefore(d, "j3")).toEqual({ taxEnabled: true, taxRateBps: 888, taxRatePpm: 88750 });
  });
  it("a change in basis points only (an older queued change) leaves no ppm behind — as the server (t03)", () => {
    let d: DB = makeSeed();
    d = withJobLine(d, { id: "l1", jobId: "j3", position: 0, name: "Labor", quantity: "1", unitPriceCents: 100000, taxable: true });
    d = withJobTax(d, "j3", { taxEnabled: true, taxRateBps: 888, taxRatePpm: 88750 });
    d = withJobTax(d, "j3", { taxEnabled: true, taxRateBps: 950 });
    const j = d.jobs.find((x) => x.id === "j3")!;
    expect(j.taxRatePpm).toBeUndefined();
    expect(j.amountCents).toBe(109500);
    expect(taxBefore(d, "j3")).toEqual({ taxEnabled: true, taxRateBps: 950 });
  });
  it("«Отменить» back to a job without ppm (8.88 %): the same basis points 888, ppm null to the server", async () => {
    let d: DB = makeSeed();
    d = withJobLine(d, { id: "l1", jobId: "j3", position: 0, name: "Labor", quantity: "1", unitPriceCents: 100000, taxable: true });
    d = withJobTax(d, "j3", { taxEnabled: true, taxRateBps: 888 });
    const prev = taxBefore(d, "j3");
    d = withJobTax(d, "j3", { taxEnabled: true, ...percentToRate("8.875")! });
    d = withJobTax(d, "j3", prev);
    expect(d.jobs.find((x) => x.id === "j3")!.amountCents).toBe(108880);
    writes.length = 0;
    await applyOp({ k: "job.update", id: "j3", ...prev }, "co", "u");
    expect(writes[0]!.row).toEqual({ tax_enabled: true, tax_rate_bps: 888, tax_rate_ppm: null });
  });
  it("an older job (only basis points) counts as before", () => {
    expect(totalOf([{ quantity: "1", unitPriceCents: 100000, taxable: true }], { taxEnabled: true, taxRateBps: 888 }).tax).toBe(8880);
    expect(jobRateText({ taxEnabled: true, taxRateBps: 825 })).toBe("8.25");
  });
  it("the typed rate: up to four decimals, ≤ 100 %; anything else — refused (no throw)", () => {
    expect(percentToRate(" 8,875 %")).toEqual({ taxRatePpm: 88750, taxRateBps: 888 });
    expect(percentToRate("10")).toEqual({ taxRatePpm: 100000, taxRateBps: 1000 });
    for (const bad of ["7..5", "", ".", "abc", "101", "-1", "8.87512"]) expect(percentToRate(bad)).toBeNull();
  });
  it("job.update writes ppm beside the basis points; an older op only the basis points", async () => {
    writes.length = 0;
    await applyOp({ k: "job.update", id: "j1", taxEnabled: true, taxRateBps: 888, taxRatePpm: 88750 }, "co", "u");
    expect(writes).toEqual([{ table: "jobs", kind: "update", row: { tax_enabled: true, tax_rate_bps: 888, tax_rate_ppm: 88750 } }]);
    writes.length = 0;
    await applyOp({ k: "job.update", id: "j1", taxEnabled: true, taxRateBps: 950 }, "co", "u");
    // ppm is gone: told to the server (it keeps a ppm it is not told about while the basis points stay the same)
    expect(writes).toEqual([{ table: "jobs", kind: "update", row: { tax_enabled: true, tax_rate_bps: 950, tax_rate_ppm: null } }]);
  });
  it("estimate.save writes the version's ppm and its basis points", async () => {
    writes.length = 0;
    await applyOp(save(doc({ rateBps: 888, ratePpm: 88750 })), "co-1", "u-1");
    expect(versionUpdate()).toMatchObject({ tax_enabled: true, tax_rate_ppm: 88750, tax_rate_bps: 888 });
  });
  it("a ppm left behind by an editor that wrote only the basis points does not count", async () => {
    writes.length = 0;
    await applyOp(save(doc({ rateBps: 950, ratePpm: 88750 })), "co-1", "u-1");
    expect(versionUpdate()).toMatchObject({ tax_rate_ppm: 95000, tax_rate_bps: 950 });
    expect(versionRows(doc({ rateBps: 950, ratePpm: 88750 }))).toMatchObject({ taxRatePpm: 95000, taxRateBps: 950 });
    // an older document: the basis points × 100
    writes.length = 0;
    await applyOp(save(doc({ rateBps: 825 })), "co-1", "u-1");
    expect(versionUpdate()).toMatchObject({ tax_rate_ppm: 82500, tax_rate_bps: 825 });
  });
  it("an estimate the server counts from its rows: ppm when the row has it, else the basis points", () => {
    const lines = [{ lineTotalCents: 100000, taxable: true, optional: false, clientVisible: true }];
    const v = { taxEnabled: true, taxRateBps: 888, depositRule: null, discountMode: null, discountValue: null };
    expect(legacyTotals(lines, { ...v, taxRatePpm: 88750 }).totalCents).toBe(108875);
    expect(legacyTotals(lines, { ...v, taxRatePpm: null }).totalCents).toBe(108880);
  });
});
