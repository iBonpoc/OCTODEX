/** #1004: a store build (TestFlight) only from a commit with a green FULL Checks run (nightly / manual, 6 views). */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Run = { event: string; conclusion: string | null; head_sha: string; head_branch: string; head_repository: { full_name: string } };
type Opts = { ref?: string; repo?: string };
const { decide, runsFromPages } = require("../../../scripts/fullRunGate.cjs") as { decide: (runs: Run[], sha: string, o?: Opts) => { ok: boolean; message: string }; runsFromPages: (json: string) => Run[] };

const A = "a".repeat(40);
const B = "b".repeat(40);
const REPO = "iBonpoc/OCTODEX";
const run = (event: string, conclusion: string | null, head_sha = A, head_branch = "main", repo = REPO): Run => ({ event, conclusion, head_sha, head_branch, head_repository: { full_name: repo } });

describe("store-build gate: decide", () => {
  it("a green nightly run on the commit lets the build go", () => expect(decide([run("schedule", "success")], A).ok).toBe(true));
  it("a green manual full run lets the build go", () => expect(decide([run("workflow_dispatch", "success")], A).ok).toBe(true));
  it("a green PR or push run is not enough (3 views / 1 view)", () => {
    const r = decide([run("pull_request", "success"), run("push", "success")], A);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/только прогоны PR\/push/);
    expect(r.message).toContain("Run workflow");
  });
  it("a red or running full run does not let it go, and says which", () => {
    expect(decide([run("schedule", "failure")], A).message).toMatch(/failure/);
    expect(decide([run("workflow_dispatch", null)], A).message).toMatch(/ещё идёт/);
    expect(decide([run("schedule", "failure"), run("workflow_dispatch", "success")], A).ok).toBe(true); // a rerun that went green
  });
  it("a green full run of ANOTHER commit does not count", () => expect(decide([run("schedule", "success", B)], A).ok).toBe(false));
  it("a cancelled full run does not let it go", () => {
    const r = decide([run("workflow_dispatch", "cancelled")], A);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/cancelled/);
  });
  // review of #1052: Run workflow on a feature branch, then EAS build from the same branch — the same sha, but main is not proven
  it("a green full run on a feature branch does not count, even with the same sha", () => {
    const r = decide([run("workflow_dispatch", "success", A, "feature/x")], A, { repo: REPO });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/прогонов Checks нет/);
  });
  it("a green full run of the same sha in another repository (a fork) does not count", () =>
    expect(decide([run("workflow_dispatch", "success", A, "main", "someone/OCTODEX")], A, { repo: REPO }).ok).toBe(false));
  it("a build started from a branch other than main is refused, whatever the runs", () => {
    const r = decide([run("schedule", "success")], A, { ref: "refs/heads/feature/x", repo: REPO });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/только с ветки main/);
    expect(decide([run("schedule", "success")], A, { ref: "refs/heads/main", repo: REPO }).ok).toBe(true);
  });
  it("no runs at all: says what to do", () => {
    const r = decide([], A);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/прогонов Checks нет/);
  });
});

describe("gh --paginate --slurp output", () => {
  it("two pages become one list; a page without runs is fine", () => {
    const json = JSON.stringify([{ total_count: 3, workflow_runs: [run("push", "success"), run("pull_request", "success")] }, { total_count: 3, workflow_runs: [run("schedule", "success")] }, {}]);
    const runs = runsFromPages(json);
    expect(runs).toHaveLength(3);
    expect(decide(runs, A).ok).toBe(true); // the nightly run is on the second page
  });
});

describe("eas-build.yml: the gate stands before any build", () => {
  const yml = readFileSync(join(__dirname, "../../../.github/workflows/eas-build.yml"), "utf8");
  it("the iOS (store) build runs the gate; it can read the runs", () => {
    expect(yml).toMatch(/Full Checks run is green on this commit[\s\S]*?id: gate\s+if: inputs\.platform != 'android'[\s\S]*?node scripts\/fullRunGate\.cjs/); // every store platform; only the Android APK is free
    expect(yml).toContain("steps.gate.outcome != 'failure'"); // the «credentials missing» hint is not shown when the gate was the failure
    expect(yml).toMatch(/actions: read/);
  });
  it("the gate gets the ref of the build (main only) and reads the API with a clear error", () => {
    expect(yml).toMatch(/node scripts\/fullRunGate\.cjs/);
    expect(yml).toContain("REF: ${{ github.ref }}");
    const src = readFileSync(join(__dirname, "../../../scripts/fullRunGate.cjs"), "utf8");
    expect(src).toMatch(/try \{\s*const out = execFileSync\("gh"/);
    expect(src).toMatch(/catch \(e\) \{\s*console\.log\(`::error::/);
  });
  it("Android: the pause stops it first, and the gate does not run for it", () => {
    const pause = yml.indexOf("Android paused until Firebase");
    expect(pause).toBeGreaterThan(0);
    expect(pause).toBeLessThan(yml.indexOf("node scripts/fullRunGate.cjs"));
    expect(yml).toMatch(/Android paused[^\n]*\n\s+if: inputs\.platform == 'android'/);
    expect(yml).toMatch(/id: gate\s+if: inputs\.platform != 'android'/);
  });
  it("the gate comes before the Expo account and the builds", () => {
    const gate = yml.indexOf("node scripts/fullRunGate.cjs");
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(yml.indexOf("eas-cli@27.4.1 whoami"));
    expect(gate).toBeLessThan(yml.indexOf("build --platform ios"));
  });
});
