/**
 * Clients 04 §12.5 debt (а): PostgREST answers at most 1000 rows per request, so loadCompanyDB reads page by page.
 * The fake database below cuts every answer to 1000 rows like the server does and honours range() and order().
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const MAX_ROWS = 1000;
const rows: Record<string, Record<string, unknown>[]> = {};
/** columns the fake database does not have ("table.column") */
const missing = new Set<string>();
/** a table that fails from this page on (0-based page index) */
let failFrom: { table: string; page: number; status?: number; code?: string; message?: string } | null = null;
const calls: { table: string; range?: [number, number]; order: string[] }[] = [];

function builder(table: string) {
  const b: Record<string, unknown> = {};
  let cols = "";
  let range: [number, number] | undefined;
  const order: { col: string; asc: boolean }[] = [];
  b.select = (c?: string) => ((cols = c ?? "*"), b);
  for (const m of ["eq", "is", "limit", "in", "not"]) b[m] = () => b;
  b.order = (col: string, o?: { ascending?: boolean }) => (order.push({ col, asc: o?.ascending ?? true }), b);
  b.range = (from: number, to: number) => ((range = [from, to]), b);
  b.then = (ok: (r: { data: unknown; error: { message: string } | null }) => unknown) => {
    calls.push({ table, range, order: order.map((o) => `${o.col}${o.asc ? "" : " desc"}`) });
    const gone = cols.split(",").map((x) => x.trim()).find((c) => missing.has(`${table}.${c}`));
    if (gone) return Promise.resolve({ data: null, error: { message: `column ${table}.${gone} does not exist` } }).then(ok);
    if (failFrom && failFrom.table === table && range && range[0] / MAX_ROWS >= failFrom.page)
      return Promise.resolve({ data: null, status: failFrom.status, error: { message: failFrom.message ?? "network", code: failFrom.code } }).then(ok);
    let data = [...(rows[table] ?? [])];
    for (const o of [...order].reverse())
      data.sort((x, y) => (String(x[o.col]) < String(y[o.col]) ? -1 : String(x[o.col]) > String(y[o.col]) ? 1 : 0) * (o.asc ? 1 : -1));
    if (range) data = data.slice(range[0], range[1] + 1);
    data = data.slice(0, MAX_ROWS); // the server's max_rows
    return Promise.resolve({ data, error: null }).then(ok);
  };
  return b;
}
vi.mock("../src/cloud/client", () => ({ supabase: { from: (t: string) => builder(t) } }));
import { loadCompanyDB, pages, PAGE } from "../src/cloud/repo";
import { classify } from "../src/data/outboxRetry";
const supabaseFrom = (t: string) => builder(t) as unknown as { select: (c: string) => unknown };
import { supabase } from "../src/cloud/client";

const CO = "co-1";
const pad = (i: number) => String(i).padStart(5, "0");
// shuffled on purpose: the order of the answer comes from order(), not from how rows were stored
const customers = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${pad((i * 7919) % n)}`, company_id: CO, display_name: `Client ${pad((i * 7919) % n)}`, status: "active" }));

beforeEach(() => {
  missing.clear();
  failFrom = null;
  calls.length = 0;
  for (const k of Object.keys(rows)) delete rows[k];
  rows.companies = [{ id: CO, name: "Acme" }];
});

describe("pages(): every row, page by page", () => {
  const read = (table: string, cap?: number) => pages<Record<string, unknown>>(() => supabase.from(table).select("*"), [{ col: "id" }], cap);

  it("2500 rows: three pages, every row once, the 1001st row is there", async () => {
    rows.customers = customers(2500);
    const got = await read("customers");
    expect(got).toHaveLength(2500);
    expect(new Set(got.map((r) => r.id)).size).toBe(2500);
    expect(got[1000].id).toBe("c01000");
    expect(calls.map((c) => c.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(calls.every((c) => c.order.join() === "id")).toBe(true);
  });

  it("exactly 1000 rows: a second, empty page ends the read (no endless loop)", async () => {
    rows.customers = customers(PAGE);
    expect(await read("customers")).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });

  it("a short first page: one request", async () => {
    rows.customers = customers(3);
    expect(await read("customers")).toHaveLength(3);
    expect(calls).toHaveLength(1);
  });

  it("a cap: no more rows than asked, the last page is asked only up to the cap", async () => {
    rows.activities = customers(3500);
    expect(await read("activities", 2000)).toHaveLength(2000);
    expect(calls.map((c) => c.range)).toEqual([[0, 999], [1000, 1999]]);
  });

  it("an error on the second page fails the whole read", async () => {
    rows.customers = customers(1500);
    failFrom = { table: "customers", page: 1 };
    await expect(read("customers")).rejects.toThrow("network");
  });
});

describe("loadCompanyDB: a company with more than 1000 rows", () => {
  it("a server error on a page keeps its status and code: the queue reads it as «not now», not as a refusal (#244)", async () => {
    rows.customers = Array.from({ length: 1500 }, (_, i) => ({ id: `c${String(i).padStart(5, "0")}` }));
    failFrom = { table: "customers", page: 1, status: 503, code: "PGRST002", message: "Could not query the database" };
    const e = await pages(() => supabaseFrom("customers").select("id"), [{ col: "id" }]).then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ status: 503, code: "PGRST002", message: "Could not query the database" });
    expect(classify(e)).toBe("transient");
  });
  it("a dropped connection on a page stays a network failure (no status)", async () => {
    rows.customers = [{ id: "c1" }];
    failFrom = { table: "customers", page: 0, status: 0, message: "TypeError: Failed to fetch" };
    const e = await pages(() => supabaseFrom("customers").select("id"), [{ col: "id" }]).then(() => null, (x: unknown) => x);
    expect(classify(e)).toBe("network");
  });
  it("a refusal on a page stays a refusal (403, 42501)", async () => {
    rows.customers = [{ id: "c1" }];
    failFrom = { table: "customers", page: 0, status: 403, code: "42501", message: "permission denied" };
    const e = await pages(() => supabaseFrom("customers").select("id"), [{ col: "id" }]).then(() => null, (x: unknown) => x);
    expect(classify(e)).toBe("refusal");
  });
  it("all 2500 clients and their people reach the phone", async () => {
    rows.customers = customers(2500);
    rows.contacts = rows.customers.map((c, i) => ({ id: `p${pad(i)}`, customer_id: c.id, name: `Person ${i}`, phone: `555${pad(i)}`, is_primary: true }));
    const db = await loadCompanyDB(CO, "u1");
    expect(db.customers).toHaveLength(2500);
    expect(new Set(db.customers.map((c) => c.id)).size).toBe(2500);
    const last = db.customers.find((c) => c.id === "c02400");
    expect(last?.people?.map((p) => p.name)).toEqual([`Person ${rows.customers.findIndex((c) => c.id === "c02400")}`]);
    expect(calls.filter((c) => c.table === "contacts").length).toBe(3);
  });

  it("tables without an id are paged by their own key", async () => {
    rows.customer_tags = Array.from({ length: 1200 }, (_, i) => ({ customer_id: `c${pad(i)}`, tag_id: "t1", company_id: CO }));
    rows.tags = [{ id: "t1", name: "VIP", is_active: true, position: 0 }];
    rows.customers = customers(1200);
    const db = await loadCompanyDB(CO, "u1");
    const order = (t: string) => calls.find((c) => c.table === t)?.order.join();
    expect(order("customer_tags")).toBe("customer_id,tag_id");
    expect(order("job_tags")).toBe("job_id,tag_id");
    expect(order("lead_costs")).toBe("lead_id");
    expect(order("property_secrets")).toBe("property_id");
    expect(order("estimate_line_costs")).toBe("line_item_id");
    expect(order("activities")).toBe("at desc,id desc");
    expect(calls.filter((c) => c.table === "customer_tags")).toHaveLength(2);
    expect(db.customers.filter((c) => c.tagIds?.length).length).toBe(1200);
  });

  it("every read of the company is paged (except one-row reads and the 50 latest notices)", async () => {
    await loadCompanyDB(CO, "u1");
    const unpaged = [...new Set(calls.filter((c) => !c.range).map((c) => c.table))].sort();
    expect(unpaged).toEqual(["companies", "company_secrets", "notifications"]);
  });

  it("a fallback to the old columns still works when the new column is missing", async () => {
    missing.add("files.customer_id");
    missing.add("tasks.starts_at");
    missing.add("activities.contact_id");
    rows.files = Array.from({ length: 1100 }, (_, i) => ({ id: `f${pad(i)}`, job_id: "j1", stage: "before", storage_key: `k${i}`, kind: "photo", created_at: "2026-01-01" }));
    rows.tasks = [{ id: "t1", subject_type: "customer", subject_id: "c1", title: "Call", due_at: null, assignee_id: null, done_at: null }];
    rows.activities = [{ id: "a1", subject_type: "customer", subject_id: "c1", kind: "call", body: "", at: "2026-01-01T00:00:00Z" }];
    const db = await loadCompanyDB(CO, "u1");
    expect(db.files).toHaveLength(1100);
    expect(db.tasks.map((t) => t.id)).toEqual(["t1"]);
    expect(db.activities.map((a) => a.id)).toEqual(["a1"]);
  });
});
