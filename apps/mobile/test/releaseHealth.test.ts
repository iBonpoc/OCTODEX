/**
 * #1143 (the stop #1141): a daily run checks the Supabase key and the last Release on main, and keeps ONE task with the label
 * «остановка» per problem while it lasts. The key never reaches the log. `decide` is pure (scripts/releaseHealthIssue.cjs).
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const repo = join(__dirname, "../../..");
type Release = { conclusion: string; url: string } | null;
type Open = { key: number | null; release: number | null; runner?: number | null };
const { decide, releaseFailed, failureKind, CHECKS, LABEL, LABEL_RUNNER, RELEASE_STEPS } = require("../../../scripts/releaseHealthIssue.cjs") as {
  decide: (x: { keyOk: boolean; release: Release; failedSteps?: string[]; open: Open }) => { key: string; release: string; runner: string };
  releaseFailed: (r: Release) => boolean;
  failureKind: (steps: string[]) => "stop" | "runner";
  CHECKS: Record<"key" | "release" | "runner", { title: string; body: (x: { runUrl: string; release: Release; failedSteps?: string[] }) => string }>;
  LABEL: string;
  LABEL_RUNNER: string;
  RELEASE_STEPS: string[];
};
const wf = readFileSync(join(repo, ".github/workflows/release-health.yml"), "utf8");
const ok = { conclusion: "success", url: "u" };
const none = { key: null, release: null };

describe("releaseHealth: one «остановка» task per problem", () => {
  it("the key refused → a task; refused again → a comment; accepted again → closed", () => {
    expect(decide({ keyOk: false, release: ok, open: none }).key).toBe("create");
    expect(decide({ keyOk: false, release: ok, open: { key: 7, release: null } }).key).toBe("comment");
    expect(decide({ keyOk: true, release: ok, open: { key: 7, release: null } }).key).toBe("close");
    expect(decide({ keyOk: true, release: ok, open: none }).key).toBe("none");
  });
  it("the last release failed on its own step → a task «остановка» with its run; passed → closed; skipped or cancelled is not a stop", () => {
    expect(decide({ keyOk: true, release: { conclusion: "failure", url: "u" }, failedSteps: ["Link the project"], open: none })).toMatchObject({ release: "create", runner: "none" });
    expect(decide({ keyOk: true, release: { conclusion: "timed_out", url: "u" }, failedSteps: ["Publish the Expo Go update (channel preview)"], open: { key: null, release: 3 } }).release).toBe("comment");
    expect(decide({ keyOk: true, release: ok, open: { key: null, release: 3 } }).release).toBe("close");
    for (const c of ["skipped", "cancelled", "success"]) expect(releaseFailed({ conclusion: c, url: "u" }), c).toBe(false);
    expect(releaseFailed(null)).toBe(false);
  });
  it("the director's review: a release broken on the runner (set up, checkout, the CLI, no failed step) — a task «проверки», never «остановка» (it pauses every PR)", () => {
    for (const steps of [["Set up job"], ["Run actions/checkout@v4"], ["Run supabase/setup-cli@v1"], []]) {
      expect(failureKind(steps), steps.join() || "no step").toBe("runner");
      expect(decide({ keyOk: true, release: { conclusion: "failure", url: "u" }, failedSteps: steps, open: none })).toMatchObject({ release: "none", runner: "create" });
    }
    // the runner's task closes when the next release passes
    expect(decide({ keyOk: true, release: ok, open: { key: null, release: null, runner: 9 } }).runner).toBe("close");
    expect(LABEL_RUNNER).toBe("проверки");
    expect(CHECKS.runner.body({ runUrl: "RUN", release: { conclusion: "failure", url: "REL" }, failedSteps: ["Set up job"] })).toMatch(/Set up job.*REL.*RUN/s);
  });
  it("every step counted as the release's own is a step of release.yml (a renamed step must not turn a stop into «runner»)", () => {
    const rel = readFileSync(join(repo, ".github/workflows/release.yml"), "utf8");
    for (const n of RELEASE_STEPS) expect(rel, n).toContain(`- name: ${n}`);
    expect(RELEASE_STEPS).toEqual(expect.arrayContaining(["Link the project", "Apply new migrations", "Publish the Expo Go update (channel preview)"]));
  });
  it("the problems are kept apart: each has its own task", () => {
    expect(decide({ keyOk: false, release: { conclusion: "failure", url: "u" }, failedSteps: ["Apply new migrations"], open: none })).toEqual({ key: "create", release: "create", runner: "none" });
    expect(new Set([CHECKS.key.title, CHECKS.release.title, CHECKS.runner.title]).size).toBe(3);
    expect(LABEL).toBe("остановка");
  });
  it("the task says how to fix it and links the run; the release task links the failed release", () => {
    expect(CHECKS.key.body({ runUrl: "RUN", release: null })).toMatch(/Secrets and variables.*RUN/s);
    expect(CHECKS.release.body({ runUrl: "RUN", release: { conclusion: "failure", url: "REL" } })).toMatch(/REL.*RUN/s);
  });
});

describe("release-health.yml: daily, by hand, and the key never in the log", () => {
  it("runs on a schedule and by hand, may write issues and read runs", () => {
    expect(wf).toMatch(/schedule:\s*\n\s*- cron: '[^']+'/);
    expect(wf).toMatch(/workflow_dispatch:/);
    expect(wf).toMatch(/issues: write/);
    expect(wf).toMatch(/actions: read/);
  });
  it("the key reaches only the step that checks it, and that step prints nothing of it (only ok / not)", () => {
    const uses = wf.split("\n").filter((l) => l.includes("secrets.SUPABASE_ACCESS_TOKEN"));
    expect(uses).toHaveLength(1);
    expect(wf).not.toMatch(/echo[^\n]*\$\{?SUPABASE_ACCESS_TOKEN/);
    expect(wf).not.toMatch(/set -x/);
    // the list goes to grep only, its errors nowhere
    expect(wf).toMatch(/supabase projects list -o json 2>\/dev\/null \| grep -q/);
    // the director's review: 3 tries 30 s apart before an alarm (a passing outage is not a stop)
    expect(wf).toMatch(/for try in 1 2 3; do[\s\S]*sleep 30[\s\S]*done/);
    // the same pinned CLI as the release (a moving «latest» fails on GitHub's rate limit)
    expect(wf).toMatch(/version: 3\.0\.0/);
  });
});
