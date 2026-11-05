/**
 * The story map (docs/15-story-map.md) must match the code and the database (CLAUDE.md rules 14–15).
 *   §4 handoffs: every test reference exists; every handoff has a test or is openly marked ✚ (no test yet).
 *   §5 statuses: every app status is listed in the map; every status the migrations allow has a translation
 *   database → app (src/cloud/statusMap.ts), and every translation lands on a real app status.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CUSTOMER_STATUSES, ESTIMATE_STATUSES, JOB_STATUSES, LEAD_STATUSES, VISIT_STATUSES } from "../src/data/types";
import { customerStatus, estimateStatus, jobStatus, leadStatus, leadStatusToDb } from "../src/cloud/statusMap";

const ROOT = path.resolve(__dirname, "../../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const map = read("docs/15-story-map.md");

function section(n: number): string {
  const start = map.indexOf(`## ${n}.`);
  const end = map.indexOf(`## ${n + 1}.`, start);
  expect(start, `section ${n} in the story map`).toBeGreaterThan(-1);
  return map.slice(start, end === -1 ? undefined : end);
}
const rows = (sec: string) =>
  sec
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|\s*-/.test(l))
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));

/* ---------- §4 handoffs ---------- */
const handoffs = rows(section(4)).filter((r) => /^S\d+[ab]?$/.test(r[0] ?? ""));
const dbTests = read("supabase/tests/core_rls.sql");

function refExists(ref: string): boolean {
  const [kind, name] = ref.split(":");
  if (kind === "e2e") return fs.existsSync(path.join(ROOT, "apps/mobile/e2e/specs", `${name}.cjs`));
  if (kind === "unit") return fs.existsSync(path.join(ROOT, "apps/mobile/test", `${name}.test.ts`));
  if (kind === "engine") return fs.existsSync(path.join(ROOT, "packages/estimating-engine/test", `${name}.test.ts`));
  if (kind === "db") return new RegExp(`\\\\echo '${name} [^']* ok'`).test(dbTests);
  return false;
}

describe("story map §4: handoffs", () => {
  it("lists the handoffs S0…S15", () => {
    expect(handoffs.map((r) => r[0])).toEqual(expect.arrayContaining(Array.from({ length: 16 }, (_, i) => `S${i}`)));
  });
  for (const r of handoffs) {
    const [id, , , , tests = "", cover = ""] = r;
    const refs = tests.split(",").map((x) => x.trim()).filter((x) => x && x !== "—");
    it(`${id}: every referenced test exists`, () => {
      for (const ref of refs) expect(refExists(ref), `${id} → ${ref}`).toBe(true);
    });
    it(`${id}: has a test, or is openly marked as missing (✚)`, () => {
      expect(["✅", "◐", "✚"], `${id} coverage mark`).toContain(cover);
      if (cover === "✚") expect(refs, `${id} is ✚ but lists tests`).toEqual([]);
      else expect(refs.length, `${id} is ${cover} but lists no test`).toBeGreaterThan(0);
    });
  }
});

/* ---------- §5 statuses ---------- */
const statusRows = new Map(rows(section(5)).map((r) => [r[0], r]));
const ticks = (cell: string) => [...cell.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);

const migrations = fs
  .readdirSync(path.join(ROOT, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => read(`supabase/migrations/${f}`))
  .join("\n");
/** Statuses the database allows for table.status: the inline check in CREATE TABLE, replaced by any later <table>_status_check. */
function dbStatuses(table: string): string[] {
  const list = (s: string) => [...s.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const later = [...migrations.matchAll(new RegExp(`${table}_status_check\\s+check \\(status in \\(([^)]*)\\)\\)`, "g"))].pop();
  if (later) return list(later[1]!);
  const create = migrations.indexOf(`create table public.${table} (`);
  expect(create, `create table ${table}`).toBeGreaterThan(-1);
  const body = migrations.slice(create, migrations.indexOf("\n);", create));
  const inline = body.match(/\bstatus\s+text[^\n]*\n?[^\n]*check \(status in \(([^)]*)\)\)/);
  expect(inline, `${table}.status check`).toBeTruthy();
  return list(inline![1]!);
}

describe("story map §5: statuses", () => {
  const cases = [
    { entity: "Lead", app: LEAD_STATUSES as readonly string[], table: "leads", toApp: leadStatus as Record<string, string> },
    { entity: "Estimate", app: ESTIMATE_STATUSES as readonly string[], table: "estimates", toApp: estimateStatus as Record<string, string> },
    { entity: "Job", app: JOB_STATUSES as readonly string[], table: "jobs", toApp: jobStatus as Record<string, string> },
    { entity: "Customer", app: CUSTOMER_STATUSES as readonly string[], table: "customers", toApp: customerStatus as Record<string, string> },
  ];
  for (const c of cases) {
    it(`${c.entity}: the map lists exactly the app statuses`, () => {
      const row = statusRows.get(c.entity);
      expect(row, `${c.entity} row in §5`).toBeTruthy();
      expect(ticks(row![1]!).filter((x) => x !== "archivedAt").sort()).toEqual([...c.app].sort());
    });
    it(`${c.entity}: every database status has a translation to a real app status`, () => {
      for (const s of dbStatuses(c.table)) {
        expect(c.toApp[s], `${c.table}.status '${s}' has no translation in statusMap.ts`).toBeDefined();
        expect(c.app, `${c.table}.status '${s}' → '${c.toApp[s]}'`).toContain(c.toApp[s]);
      }
    });
    it(`${c.entity}: no translation for a status the database no longer allows`, () => {
      const allowed = dbStatuses(c.table);
      for (const s of Object.keys(c.toApp)) expect(allowed, `statusMap.ts '${s}'`).toContain(s);
    });
  }
  it("Lead: every app status is written as a status the database allows, and reads back as itself", () => {
    const allowed = dbStatuses("leads");
    for (const s of LEAD_STATUSES) {
      expect(allowed, `app '${s}' → db '${leadStatusToDb[s]}'`).toContain(leadStatusToDb[s]);
      expect(leadStatus[leadStatusToDb[s]], `round trip of '${s}'`).toBe(s);
    }
  });
  it("Visit: the map lists exactly the app statuses (steps + done + cancelled)", () => {
    expect(ticks(statusRows.get("Visit")![1]!).sort()).toEqual([...VISIT_STATUSES].sort());
  });
});
