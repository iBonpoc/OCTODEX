/**
 * The attached pages on the way to the server (spec 33 П24.7; security-check of the diff №3): pages the app knows the
 * server refuses are not sent; when the server still says no (it measures its own text), the estimate goes without them —
 * never the whole estimate dropped for a drawing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const writes: { table: string; kind: string; row?: unknown }[] = [];
const found: Record<string, unknown> = {
  estimates: { status: "draft", current_version_id: "v-1" },
  estimate_versions: { locked_at: null, version_no: 1 },
  estimate_options: [],
};
/** the server refuses a version with pages, as the trigger t07_doc_pages does */
let refusePages = false;
const chain = (table: string): Record<string, unknown> => {
  let write = false;
  let refused = false;
  const result = () =>
    Promise.resolve(
      refused
        ? { data: null, error: { code: "22023", message: "doc_pages: size" }, status: 400 }
        : write
          ? { data: null, error: null }
          : { data: found[table] ?? null, count: 0, error: null },
    );
  const c: Record<string, unknown> = { then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => result().then(r, j) };
  for (const k of ["insert", "upsert", "update", "delete"])
    c[k] = (row?: unknown) => {
      write = true;
      if (refusePages && table === "estimate_versions" && k === "update" && (row as { calc_inputs?: { pages?: unknown } })?.calc_inputs?.pages !== undefined) refused = true;
      writes.push({ table, kind: k, row });
      return c;
    };
  for (const k of ["select", "eq", "neq", "in", "not", "is", "order", "limit", "range"]) c[k] = () => c;
  c.maybeSingle = () => result();
  c.single = () => result();
  return c;
};
vi.mock("../src/cloud/client", () => ({
  supabase: { from: (t: string) => chain(t), rpc: () => Promise.resolve({ data: null, error: null }) },
}));

import { applyOp, type Op } from "../src/cloud/ops";

const page = (id: string) => ({ id, title: "Drawing", w: 10, h: 10, items: [{ t: "l", x1: 0, y1: 0, x2: 1, y2: 1, sw: 1, ink: "ink" }] });
const save = (pages?: unknown) =>
  ({
    k: "estimate.save", id: "e-1", versionId: "v-new", customerId: "c-1", propertyId: "p-1", title: "T", costs: {}, totalCents: 0, depositCents: 0, marginPct: null,
    doc: {
      options: [{ id: "o1", name: "A", lines: [{ id: "l1", name: "l1", group: "labor", quantity: "1", unit: "ea", unitPriceCents: 1000 }] }],
      settings: { tax: { enabled: false, rateBps: 0, groups: {} }, deposit: { kind: "none" }, discount: null },
      ...(pages !== undefined ? { pages } : {}),
    },
  }) as unknown as Op;
const versionDocs = () => writes.filter((w) => w.table === "estimate_versions" && w.kind === "update").map((w) => (w.row as { calc_inputs: Record<string, unknown> }).calc_inputs);

beforeEach(() => {
  writes.length = 0;
  refusePages = false;
});

describe("unit:opsDocPages — the pages to the server", () => {
  it("good pages go with the document", async () => {
    await applyOp(save([page("m:1")]), "co-1", "u-1");
    expect(versionDocs().map((d) => (d.pages as { id: string }[])[0]!.id)).toEqual(["m:1"]);
  });
  it("pages the server would refuse (five) are not sent; the estimate and its lines go", async () => {
    await applyOp(save(["1", "2", "3", "4", "5"].map(page)), "co-1", "u-1");
    expect(versionDocs()).toHaveLength(1);
    expect("pages" in versionDocs()[0]!).toBe(false);
    expect(writes.some((w) => w.table === "estimate_line_items" && w.kind === "insert")).toBe(true);
  });
  it("the server still says no to the pages: the estimate goes again without them, its lines too", async () => {
    refusePages = true;
    await applyOp(save([page("m:1")]), "co-1", "u-1");
    const docs = versionDocs();
    expect(docs).toHaveLength(2);
    expect("pages" in docs[1]!).toBe(false);
    expect(docs[1]!.options).toEqual(docs[0]!.options);
    expect(writes.some((w) => w.table === "estimate_line_items" && w.kind === "insert")).toBe(true);
  });
  it("an old document without pages: one save, as before", async () => {
    refusePages = true;
    await applyOp(save(), "co-1", "u-1");
    expect(versionDocs()).toHaveLength(1);
  });
});
