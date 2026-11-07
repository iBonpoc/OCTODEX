/**
 * serverCatalog — the app's calls against the LIVE catalog of the database (docs/specs/21 §5; CHECKS §3а).
 * serverContract.test.ts reads the migrations' text; this one reads what the database really holds after them:
 * `supabase/tests/run.sh` with CATALOG_OUT=<file> writes pg_proc / pg_class of schema public with
 * has_function_privilege / has_table_privilege (supabase/tests/catalog.sql), and this test reads that file
 * from CATALOG_JSON=<file>.
 * - every `.rpc` / `call` of the app: the function exists, the keys fit one of its signatures (pronargdefaults:
 *   the last N inputs may be left out), `authenticated` may EXECUTE it;
 * - `anon` may EXECUTE only the functions of the client page /p/ (ANON_OK) — anything else is a hole;
 * - every `.from` of the app: the table or view exists and `authenticated` may SELECT it;
 * - no table or view gives `anon` anything; every table has RLS on.
 * No file: skipped locally (the static serverContract still runs); with CATALOG_REQUIRED=1 (CI) it FAILS — a guard that
 * silently skips never fires. The fixture below must fail with exactly its 4 errors.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ROOT, appCalls, repoCalls, type AppCall } from "./serverContract.lib";

export interface CatFn {
  name: string;
  params: string[];
  args: string;
  defaults: number;
  definer: boolean;
  public: boolean;
  anon: boolean;
  authenticated: boolean;
}
export interface CatTable {
  name: string;
  kind: "table" | "view" | "matview";
  anon: boolean[]; // select, insert, update, delete
  authenticated: boolean[];
  rls: boolean;
}
export interface Catalog {
  functions: CatFn[];
  tables: CatTable[];
}

/** functions anon may run on purpose: the client page /p/ (supabase/README «Универсальная смета») and the id default */
export const ANON_OK = new Set(["portal_estimate", "portal_accept", "portal_pay_simulated", "uuid_generate_v7"]);

/** a call fits an overload: every key is a parameter, every parameter without a default is given */
function fits(c: AppCall, f: CatFn): boolean {
  if (!c.keys) return true;
  const required = f.params.slice(0, f.params.length - f.defaults);
  return c.keys.every((k) => f.params.includes(k)) && required.every((p) => c.keys!.includes(p));
}

export function checkCatalog(cat: Catalog, calls: AppCall[], tables: { t: string; f: string }[]): string[] {
  const errs: string[] = [];
  const byName = new Map<string, CatFn[]>();
  for (const f of cat.functions) byName.set(f.name, [...(byName.get(f.name) ?? []), f]);
  for (const c of calls) {
    const fs_ = byName.get(c.fn);
    if (!fs_) {
      errs.push(`${c.where}: public.${c.fn} is not in the database`);
      continue;
    }
    const fit = fs_.filter((f) => fits(c, f));
    if (!fit.length) {
      errs.push(`${c.where}: public.${c.fn}{${(c.keys ?? []).join(", ")}} fits no signature ${fs_.map((f) => `(${f.args})`).join(" | ")}`);
      continue;
    }
    if (!fit.some((f) => f.authenticated)) errs.push(`${c.where}: public.${c.fn} has no EXECUTE for authenticated (rule 18)`);
  }
  for (const f of cat.functions)
    if (f.anon && !ANON_OK.has(f.name)) errs.push(`public.${f.name}(${f.args}) is EXECUTE for anon (only ${[...ANON_OK].join(", ")} may be)`);
  const tbl = new Map(cat.tables.map((t) => [t.name, t]));
  for (const t of new Set(tables.map((x) => x.t))) {
    const row = tbl.get(t);
    const where = tables.filter((x) => x.t === t).map((x) => x.f).join(", ");
    if (!row) errs.push(`public.${t} (${where}) is not a table or view of the database`);
    else if (!row.authenticated[0]) errs.push(`public.${t} (${where}): no SELECT for authenticated`);
  }
  for (const t of cat.tables) {
    if (t.anon.some(Boolean)) errs.push(`public.${t.name}: anon has rights on it`);
    if (t.kind === "table" && !t.rls) errs.push(`public.${t.name}: RLS is off`);
  }
  return errs;
}

describe("serverCatalog — the guard itself (a fixture that must fail)", () => {
  const cat: Catalog = {
    functions: [
      { name: "f", params: ["p_a", "p_b"], args: "p_a uuid, p_b text", defaults: 1, definer: true, public: false, anon: false, authenticated: true },
      { name: "f", params: ["p_x"], args: "p_x integer", defaults: 0, definer: true, public: false, anon: false, authenticated: true },
      { name: "g", params: ["p_a"], args: "p_a uuid", defaults: 0, definer: true, public: false, anon: false, authenticated: false },
      { name: "h", params: [], args: "", defaults: 0, definer: true, public: false, anon: true, authenticated: true },
      { name: "portal_estimate", params: ["p_token"], args: "p_token text", defaults: 0, definer: true, public: false, anon: true, authenticated: true },
    ],
    tables: [
      { name: "leads", kind: "table", anon: [false, false, false, false], authenticated: [true, true, true, false], rls: true },
      { name: "customer_balances", kind: "view", anon: [false, false, false, false], authenticated: [true, false, false, false], rls: false },
    ],
  };
  const good = appCalls(
    "good.ts",
    `x.rpc("f", { p_a: id }); x.rpc("f", { p_a: id, p_b: "t" }); x.rpc("f", { p_x: 1 }); x.rpc("f", args); x.rpc("portal_estimate", { p_token: t });`,
  );
  const ok = { ...cat, functions: cat.functions.filter((f) => f.name !== "h") };
  it("good calls pass: a default left out, another overload, arguments not a literal", () => {
    expect(good).toHaveLength(5);
    expect(checkCatalog(ok, good, [{ t: "leads", f: "a.ts" }, { t: "customer_balances", f: "b.ts" }])).toEqual([]);
  });
  it("the bad fixture: exactly its 4 errors", () => {
    const bad = appCalls("bad.ts", `x.rpc("f", { p_aa: id }); x.rpc("f", { p_b: "t" }); x.rpc("g", { p_a: id });`);
    const errs = checkCatalog(cat, bad, [{ t: "leads", f: "a.ts" }]);
    expect(errs).toHaveLength(4);
    expect(errs[0]).toMatch(/bad\.ts:1: public\.f\{p_aa\} fits no signature/); // a typo in a parameter
    expect(errs[1]).toMatch(/public\.f\{p_b\} fits no signature/); // the required p_a left out
    expect(errs[2]).toMatch(/public\.g has no EXECUTE for authenticated/);
    expect(errs[3]).toMatch(/public\.h\(\) is EXECUTE for anon/);
  });
  it("tables: missing, no SELECT, anon rights, RLS off", () => {
    const t: Catalog = {
      functions: [],
      tables: [
        { name: "a", kind: "table", anon: [true, false, false, false], authenticated: [false, false, false, false], rls: false },
      ],
    };
    expect(checkCatalog(t, [], [{ t: "a", f: "x.ts" }, { t: "zz", f: "y.ts" }])).toEqual([
      "public.a (x.ts): no SELECT for authenticated",
      "public.zz (y.ts) is not a table or view of the database",
      "public.a: anon has rights on it",
      "public.a: RLS is off",
    ]);
  });
});

const FILE = process.env.CATALOG_JSON;
const REQUIRED = process.env.CATALOG_REQUIRED === "1";
describe("serverCatalog — the real app against the database after the migrations", () => {
  if (!FILE || !fs.existsSync(path.resolve(ROOT, FILE))) {
    it.skipIf(!REQUIRED)("the catalog file is there (CATALOG_JSON; supabase/tests/run.sh with CATALOG_OUT)", () => {
      expect.fail(`CATALOG_REQUIRED=1 but no catalog at CATALOG_JSON=${FILE ?? "(unset)"}`);
    });
    return;
  }
  const cat = JSON.parse(fs.readFileSync(path.resolve(ROOT, FILE), "utf8")) as Catalog;
  const { calls, tables } = repoCalls();
  it("the catalog is not empty (a silent dump would pass everything)", () => {
    expect(cat.functions.length).toBeGreaterThanOrEqual(30);
    expect(cat.tables.length).toBeGreaterThanOrEqual(30);
  });
  it("every call, every table, and the anon rights", () => {
    expect(checkCatalog(cat, calls, tables)).toEqual([]);
  });
});
