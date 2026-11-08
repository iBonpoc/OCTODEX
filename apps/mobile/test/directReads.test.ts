/**
 * Reads of the database outside repo.ts (docs/specs/04 §12.5 debt, 20 §6-4): PostgREST gives at most 1000 rows at
 * once, so a list read without `pages()` silently loses the rest. Every `.from("…").select(…)` outside `cloud/repo.ts`
 * is either one row (`maybeSingle` / `single` / `head: true` / `limit(1)`), goes through `pages()`, or is listed here
 * with the reason it can never reach 1000 rows. A new list read fails this test until it does one of those.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

/** file + table → why it stays under 1000 rows */
const SMALL: Record<string, string> = {
  "src/cloud/auth.tsx memberships": "the person's own memberships: a handful of companies",
  "src/cloud/account.ts memberships": "the person's own owner memberships: a handful of companies",
  "src/cloud/ops.ts estimate_options": "the options of one estimate version (good / better / best)",
  "src/cloud/intakeSettings.ts intake_endpoints": "a company's ways in: at most 10 (intake_endpoint_create refuses more)",
  "src/cloud/intakeSettings.ts intake_events": "the journal screen: the last 50 requests (limit 50)",
};

export interface Read {
  file: string;
  table: string;
  line: number;
  one: boolean;
  paged: boolean;
  /** goes through `read(…)` (ops.ts): a failed request stops the op instead of reading as «no row» */
  checked: boolean;
}

/** every select read in a source text: the statement from `.from("table")` to its `;` */
export function readsIn(file: string, text: string): Read[] {
  const out: Read[] = [];
  const re = /\.from\("([a-z_]+)"\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = text.indexOf(";", m.index);
    const st = text.slice(m.index, end < 0 ? undefined : end);
    const head = st.split(".select(")[0]!;
    if (!st.includes(".select(") || /\.(insert|update|upsert|delete)\(/.test(head)) continue;
    const before = text.slice(Math.max(0, m.index - 200), m.index);
    out.push({
      file,
      table: m[1]!,
      line: text.slice(0, m.index).split("\n").length,
      one: /maybeSingle\(|\.single\(|head:\s*true|\.limit\(1\)/.test(st),
      paged: /pages(<[^>]*>)?\(\s*\(\)\s*=>\s*supabase$/.test(before.trimEnd()),
      checked: /\bread(<[^>]*>)?\(\s*supabase$/.test(before.trimEnd()),
    });
  }
  return out;
}

const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : []));

const reads = walk(SRC)
  .filter((f) => !f.endsWith(join("cloud", "repo.ts")))
  .flatMap((f) => readsIn(relative(ROOT, f).split("\\").join("/"), readFileSync(f, "utf8")));

describe("unit:directReads — list reads outside repo.ts are paged or small (04 §12.5)", () => {
  it("the parser sees the reads at all (not blind)", () => {
    expect(reads.length).toBeGreaterThanOrEqual(14);   // 14 since 17-job §12.1: estimate.deposit is one rpc, no reads
    expect(reads.some((r) => r.one)).toBe(true);
  });
  it("every list read goes through pages() or is listed as small, with its reason", () => {
    const bad = reads.filter((r) => !r.one && !r.paged && !SMALL[`${r.file} ${r.table}`]).map((r) => `${r.file}:${r.line} ${r.table}`);
    expect(bad).toEqual([]);
  });
  it("the list has no stale entries", () => {
    const seen = new Set(reads.filter((r) => !r.one && !r.paged).map((r) => `${r.file} ${r.table}`));
    expect(Object.keys(SMALL).filter((k) => !seen.has(k))).toEqual([]);
  });
  it("lead sources of the company are read page by page (they grow with imports)", () => {
    const ls = reads.filter((r) => r.file === "src/cloud/ops.ts" && r.table === "lead_sources");
    expect(ls.length).toBeGreaterThan(0);
    expect(ls.every((r) => r.paged)).toBe(true);
  });
  it("fixtures: a list read fails, one row / pages() pass", () => {
    const list = readsIn("x.ts", 'const { data } = await supabase.from("customers").select("id").eq("company_id", c);');
    expect(list.map((r) => [r.one, r.paged])).toEqual([[false, false]]);
    const one = readsIn("x.ts", 'await supabase.from("jobs").select("status").eq("id", j).maybeSingle();');
    expect(one[0]!.one).toBe(true);
    const paged = readsIn("x.ts", 'await pages<Row>(() => supabase.from("lead_sources").select("id").eq("company_id", c), byId);');
    expect(paged[0]!.paged).toBe(true);
    expect(readsIn("x.ts", 'await supabase.from("files").update({ a: 1 }).eq("id", f).select("id");')).toEqual([]);
  });

  it("ops.ts: every read inside an op checks its error — through read() or pages(), never `const { data } = await supabase…`", () => {
    const ops = reads.filter((r) => r.file === "src/cloud/ops.ts");
    expect(ops.length).toBeGreaterThanOrEqual(9); // not blind; «Работы» move estimate.deposit to an RPC (−3)
    expect(ops.filter((r) => !r.checked && !r.paged).map((r) => `${r.file}:${r.line} ${r.table}`)).toEqual([]);
  });
  it("fixtures: read(supabase…) is checked, a bare await is not", () => {
    expect(readsIn("x.ts", 'const { data } = await read(supabase.from("jobs").select("id").eq("id", j).maybeSingle());')[0]!.checked).toBe(true);
    expect(readsIn("x.ts", 'const { data } = await supabase.from("jobs").select("id").eq("id", j).maybeSingle();')[0]!.checked).toBe(false);
  });
  it("ops.ts: a paged read is not swallowed into «nothing there» (no bare .catch(() => []))", () => {
    const text = readFileSync(join(SRC, "cloud", "ops.ts"), "utf8");
    expect(text).not.toMatch(/\.catch\(\s*\(\)\s*=>\s*\[/);
  });
});
