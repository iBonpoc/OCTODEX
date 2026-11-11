/**
 * Rule 17 guard (#805): «a new dependency — with a check» (author, is the project alive, look-alike names, install scripts:
 * docs/ai/CHECKS.md §4). Every dependency of every package.json of the repository must have a record in docs/ai/dependencies.json:
 * the date it was checked and a note. A package added without a record is red. The first records are the snapshot of 11.11.2026
 * (`basis: snapshot-before-rule-17`: what was in the project before the guard). `npm audit` runs weekly: .github/workflows/audit.yml.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repo = join(__dirname, "../../..");
const ledger = JSON.parse(readFileSync(join(repo, "docs/ai/dependencies.json"), "utf8")) as Record<string, { checked: string; basis: string; note: string }>;

/** every package.json of the workspaces: root, apps/*, packages/* */
export function manifests(): string[] {
  const list = [join(repo, "package.json")];
  for (const group of ["apps", "packages"]) {
    for (const d of readdirSync(join(repo, group))) {
      const p = join(repo, group, d, "package.json");
      if (existsSync(p)) list.push(p);
    }
  }
  return list;
}
export function dependencyNames(): string[] {
  const names = new Set<string>();
  for (const f of manifests()) {
    const j = JSON.parse(readFileSync(f, "utf8"));
    for (const k of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) for (const n of Object.keys(j[k] ?? {})) names.add(n);
  }
  return [...names].sort();
}

describe("rule 17: every dependency has a checked record", () => {
  it("finds the manifests", () => expect(manifests().length).toBeGreaterThanOrEqual(4));
  it("no dependency without a record in docs/ai/dependencies.json", () => {
    const missing = dependencyNames().filter((n) => !ledger[n]);
    expect(missing, `new dependency without a record — check it by docs/ai/CHECKS.md §4 (author, alive, look-alike, install scripts) and add it to docs/ai/dependencies.json with "checked" (date), "basis" and "note":\n${missing.join("\n")}`).toEqual([]);
  });
  it("every record has a date, a basis and a note", () => {
    const bad = Object.entries(ledger).filter(([, e]) => !/^\d{4}-\d{2}-\d{2}$/.test(e.checked) || !e.basis || !e.note).map(([n]) => n);
    expect(bad).toEqual([]);
  });
  it("a record of a package that is gone is removed (the ledger lists what the project uses)", () => {
    const used = new Set(dependencyNames());
    const gone = Object.keys(ledger).filter((n) => !used.has(n));
    expect(gone, `not in any package.json any more — delete from docs/ai/dependencies.json:\n${gone.join("\n")}`).toEqual([]);
  });
});

describe("rule 17: npm audit runs weekly and fixes nothing", () => {
  const yml = readFileSync(join(repo, ".github/workflows/audit.yml"), "utf8");
  it("runs on a weekly schedule and by hand", () => {
    expect(yml).toMatch(/schedule:\s*\n\s*- cron: '[^']* \* \* 1'/);
    expect(yml).toContain("workflow_dispatch:");
  });
  it("fails on high and critical", () => expect(yml).toContain("npm audit --omit=dev --audit-level=high"));
  it("is read-only: contents read, no secrets, never `audit fix` (rule 17)", () => {
    expect(yml).toMatch(/permissions:\s*\n\s*contents: read/);
    const code = yml.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n"); // the comments may name what is forbidden
    expect(code).not.toMatch(/secrets\./);
    expect(code).not.toMatch(/npm audit fix|--force|issues: write|contents: write/);
  });
});
