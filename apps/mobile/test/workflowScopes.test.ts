/**
 * Where the keys of the repository may go (the stop of 16.11.2026, docs/ai/DIRECTOR.md «Остановка работы»).
 * Static checks of .github/workflows/*.yml: the keys sit only in the environments `release` / `preview-web` (branch main only), a workflow
 * that runs code of a pull request holds no key, checkouts keep no credentials, the preview deploy never runs code of the PR.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(__dirname, "../../../.github/workflows");
const noComments = (s: string) => s.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
const files = readdirSync(dir).filter((f) => f.endsWith(".yml"));
const wf = Object.fromEntries(files.map((f) => [f, noComments(readFileSync(join(dir, f), "utf8"))]));
const onBlock = (s: string) => s.match(/^on:\n([\s\S]*?)(?=^\S)/m)?.[1] ?? "";
// block form («  pull_request:»), the one-line form («on: pull_request» / «on: [push, pull_request]») and a flow map
const onPullRequest = (s: string) => /^ {2}pull_request:/m.test(onBlock(s)) || /^on:\s*(\[[^\]]*)?\bpull_request\b/m.test(s) || /^on:\s*\{[^}]*\bpull_request\b/m.test(s);
const secretsOf = (s: string) => [
  ...[...s.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]).filter((n) => n !== "GITHUB_TOKEN"),
  // the other ways to reach the keys
  ...[...s.matchAll(/secrets:\s*inherit|secrets\[|toJSON\(secrets\)/g)].map((m) => m[0]),
];

describe("workflows: where the keys may go", () => {
  it("there are workflows to look at", () => expect(files.length).toBeGreaterThan(5));

  it("no workflow uses pull_request_target", () => {
    for (const [f, s] of Object.entries(wf)) expect(s, f).not.toMatch(/pull_request_target/);
  });

  it("a workflow that runs on a pull request holds no key of the repository", () => {
    for (const [f, s] of Object.entries(wf)) if (onPullRequest(s)) expect(secretsOf(s), f).toEqual([]);
  });

  it("every workflow that uses a key takes it from the environment release or preview-web", () => {
    for (const [f, s] of Object.entries(wf)) {
      if (!secretsOf(s).length) continue;
      expect(s, f).toMatch(/^\s+environment: (release|preview-web)\s*$/m);
      // every job that reads a key names the environment itself
      const jobs = s.split(/\n(?=  [a-z][\w-]*:\n)/).filter((j) => /secrets\.[A-Z]/.test(j.replace(/secrets\.GITHUB_TOKEN/g, "")));
      for (const j of jobs) expect(j, `${f}: a job with a key`).toMatch(/environment: (release|preview-web)/);
    }
  });

  it("every checkout keeps no credentials", () => {
    for (const [f, s] of Object.entries(wf)) {
      const steps = s.split("\n").flatMap((l, i, a) => (/uses: actions\/checkout@/.test(l) ? [a.slice(i, i + 8).join("\n")] : []));
      for (const st of steps) expect(st, `${f}: checkout`).toMatch(/persist-credentials: false/);
    }
  });

  it("the npm cache only where no key is near: checks and cloud (the cache of a PR is read by its branch only); never next to a key", () => {
    for (const [f, s] of Object.entries(wf)) {
      if (/cache: npm/.test(s) && (secretsOf(s).length || /environment:/.test(s))) expect.fail(`${f}: npm cache next to a key`);
      if (!["checks.yml", "cloud.yml", "expo-patches.yml"].includes(f)) expect(s, f).not.toMatch(/cache: npm/);
    }
  });

  it("no name of a branch or a title from the event is pasted into a script", () => {
    for (const [f, s] of Object.entries(wf)) {
      expect(s, f).not.toMatch(/\$\{\{\s*github\.(head_ref|base_ref|ref|ref_name)\s*\}\}(?!\s*$)/m); // only as the whole value of an env: line
      for (const l of s.split("\n")) {
        if (!/\$\{\{\s*github\.(head_ref|base_ref|ref|ref_name)\s*\}\}/.test(l)) continue;
        expect(l.trim(), `${f}: ${l.trim()}`).toMatch(/^[A-Z_]+: \$\{\{/);
      }
      expect(s, f).not.toMatch(/github\.event\.(pull_request\.(title|head\.ref|body)|head_commit\.message|issue\.title|comment\.body)/);
    }
  });

  it("the preview deploy checks the files of the PR before they go online", () => {
    const s = wf["preview-deploy.yml"];
    expect(s).toMatch(/dist\/index\.html/);
    expect(s).toMatch(/dist\/server/);
    expect(s).toMatch(/find dist -type l/);
  });

  it("the preview deploy runs from main and never checks out or runs the code of the PR", () => {
    const s = wf["preview-deploy.yml"];
    expect(s).toMatch(/workflow_run:/);
    expect(s).not.toMatch(/ref: \$\{\{ github\.event\.workflow_run\.head/);
    expect(s).not.toMatch(/ref: \$\{\{ github\.event\.pull_request/);
    expect(s).toMatch(/environment: preview-web/);
    // the number and the commit are checked before they are used
    expect(s).toMatch(/\^\[0-9\]\+\$/);
    expect(s).toMatch(/\^\[0-9a-f\]\{40\}\$/);
  });

  it("the preview build job holds no key and only uploads static files", () => {
    const s = wf["preview.yml"];
    expect(secretsOf(s)).toEqual([]);
    expect(s).toMatch(/upload-artifact@/);
    expect(s).not.toMatch(/eas-cli/);
  });
});
