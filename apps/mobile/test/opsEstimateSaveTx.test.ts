/**
 * #1220: an estimate's save goes to the server in one transaction (public.save_estimate_version) — the version, its
 * current version, the options, lines and costs; a refusal is the op's and never falls back to the separate requests
 * (that would write it in part again). Only a server without the function (PGRST202) gets them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const tables: { table: string; kind: string }[] = [];
const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
let answers: { error: { code?: string; message: string; hint?: string } | null; status?: number }[] = [];
const found: Record<string, unknown> = { estimates: { status: "draft", current_version_id: "v-1" }, estimate_versions: { locked_at: null, version_no: 1 }, estimate_options: [] };
const chain = (table: string): Record<string, unknown> => {
  const c: Record<string, unknown> = { then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => Promise.resolve({ data: found[table] ?? null, error: null }).then(r, j) };
  for (const k of ["insert", "upsert", "update", "delete"]) c[k] = () => (tables.push({ table, kind: k }), c);
  for (const k of ["select", "eq", "neq", "in", "not", "is", "order", "limit", "range"]) c[k] = () => c;
  c.maybeSingle = () => Promise.resolve({ data: found[table] ?? null, error: null });
  return c;
};
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (t: string) => chain(t),
    rpc: (fn: string, args: Record<string, unknown>) => (rpcs.push({ fn, args }), Promise.resolve(answers.shift() ?? { data: null, error: null, status: 200 })),
  },
}));
import { applyOp, PermanentError, ServerError, type Op } from "../src/cloud/ops";

const line = (id: string, x: object = {}) => ({ id, name: id, group: "labor", quantity: "1.23455", unit: "ea", unitPriceCents: 1000, ...x });
const doc = (pages?: unknown) => ({
  options: [{ id: "o1", name: "A", lines: [line("l1"), line("h1", { unitPriceCents: 0, clientVisible: false })] }],
  settings: { tax: { enabled: false, rateBps: 0, groups: {} }, deposit: { kind: "none" }, discount: null },
  ...(pages ? { pages } : {}),
});
const op = (d = doc()) => ({ k: "estimate.save", id: "e-1", versionId: "v-new", customerId: "c-1", propertyId: "p-1", title: "T", doc: d, costs: { l1: 600 }, linesFrom: { l1: "s1" }, totalCents: 1235, depositCents: 0, marginPct: null }) as unknown as Op;
beforeEach(() => {
  tables.length = 0;
  rpcs.length = 0;
  answers = [];
});

describe("unit:opsEstimateSaveTx", () => {
  it("one call carries the version, the options, the lines (stored quantity, client_visible on each) and the costs", async () => {
    await applyOp(op(), "co-1", "u-1");
    const tx = rpcs.filter((r) => r.fn === "save_estimate_version");
    expect(tx).toHaveLength(1);
    const a = tx[0]!.args as { p_version_id: string; p_title: string; p_version: { calc_inputs: unknown; tax_mode: string }; p_options: unknown[]; p_lines: Record<string, unknown>[]; p_costs: unknown[] };
    expect(a.p_version_id).toBe("v-1");
    expect(a.p_title).toBe("T");
    expect(a.p_version.tax_mode).toBe("added_on_top");
    expect(a.p_lines.map((l) => [l.id, l.quantity, l.client_visible, l.copied_from_line_id])).toEqual([["l1", "1.2346", true, "s1"], ["h1", "1.2346", false, undefined]]);
    expect(a.p_costs).toEqual([{ line_item_id: "l1", unit_cost_cents: 600 }]);
    // no separate writes of the version's parts
    expect(tables.filter((t) => ["estimate_line_items", "estimate_options", "estimate_line_costs", "estimate_versions"].includes(t.table) && t.kind !== "insert")).toEqual([]);
  });
  it("a refusal is the op's (for good) — never the separate requests after it", async () => {
    answers = [{ error: { code: "23514", message: "check", hint: "x" }, status: 400 }];
    const e = await applyOp(op(), "co-1", "u-1").then(() => undefined, (x: unknown) => x);
    expect(e).toBeInstanceOf(PermanentError);
    expect(tables.some((t) => t.table === "estimate_line_items" || t.table === "estimate_options")).toBe(false);
  });
  it("the server says no to the pages: the same call again without them", async () => {
    const pages = [{ id: "p1", title: "Drawing", w: 10, h: 10, items: [{ t: "l", x1: 0, y1: 0, x2: 1, y2: 1, sw: 1, ink: "ink" }] }];
    answers = [{ error: { code: "22023", message: "doc_pages: count" }, status: 400 }];
    await applyOp(op(doc(pages)), "co-1", "u-1");
    const tx = rpcs.filter((r) => r.fn === "save_estimate_version");
    expect(tx).toHaveLength(2);
    expect((tx[1]!.args.p_version as { calc_inputs: { pages?: unknown } }).calc_inputs.pages).toBeUndefined();
  });
  it("a server error without a code, or 5xx: «try later» — never the separate requests", async () => {
    for (const a of [{ error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 }, { error: { message: "upstream", code: "PGRST002" }, status: 503 }]) {
      tables.length = 0;
      answers = [a];
      const e = await applyOp(op(), "co-1", "u-1").then(() => undefined, (x: unknown) => x);
      expect(e).toBeInstanceOf(ServerError);
      expect(e).not.toBeInstanceOf(PermanentError);
      expect(tables.some((t) => t.table === "estimate_line_items" || t.table === "estimate_options")).toBe(false);
    }
  });
  it("the save again without the pages refused for another reason: that refusal is the op's", async () => {
    const pages = [{ id: "p1", title: "Drawing", w: 10, h: 10, items: [{ t: "l", x1: 0, y1: 0, x2: 1, y2: 1, sw: 1, ink: "ink" }] }];
    answers = [{ error: { code: "22023", message: "doc_pages: count" }, status: 400 }, { error: { code: "42501", message: "no right" }, status: 403 }];
    const e = await applyOp(op(doc(pages)), "co-1", "u-1").then(() => undefined, (x: unknown) => x);
    expect(e).toBeInstanceOf(PermanentError);
    expect((e as PermanentError).message).toBe("no right");
    expect(tables.some((t) => t.table === "estimate_line_items")).toBe(false);
  });
  it("a server without the function (PGRST202): the separate requests, as before", async () => {
    answers = [{ error: { code: "PGRST202", message: "no function" }, status: 404 }];
    await applyOp(op(), "co-1", "u-1");
    expect(tables.some((t) => t.table === "estimate_line_items" && t.kind === "insert")).toBe(true);
  });
});
