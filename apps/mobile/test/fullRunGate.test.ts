/** #1004: a store build (TestFlight) only from a commit with a green FULL Checks run (nightly / manual, 6 views). */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Run = { event: string; conclusion: string | null; head_sha: string };
const { decide, runsFromPages } = require("../../../scripts/fullRunGate.cjs") as { decide: (runs: Run[], sha: string) => { ok: boolean; message: string }; runsFromPages: (json: string) => Run[] };

const A = "a".repeat(40);
const B = "b".repeat(40);
const run = (event: string, conclusion: string | null, head_sha = A): Run => ({ event, conclusion, head_sha });

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
  it("the gate comes before the Expo account and the builds", () => {
    const gate = yml.indexOf("node scripts/fullRunGate.cjs");
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(yml.indexOf("eas-cli@27.4.1 whoami"));
    expect(gate).toBeLessThan(yml.indexOf("build --platform ios"));
  });
});
