/**
 * Dates in the database tests (#620, docs/ai/CHECKS.md §9 п.7): `current_date` and `now()::date` are the UTC date, and from
 * 00:00 UTC to midnight in Los Angeles (the company's evening) it is already tomorrow — T147 went red on main and every PR
 * for 8 hours (#476). Tests under supabase/tests take «today» from tst.today() (the company's own day); the run at a risky
 * hour is `DB_NOW=la-2340 bash supabase/tests/run.sh`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../../supabase/tests");
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith(".sql") ? [join(dir, d.name)] : []));

// `-- …` comments go (they explain the rule); the lines stay, so the numbers are right
const stripComments = (sql: string) => sql.replace(/--.*$/gm, "");
const lineOf = (src: string, at: number) => src.slice(0, at).split("\n").length;

/** What the guard finds in one SQL file: «<line>: <what>». */
export function dbDateFindings(raw: string): string[] {
  const src = stripComments(raw);
  const out: string[] = [];
  for (const m of src.matchAll(/\bcurrent_date\b/gi)) out.push(`${lineOf(src, m.index!)}: current_date is the UTC date — use tst.today()`);
  // now() / current_timestamp turned into a date with no «at time zone» on the way: the UTC date too
  for (const m of src.matchAll(/\b(?:now\(\)|current_timestamp|localtimestamp)(?:\s*[-+]\s*interval\s+'[^']*')?\s*\)?\s*::\s*date\b/gi))
    out.push(`${lineOf(src, m.index!)}: a UTC date from the clock — use tst.today() or (now() at time zone <company tz>)::date`);
  for (const m of src.matchAll(/\b(?:date\s*\(\s*now\(\)\s*\)|cast\s*\(\s*now\(\)\s+as\s+date\s*\))/gi)) out.push(`${lineOf(src, m.index!)}: a UTC date from the clock — use tst.today()`);
  return out;
}

describe("database tests: «today» is the company's day", () => {
  const all = files(root).map((f) => f.slice(root.length + 1));
  it("finds the test files", () => expect(all).toContain("core_rls.sql"));
  it.each(all.map((f) => [f]))("%s", (rel) => expect(dbDateFindings(readFileSync(join(root, rel), "utf8"))).toEqual([]));
  it("core_rls.sql has tst.today() by the company's time zone", () => {
    const src = readFileSync(join(root, "core_rls.sql"), "utf8");
    expect(src).toMatch(/create function tst\.today\([^)]*\)[\s\S]*?now\(\) at time zone c\.timezone/);
  });

  // the guard itself: red on what broke the runs, green on the company's day
  it.each([
    "select tst.set_expires(e, current_date - 1);",
    "update public.invoices set due_date = CURRENT_DATE + 7;",
    "select tst.set_expires(e, (now() - interval '3 days')::date);",
    "select now()::date;",
    "select current_timestamp::date - 1;",
    "select date(now());",
    "select cast(now() as date);",
  ])("red on %j", (sql) => expect(dbDateFindings(sql).length).toBe(1));
  it.each([
    "select tst.set_expires(e, tst.today() - 1);",
    "select (now() at time zone timezone)::date - 1 from public.companies;",
    "select (now() at time zone 'America/Los_Angeles')::date;",
    "-- current_date is UTC: use tst.today()",
    "select now() - interval '15 days';",
    "select '2026-11-10'::date;",
  ])("green on %j", (sql) => expect(dbDateFindings(sql)).toEqual([]));
});
