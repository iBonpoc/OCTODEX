/** Pipeline pause (#1087, rule 26): a PR is stopped while a «остановка» task is open, unless it carries «починка». */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const repo = join(__dirname, "../../..");
const { decide, stopsFrom, liveLabels } = require("../../../scripts/pipelinePause.cjs") as {
  liveLabels: (l: unknown, fallback: string[]) => string[];
  decide: (a: { event: string; prLabels: string[]; stops: { number: number }[] }) => { pause: boolean; message: string };
  stopsFrom: (l: unknown) => { number: number }[];
};
const { pickRuns, waitFor } = require("../../../scripts/pipelineResume.cjs") as {
  waitFor: (runs: { id: number; status: string }[]) => boolean;
  pickRuns: (a: { prs: { number: number; runs: { id: number; conclusion: string; headSha: string; pauseFailed: boolean }[] }[]; prHeads: Record<number, string> }) => number[];
};
const wf = (n: string) => readFileSync(join(repo, ".github/workflows", n), "utf8");

describe("decide: who is paused", () => {
  it("no open stop → the PR runs", () => expect(decide({ event: "pull_request", prLabels: [], stops: [] }).pause).toBe(false));
  it("an open stop and a plain PR → paused, with the number and the plain text", () => {
    const r = decide({ event: "pull_request", prLabels: ["ошибка"], stops: [{ number: 1075 }] });
    expect(r.pause).toBe(true);
    expect(r.message).toContain("пауза: остановка #1075");
    expect(r.message).toContain("починка");
  });
  it("two stops are both named", () => expect(decide({ event: "pull_request", prLabels: [], stops: [{ number: 1 }, { number: 2 }] }).message).toContain("#1, #2"));
  it("the label «починка» lets the PR run through an open stop", () => expect(decide({ event: "pull_request", prLabels: ["починка"], stops: [{ number: 1 }] }).pause).toBe(false));
  it("push to main, the nightly run and a manual run are never paused", () => {
    for (const event of ["push", "schedule", "workflow_dispatch"]) expect(decide({ event, prLabels: [], stops: [{ number: 1 }] }).pause).toBe(false);
  });
  it("pull requests in the issues list are not stops", () => {
    expect(stopsFrom([{ number: 5, pull_request: {} }, { number: 6 }])).toEqual([{ number: 6, title: undefined }]);
    expect(stopsFrom(null)).toEqual([]);
  });
});

describe("live labels (probe #1129: «починка» added while the run waited for a runner)", () => {
  it("the live list wins over the event's labels", () => expect(liveLabels([{ name: "починка" }, { name: "ошибка" }], [])).toEqual(["починка", "ошибка"]));
  it("a broken answer keeps the fallback instead of dropping the label", () => {
    expect(liveLabels(null, ["починка"])).toEqual(["починка"]);
    expect(liveLabels({ message: "Not Found" }, ["починка"])).toEqual(["починка"]);
  });
  it("a PR labelled «починка» live is not paused even though the event had no labels", () => {
    const prLabels = liveLabels([{ name: "починка" }], []);
    expect(decide({ event: "pull_request", prLabels, stops: [{ number: 1 }] }).pause).toBe(false);
  });
});

describe("waitFor: the resume waits for a run that is still going", () => {
  it("queued / in progress → wait; completed → the answer is known", () => {
    expect(waitFor([{ id: 2, status: "queued" }])).toBe(true);
    expect(waitFor([{ id: 3, status: "in_progress" }, { id: 2, status: "completed" }])).toBe(true);
    expect(waitFor([{ id: 3, status: "completed" }, { id: 2, status: "in_progress" }])).toBe(false);
    expect(waitFor([])).toBe(false);
  });
});

describe("pickRuns: what the resume re-runs", () => {
  const head = { 7: "aaa", 8: "bbb" };
  it("only the newest run of the current head that failed ON the pause, oldest PR first", () => {
    const ids = pickRuns({
      prHeads: head,
      prs: [
        { number: 8, runs: [{ id: 80, conclusion: "failure", headSha: "bbb", pauseFailed: true }] },
        { number: 7, runs: [{ id: 70, conclusion: "failure", headSha: "aaa", pauseFailed: true }, { id: 71, conclusion: "failure", headSha: "old", pauseFailed: true }] },
      ],
    });
    expect(ids).toEqual([70, 80]);
  });
  it("a run that failed on a real test is never re-run", () => {
    expect(pickRuns({ prHeads: head, prs: [{ number: 7, runs: [{ id: 70, conclusion: "failure", headSha: "aaa", pauseFailed: false }] }] })).toEqual([]);
  });
  it("a green or running run is left alone", () => {
    expect(pickRuns({ prHeads: head, prs: [{ number: 7, runs: [{ id: 70, conclusion: "success", headSha: "aaa", pauseFailed: false }] }] })).toEqual([]);
  });
});

describe("the workflows", () => {
  const checks = wf("checks.yml");
  it("every heavy job waits for the pause; the final «checks» is RED when the pause failed (skipped must not read as green)", () => {
    expect(checks).toMatch(/\n  pause:\n[\s\S]*node scripts\/pipelinePause\.cjs/);
    for (const job of ["changes", "fast", "rule22"]) {
      const body = checks.slice(checks.indexOf(`\n  ${job}:\n`)).split(/\n  [a-z0-9-]+:\n/)[1];
      expect(body, job).toMatch(/needs: pause/);
    }
    const final = checks.slice(checks.indexOf("\n  checks:\n"));
    expect(final).toMatch(/needs: \[pause,/);
    expect(final).toMatch(/if: always\(\)/);
    expect(final).toMatch(/needs\.pause\.result \}\}" = "success" \] \|\| \{[^\n]*exit 1/);
  });
  it("the stop and fix labels come from the script and the workflow's if filters on them", () => {
    const resume = wf("pipeline-resume.yml");
    expect(resume).toContain("'остановка'");
    expect(resume).toContain("'починка'");
    expect(resume).toMatch(/cancel-in-progress: false/);
  });
  it("minimal rights: nothing is merged or pushed", () => {
    const resume = wf("pipeline-resume.yml");
    expect(resume).toMatch(/permissions:\n  actions: write\n  issues: read\n  pull-requests: read\n  contents: read\n/);
    expect(resume).not.toMatch(/contents: write|pull-requests: write|issues: write/);
    expect(resume).not.toMatch(/gh pr merge|git push/);
  });
  it("the pause job reads the PR's labels live: it has the number and the right to read it", () => {
    const job = checks.slice(checks.indexOf("\n  pause:\n"), checks.indexOf("\n  changes:\n"));
    expect(job).toContain("PR_NUMBER: ${{ github.event.pull_request.number }}");
    expect(job).toMatch(/pull-requests: read/);
  });
  it("label names and numbers reach the shell through env, never pasted into the command", () => {
    expect(checks).toMatch(/PR_LABELS: \$\{\{ join\(github\.event\.pull_request\.labels\.\*\.name/);
    expect(checks).not.toMatch(/run: [^\n]*\$\{\{ github\.event\.pull_request\.labels/);
  });
});
