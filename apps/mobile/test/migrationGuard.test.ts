/**
 * migrationGuard — the database changes in two steps (rule 16; docs/ai/CHECKS.md §3а п.3; «Каркас» №5, 06.11).
 * Phones keep old versions of the app and work offline: one migration must not take away what they still read.
 * For every NEW migration (after BASELINE — merged ones are never edited):
 * 1. `drop table|view|column|function`, `rename column|to`, `alter … rename` need the mark
 *      -- rule16: step 2 (<what>, <PR that stopped reading it>)
 *    in the statement or on the line above it. Not needed for what the same migration created (a temp table) or, for a
 *    function, re-creates under the same name (a new signature).
 * 2. `create index` without `concurrently` on a BIG table (rows grow with the business: the lock stops the phones'
 *    writes) needs the mark `-- rule16: small (<why>)`; not needed on a table the same migration created.
 * 3. `create index concurrently` only in a file of nothing but such statements (supabase db push runs that file outside
 *    a transaction, CLI 3.0.0, 20261106190000; anything else wraps it in one and the push fails).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
/** the last migration merged when the guard came (06.11): those are history, not checked */
export const BASELINE = "20261106210000";
/** tables whose rows grow with every job, lead and message — an index on them is built `concurrently` */
export const BIG_TABLES: readonly string[] = [
  "customers", "contacts", "properties", "leads", "activities", "jobs", "job_line_items", "visits", "visit_assignees",
  "estimates", "estimate_versions", "estimate_options", "estimate_line_items", "estimate_line_costs", "estimate_approvals",
  "invoices", "invoice_line_items", "payments", "notifications", "audit_log", "files", "tasks", "notes", "calendar_events",
  "email_outbox", "user_locations", "legal_acceptance", "memberships", "users",
];

const strip = (sql: string) => sql.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, (m) => m.replace(/[^\n]/g, " ")); // bodies out, lines kept
/** the statements with their line number and the comment lines just above them */
function statements(sql: string): { text: string; line: number; marks: string }[] {
  const src = strip(sql);
  const out: { text: string; line: number; marks: string }[] = [];
  const lines = src.split("\n");
  let buf = "";
  let comments: string[] = [];
  let first = -1;
  lines.forEach((l, i) => {
    const code = l.replace(/--.*$/, "");
    const comment = /--(.*)$/.exec(l)?.[1] ?? "";
    if (!buf.trim()) {
      if (!code.trim()) {
        if (comment) comments.push(comment);
        else if (!l.trim()) comments = comments.slice(-3);
        return;
      }
      first = i + 1;
    }
    buf += `${code}\n`;
    if (comment) comments.push(comment);
    if (code.includes(";")) {
      out.push({ text: buf.replace(/\s+/g, " ").trim(), line: first, marks: comments.join(" ") });
      buf = "";
      comments = [];
    }
  });
  return out;
}

export function guardMigration(file: string, sql: string): string[] {
  const errs: string[] = [];
  const st = statements(sql);
  const created = new Set(
    st.flatMap((s) => [...s.text.matchAll(/create (?:temp(?:orary)? )?(?:table|view|materialized view) (?:if not exists )?(?:public\.|app\.)?([a-z_][a-z0-9_]*)/gi)].map((m) => m[1]!.toLowerCase())),
  );
  const fnsCreated = new Set(st.flatMap((s) => [...s.text.matchAll(/create (?:or replace )?function (?:public\.|app\.)?([a-z_][a-z0-9_]*)/gi)].map((m) => m[1]!.toLowerCase())));
  const step2 = (marks: string) => /rule16:\s*step 2\s*\(/i.test(marks);
  for (const s of st) {
    const t = s.text;
    const at = `${file}:${s.line}`;
    // 1. drop / rename
    const dropT = /\bdrop (table|view|materialized view) (?:if exists )?(?:public\.|app\.)?([a-z_][a-z0-9_]*)/i.exec(t);
    if (dropT && !created.has(dropT[2]!.toLowerCase()) && !step2(s.marks)) errs.push(`${at}: drop ${dropT[1]} ${dropT[2]} without «-- rule16: step 2 (…)»`);
    const dropC = /\bdrop column (?:if exists )?([a-z_][a-z0-9_]*)/i.exec(t);
    if (dropC && !step2(s.marks)) errs.push(`${at}: drop column ${dropC[1]} without «-- rule16: step 2 (…)»`);
    const dropF = /\bdrop function (?:if exists )?(?:public\.|app\.)?([a-z_][a-z0-9_]*)/i.exec(t);
    if (dropF && !fnsCreated.has(dropF[1]!.toLowerCase()) && !step2(s.marks)) errs.push(`${at}: drop function ${dropF[1]} without «-- rule16: step 2 (…)»`);
    if (/\brename (column |to )/i.test(t) && !step2(s.marks)) errs.push(`${at}: a rename without «-- rule16: step 2 (…)» (add the new name, write both, move the data — then drop the old in step 2)`);
    // 2. an index on a big table
    const idx = /\bcreate (unique )?index (concurrently )?(?:if not exists )?[a-z0-9_]* ?on (?:only )?(?:public\.)?([a-z_][a-z0-9_]*)/i.exec(t);
    if (idx && !idx[2] && BIG_TABLES.includes(idx[3]!.toLowerCase()) && !created.has(idx[3]!.toLowerCase()) && !/rule16:\s*small\s*\(/i.test(s.marks))
      errs.push(`${at}: create index on ${idx[3]} without «concurrently» — it locks the phones' writes (or «-- rule16: small (why)»)`);
  }
  // 3. concurrently alone
  if (st.some((s) => /\bconcurrently\b/i.test(s.text)) && st.some((s) => !/\b(create|drop) (unique )?index concurrently\b/i.test(s.text)))
    errs.push(`${file}: «concurrently» shares the file with other statements — supabase db push wraps it in a transaction and fails; put it in a file of its own`);
  return errs;
}

describe("migrationGuard — the rules themselves (each fixture must fail)", () => {
  const g = (sql: string) => guardMigration("20990101000000_x.sql", sql);
  it("a drop or a rename of what old phones read — refused without the step-2 mark", () => {
    expect(g("alter table public.jobs drop column title;")[0]).toMatch(/drop column title/);
    expect(g("drop table public.lead_costs;")[0]).toMatch(/drop table lead_costs/);
    expect(g("drop function if exists public.assign_visit(uuid, uuid[]);")[0]).toMatch(/drop function assign_visit/);
    expect(g("alter table public.jobs rename column title to name;")[0]).toMatch(/rename/);
    expect(g("alter function app.portal_estimate(text) rename to portal_estimate_base;")[0]).toMatch(/rename/);
  });
  it("…and passes with the mark, or for what the same file creates", () => {
    expect(g("-- rule16: step 2 (jobs.title, app stopped reading it in #300)\nalter table public.jobs drop column title;")).toEqual([]);
    expect(g("create temp table _tmp as select 1;\ndrop table _tmp;")).toEqual([]);
    expect(g("drop function if exists public.f(uuid);\ncreate function public.f(p_a uuid, p_b int) returns void language sql as $$ select 1 $$;")).toEqual([]);
    expect(g("create function public.f() returns void language plpgsql as $$ begin drop table x; end $$;")).toEqual([]); // inside a body
  });
  it("an index on a big table without concurrently — refused; on a small or a new table, or marked — passes", () => {
    expect(g("create index visits_x_idx on public.visits (company_id);")[0]).toMatch(/without «concurrently»/);
    expect(g("create unique index if not exists jobs_n on public.jobs (number);")[0]).toMatch(/jobs/);
    expect(g("create index job_types_x on public.job_types (company_id);")).toEqual([]);
    expect(g("create table public.user_things (id uuid);\ncreate index ut_idx on public.user_things (id);")).toEqual([]);
    expect(g("-- rule16: small (a new column, all null)\ncreate index visits_y on public.visits (all_day);")).toEqual([]);
  });
  it("concurrently only in a file of its own", () => {
    expect(g("create index concurrently if not exists visits_z on public.visits (company_id);")).toEqual([]);
    expect(g("create index concurrently visits_z on public.visits (company_id);\nalter table public.visits add column a int;")[0]).toMatch(/file of its own/);
  });
});

describe("migrationGuard — the new migrations of this repository", () => {
  const files = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  it("the baseline is a merged migration (the guard starts after it)", () => {
    expect(files.some((f) => f.startsWith(BASELINE))).toBe(true);
  });
  for (const f of files.filter((x) => x.slice(0, 14) > BASELINE)) {
    it(f, () => {
      expect(guardMigration(f, fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"))).toEqual([]);
    });
  }
  it("the merged history would be caught today (the guard is not blind): at least one old drop/rename is found", () => {
    const old = files.filter((x) => x.slice(0, 14) <= BASELINE).flatMap((f) => guardMigration(f, fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8")));
    expect(old.some((e) => /rename|drop/.test(e))).toBe(true);
  });
});
