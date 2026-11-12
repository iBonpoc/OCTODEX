/** #1074: an Expo patch release must not turn PRs red; only a PR that changed dependencies is red; a daily run keeps one task. */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const repo = join(__dirname, "../../..");
const { depsChanged } = require("../../../scripts/depsChanged.cjs") as { depsChanged: (f: string[]) => boolean };
const { decide, TITLE } = require("../../../scripts/expoPatchesIssue.cjs") as { decide: (a: { mismatch: boolean; openIssue: number | null }) => { action: string }; TITLE: string };
const wf = (n: string) => readFileSync(join(repo, ".github/workflows", n), "utf8");

describe("depsChanged: which files are dependencies", () => {
  it("package.json files and the lock count", () => {
    for (const f of ["package.json", "package-lock.json", "apps/mobile/package.json", "packages/design-tokens/package.json"]) expect(depsChanged([f]), f).toBe(true);
  });
  it("source, docs, workflows and nested package.json fixtures do not", () => {
    expect(depsChanged(["apps/mobile/src/app/index.tsx", "docs/x.md", ".github/workflows/checks.yml", "apps/mobile/test/fixtures/package.json", "supabase/migrations/1.sql"])).toBe(false);
    expect(depsChanged([])).toBe(false);
  });
  it("one dependency file among many is enough", () => expect(depsChanged(["a.ts", "package-lock.json", "b.ts"])).toBe(true));
});

describe("scripts/depsChanged.cjs against a real git history (the base is the MERGE-BASE)", () => {
  const git = (cwd: string, ...a: string[]) => spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd, encoding: "utf8" });
  const commit = (cwd: string, file: string, text: string) => { mkdirSync(join(cwd, file, ".."), { recursive: true }); writeFileSync(join(cwd, file), text); git(cwd, "add", "-A"); git(cwd, "commit", "-qm", file); return git(cwd, "rev-parse", "HEAD").stdout.trim(); };
  const run = (cwd: string, env: Record<string, string>) => spawnSync("node", [join(repo, "scripts/depsChanged.cjs")], { cwd, encoding: "utf8", env: { ...process.env, ...env } });

  it("main moved on with a package-lock change AFTER the PR was opened: the PR itself changed none → false", () => {
    const d = mkdtempSync(join(tmpdir(), "deps-"));
    git(d, "init", "-q", "-b", "main");
    const root = commit(d, "README.txt", "x");
    git(d, "checkout", "-q", "-b", "pr");
    const head = commit(d, "src/a.ts", "a");
    git(d, "checkout", "-q", "main");
    const tip = commit(d, "package-lock.json", "{}"); // someone else changed the lock on main
    const r = run(d, { EVENT_NAME: "pull_request", BASE_SHA: tip, HEAD_SHA: head });
    expect(r.stdout).toContain("deps=false");
    expect(root).not.toBe(tip);
  });
  it("the PR changed the lock → true", () => {
    const d = mkdtempSync(join(tmpdir(), "deps-"));
    git(d, "init", "-q", "-b", "main");
    const base = commit(d, "README.txt", "x");
    git(d, "checkout", "-q", "-b", "pr");
    const head = commit(d, "package-lock.json", "{}");
    expect(run(d, { EVENT_NAME: "pull_request", BASE_SHA: base, HEAD_SHA: head }).stdout).toContain("deps=true");
  });
  it("a base that cannot be found → true (the strict side); push / nightly → false (a warning only)", () => {
    const d = mkdtempSync(join(tmpdir(), "deps-"));
    git(d, "init", "-q", "-b", "main");
    const head = commit(d, "a.txt", "a");
    expect(run(d, { EVENT_NAME: "pull_request", BASE_SHA: "0".repeat(40), HEAD_SHA: head }).stdout).toContain("deps=true");
    for (const EVENT_NAME of ["push", "schedule", "workflow_dispatch"]) expect(run(d, { EVENT_NAME, BASE_SHA: "", HEAD_SHA: head }).stdout, EVENT_NAME).toContain("deps=false");
  });
});

describe("the daily task", () => {
  it("one task: created on a mismatch, commented while it stays, closed when versions match again", () => {
    expect(decide({ mismatch: true, openIssue: null }).action).toBe("create");
    expect(decide({ mismatch: true, openIssue: 5 }).action).toBe("comment");
    expect(decide({ mismatch: false, openIssue: 5 }).action).toBe("close");
    expect(decide({ mismatch: false, openIssue: null }).action).toBe("none");
  });
  it("the title is the key (no duplicates)", () => expect(TITLE).toContain("патчи Expo"));
});

describe("the workflows", () => {
  const checks = wf("checks.yml");
  const step = checks.slice(checks.indexOf("- name: Dependencies match the Expo SDK"), checks.indexOf("- name: expo-doctor"));
  it("the Expo check is red only with deps=true; otherwise a warning", () => {
    expect(step).toContain("DEPS_CHANGED: ${{ needs.changes.outputs.deps }}");
    expect(step).toMatch(/if \[ "\$DEPS_CHANGED" = "true" \]; then[^\n]*::error::[^\n]*exit 1; fi/);
    expect(step).toContain("::warning::");
  });
  it("the changes job measures deps from the PR head and its base (merge-base in the script)", () => {
    expect(checks).toMatch(/deps: \$\{\{ steps\.deps\.outputs\.deps \}\}/);
    expect(checks).toContain("HEAD_SHA: ${{ github.event.pull_request.head.sha }}");
    expect(checks).toContain("node scripts/depsChanged.cjs");
  });
  it("the daily run is never red and only writes issues", () => {
    const d = wf("expo-patches.yml");
    expect(d).toMatch(/schedule:[\s\S]*cron:/);
    expect(d).toMatch(/permissions:\n  contents: read\n  issues: write\n/);
    expect(d).toMatch(/if npx expo install --check; then echo "mismatch=false"[^\n]*else echo "mismatch=true"/);
  });
});
