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
const { decide, releaseFailed, CHECKS, LABEL } = require("../../../scripts/releaseHealthIssue.cjs") as {
  decide: (x: { keyOk: boolean; release: Release; open: { key: number | null; release: number | null } }) => { key: string; release: string };
  releaseFailed: (r: Release) => boolean;
  CHECKS: Record<"key" | "release", { title: string; body: (x: { runUrl: string; release: Release }) => string }>;
  LABEL: string;
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
  it("the last release failed → a task with its run; passed → closed; skipped or cancelled is not a stop", () => {
    expect(decide({ keyOk: true, release: { conclusion: "failure", url: "u" }, open: none }).release).toBe("create");
    expect(decide({ keyOk: true, release: { conclusion: "timed_out", url: "u" }, open: { key: null, release: 3 } }).release).toBe("comment");
    expect(decide({ keyOk: true, release: ok, open: { key: null, release: 3 } }).release).toBe("close");
    for (const c of ["skipped", "cancelled", "success"]) expect(releaseFailed({ conclusion: c, url: "u" }), c).toBe(false);
    expect(releaseFailed(null)).toBe(false);
  });
  it("the two problems are kept apart: each has its own task", () => {
    expect(decide({ keyOk: false, release: { conclusion: "failure", url: "u" }, open: none })).toEqual({ key: "create", release: "create" });
    expect(CHECKS.key.title).not.toBe(CHECKS.release.title);
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
    // the same pinned CLI as the release (a moving «latest» fails on GitHub's rate limit)
    expect(wf).toMatch(/version: 3\.0\.0/);
  });
});
