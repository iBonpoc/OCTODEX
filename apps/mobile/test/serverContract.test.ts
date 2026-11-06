/**
 * serverContract — every call the app makes to the server exists in the migrations as it is called
 * (docs/ai/CHECKS.md §3а п.1; «Каркас» №5, 06.11). Static: no database, runs on every PR in a second.
 * - `.rpc("name", { p_a, p_b })` in apps/mobile/src and supabase/functions, and `call("name", {…})` of cloud/team.ts:
 *   the function public.name exists (the last `create [or replace] function` of the migrations, minus `drop function`);
 *   the app's keys are parameters of ONE of its signatures (overloads: any); that signature's parameters without a
 *   default are all given; `authenticated` may EXECUTE it (rule 18: an explicit grant; functions created before
 *   20261106100000 also had it through PUBLIC unless a revoke took it away).
 * - `.from("table")`: the table or view exists in schema public (or `storage`/`auth` are not ours — not read here).
 * A wrong name, a renamed parameter or a missing grant is a call that fails on the phone only — this test fails first.
 * The precise check against the real catalog (pg_proc, has_function_privilege) — the nightly runs, later.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const walk = (dir: string): string[] =>
  fs.existsSync(path.join(ROOT, dir))
    ? fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
        const p = `${dir}/${d.name}`;
        return d.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(d.name) ? [p] : [];
      })
    : [];

/* ---------- the app's side ---------- */
/** the text of a balanced (...) / {...} starting at `open` */
function balanced(src: string, open: number): string {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const stack: string[] = [];
  let str: string | null = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i]!;
    if (str) {
      if (c === "\\") i++;
      else if (c === str) str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") str = c;
    else if (pairs[c]) stack.push(pairs[c]!);
    else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (!stack.length) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}
/** top-level keys of an object literal `{ a: 1, b, c: f(x, y) }` */
export function objectKeys(obj: string): string[] {
  const inner = obj.trim().replace(/^\{|\}$/g, "");
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  let str: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]!;
    if (str) {
      cur += c;
      if (c === "\\") cur += inner[++i] ?? "";
      else if (c === str) str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") str = c;
    if ("([{".includes(c)) depth++;
    if (")]}".includes(c)) depth--;
    if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  parts.push(cur);
  return parts.map((p) => /^\s*([A-Za-z_]\w*)\s*(?::|$)/.exec(p)?.[1]).filter((k): k is string => !!k);
}
export interface AppCall {
  fn: string;
  keys: string[] | null; // null — the arguments are not a literal object (cannot be checked by keys)
  where: string;
}
export function appCalls(file: string, src: string): AppCall[] {
  const out: AppCall[] = [];
  for (const m of src.matchAll(/(?:\.rpc|\bcall(?:<[^>]*>)?)\(\s*"([a-z_][a-z0-9_]*)"\s*(,)?/g)) {
    const at = m.index! + m[0].length;
    let keys: string[] | null = [];
    if (m[2]) {
      const brace = src.slice(at).search(/\S/);
      const start = at + brace;
      keys = src[start] === "{" ? objectKeys(balanced(src, start)) : null;
    }
    out.push({ fn: m[1]!, keys, where: `${file}:${src.slice(0, m.index).split("\n").length}` });
  }
  return out;
}
export function appTables(src: string): string[] {
  return [...src.matchAll(/\.from\(\s*"([a-z_][a-z0-9_]*)"\s*\)/g)].map((m) => m[1]!);
}

/* ---------- the server's side (the migrations, in order) ---------- */
export interface Sig {
  params: { name: string; hasDefault: boolean }[];
  types: string;
}
export interface DbFn {
  sigs: Map<string, Sig>;
  pub: boolean; // EXECUTE for PUBLIC
  auth: boolean; // EXECUTE for authenticated
}
/** `p_a uuid, p_b text default null, in p_c int = 1` → params; the types joined (the signature key) */
export function parseParams(list: string): Sig {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of list) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) parts.push(cur);
  const params = parts.map((p) => {
    const t = p.trim().replace(/^(in|out|inout|variadic)\s+/i, "");
    const [name = ""] = t.split(/\s+/);
    return { name: name.toLowerCase(), hasDefault: /\bdefault\b|=/i.test(t), type: t.slice(name.length).replace(/\b(default|=)[\s\S]*$/i, "").trim().toLowerCase() };
  });
  return { params: params.map(({ name, hasDefault }) => ({ name, hasDefault })), types: params.map((p) => p.type).join(",") };
}
/** the cut-over after which a new function has no EXECUTE for PUBLIC (alter default privileges … revoke execute … from public) */
const NO_PUBLIC_FROM = "20261106100000";
export function dbFunctions(migrations: { file: string; sql: string }[]): Map<string, DbFn> {
  const fns = new Map<string, DbFn>();
  const sqlOnly = (s: string) => s.replace(/--[^\n]*/g, "").replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "$$body$$");
  for (const { file, sql: raw } of migrations) {
    const sql = sqlOnly(raw);
    const defaultPublic = file < NO_PUBLIC_FROM;
    // statements in the order they stand
    const re = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_][a-z0-9_]*)\s*\(|drop\s+function\s+(?:if\s+exists\s+)?([^;]+);|(grant|revoke)\s+([^;]*?)\s+on\s+function\s+([^;]+?)\s+(to|from)\s+([^;]+);/gi;
    for (const m of sql.matchAll(re)) {
      if (m[1]) {
        const open = m.index! + m[0].length - 1;
        const sig = parseParams(balanced(sql, open).slice(1, -1));
        const f = fns.get(m[1]) ?? { sigs: new Map(), pub: defaultPublic, auth: false };
        if (!f.sigs.size) Object.assign(f, { pub: defaultPublic, auth: false }); // (re)created after a full drop
        f.sigs.set(sig.types, sig);
        fns.set(m[1], f);
      } else if (m[2]) {
        for (const d of m[2].split(/,(?![^(]*\))/)) {
          const dm = /public\.([a-z_][a-z0-9_]*)\s*(\(([^)]*)\))?/i.exec(d);
          const f = dm && fns.get(dm[1]!);
          if (!f) continue;
          if (dm![2] === undefined) f.sigs.clear();
          else {
            const types = dm![3]!.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).join(",");
            for (const [k] of f.sigs) if (k === types || !dm![3]!.trim()) f.sigs.delete(k);
            if (!dm![3]!.trim()) f.sigs.delete("");
          }
        }
      } else if (m[3]) {
        const grant = m[3].toLowerCase() === "grant";
        if (grant && !/execute|all/i.test(m[4]!)) continue;
        const roles = m[7]!.toLowerCase();
        for (const n of m[5]!.matchAll(/public\.([a-z_][a-z0-9_]*)/gi)) {
          const f = fns.get(n[1]!);
          if (!f) continue;
          if (/\bpublic\b/.test(roles)) f.pub = grant;
          if (/\bauthenticated\b/.test(roles)) f.auth = grant;
        }
      }
    }
  }
  return fns;
}
export function dbTables(sqlAll: string): Set<string> {
  const t = new Set<string>();
  for (const m of sqlAll.matchAll(/create\s+(?:or\s+replace\s+)?(?:table|view|materialized\s+view)\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi)) t.add(m[1]!);
  for (const m of sqlAll.matchAll(/drop\s+(?:table|view)\s+(?:if\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi)) t.delete(m[1]!);
  return t;
}

/** what is wrong with one call; [] — fine */
export function checkCall(c: AppCall, fns: Map<string, DbFn>, opts: { serviceRole?: boolean } = {}): string[] {
  const f = fns.get(c.fn);
  if (!f || !f.sigs.size) return [`${c.where}: public.${c.fn} is not in the migrations`];
  const errs: string[] = [];
  if (!opts.serviceRole && !f.pub && !f.auth) errs.push(`${c.where}: public.${c.fn} has no EXECUTE for authenticated (rule 18: grant execute … to authenticated)`);
  if (c.keys) {
    const fits = [...f.sigs.values()].some(
      (s) => c.keys!.every((k) => s.params.some((p) => p.name === k)) && s.params.every((p) => p.hasDefault || c.keys!.includes(p.name)),
    );
    if (!fits) {
      const sigs = [...f.sigs.values()].map((s) => `(${s.params.map((p) => p.name + (p.hasDefault ? "?" : "")).join(", ")})`).join(" | ");
      errs.push(`${c.where}: public.${c.fn}{${c.keys.join(", ")}} fits no signature ${sigs}`);
    }
  }
  return errs;
}

/* ---------- the real repository ---------- */
const migrations = fs
  .readdirSync(path.join(ROOT, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ file: f, sql: read(`supabase/migrations/${f}`) }));
const FNS = dbFunctions(migrations);
const TABLES = dbTables(migrations.map((m) => m.sql).join("\n"));
const appFiles = [...walk("apps/mobile/src"), ...walk("supabase/functions")];
const CALLS = appFiles.flatMap((f) => appCalls(f, read(f)));
const TABLE_CALLS = appFiles.flatMap((f) => appTables(read(f)).map((t) => ({ t, f })));

describe("serverContract — the parser itself", () => {
  it("finds the app's calls (a silent parser would pass everything)", () => {
    expect(CALLS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(CALLS.map((c) => c.fn)).size).toBeGreaterThanOrEqual(20);
    expect(TABLE_CALLS.length).toBeGreaterThanOrEqual(30);
    expect(FNS.size).toBeGreaterThanOrEqual(30);
  });
  it("reads keys, defaults, overloads, grants and drops", () => {
    expect(objectKeys("{ p_a: x, p_b, p_c: f(1, { q: 2 }), 'x': 1 }")).toEqual(["p_a", "p_b", "p_c"]);
    const fns = dbFunctions([
      { file: "20261101000000_a.sql", sql: "create function public.old(p_a uuid) returns void as $$ select 1; $$ language sql;" },
      { file: "20261107000000_b.sql", sql: `create or replace function public.f(p_a uuid, p_b text default null) returns void language sql as $$ select (1, 2) $$;
        create function public.f(p_x int) returns void language sql as $$ select 1 $$;
        revoke all on function public.f(uuid, text), public.f(int) from public, anon;
        grant execute on function public.f(uuid, text) to authenticated;
        create function public.g(p_a uuid) returns void language sql as $$ select 1 $$;
        create function public.h(p_a uuid) returns void language sql as $$ select 1 $$;
        drop function if exists public.h(uuid);` },
    ]);
    const call = (fn: string, keys: string[] | null) => checkCall({ fn, keys, where: "x" }, fns);
    expect(call("f", ["p_a"])).toEqual([]); // the default may be left out
    expect(call("f", ["p_x"])).toEqual([]); // another overload
    expect(call("f", ["p_b"])[0]).toMatch(/fits no signature/); // p_a is required
    expect(call("f", ["p_a", "p_zz"])[0]).toMatch(/fits no signature/); // a renamed / unknown key
    expect(call("g", [])[0]).toMatch(/no EXECUTE/); // created after 100000 without a grant
    expect(call("old", ["p_a"])).toEqual([]); // before 100000: PUBLIC had it
    expect(call("h", ["p_a"])[0]).toMatch(/not in the migrations/); // dropped
    expect(call("nope", [])[0]).toMatch(/not in the migrations/);
  });
});

describe("serverContract — every rpc of the app exists as it is called", () => {
  // the edge function runs public.delete_account with the PERSON's token (verify_jwt) — the same rule as the app
  for (const c of CALLS) {
    it(`${c.fn} — ${c.where}`, () => {
      expect(checkCall(c, FNS)).toEqual([]);
    });
  }
});

describe("serverContract — every table the app reads or writes exists", () => {
  const NOT_OURS = new Set<string>(); // storage / auth tables are read through the client libraries, not .from()
  for (const t of [...new Set(TABLE_CALLS.map((x) => x.t))]) {
    it(`public.${t}`, () => {
      if (NOT_OURS.has(t)) return;
      expect(TABLES.has(t), `${t} (${TABLE_CALLS.filter((x) => x.t === t).map((x) => x.f).join(", ")}) is not a table or view of the migrations`).toBe(true);
    });
  }
});
