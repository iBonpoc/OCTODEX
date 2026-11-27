/**
 * The stand (#3117 Б, #3120): scripts/stand.cjs decides what goes on the stand (main + the open PRs labelled «стенд») and in
 * which order; stand.yml runs it. Here: the order by dependencies, a conflict left out with the reason, the PRs depending on a
 * left-out one left out too, the PR that breaks the build found by halving, the manifest and the pinned task's body; then the
 * real git merges (merge-tree) on a throw-away repository, and the wiring of stand.yml (who may write, where the key is).
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Pr = { number: number; sha: string; title?: string; body?: string; baseRef?: string; headRef?: string; files?: string[]; fork?: boolean };
type Skip = { number: number; sha: string; reason: string };
const S = require("../../../scripts/stand.cjs") as {
  LABEL: string; BRANCH: string; ALIAS: string; STAND_ISSUE: number;
  dependencyOf: (p: Pr, heads?: Record<string, number>) => { number: number | null; how: string; unknown?: string } | null;
  plan: (a: { prs: Pr[]; open?: number[]; openHeads?: Record<string, number> }) => { order: Pr[]; skipped: Skip[]; deps: Record<number, number> };
  mergeAll: (a: { mainSha: string; order: Pr[]; deps?: Record<number, number>; merge: (base: string, p: Pr) => { ok: boolean; commit?: string; files?: string[] }; exclude?: Record<number, string> }) =>
    { stand: string; included: Pr[]; skipped: Skip[] };
  findBreaker: (list: Pr[], builds: (prefix: Pr[]) => boolean) => Pr | null;
  whereLine: (body: string) => string;
  manifest: (a: { mainSha: string; stand: string; included: Pr[]; skipped: Skip[]; at?: string }) =>
    { main: string; stand: string; at: string; included: Array<{ number: number; sha: string; title: string; where: string }>; skipped: Skip[] };
  renderIssue: (m: ReturnType<typeof S.manifest>, url: string) => string;
  pushArgv: (stand: string, token: string, env?: Record<string, string>) => [string[], Record<string, string>];
  md: (t: string) => string; FIELD_MAX: number; BODY_MAX: number;
  BUILD_IMAGE: string;
  buildArgv: (a: { wt: string; cmd: string; subject: string; uid: number; gid: number }) => [string, string[]];
  gitMerger: (cwd: string, date: string) => (base: string, p: Pr) => { ok: boolean; commit?: string; files?: string[] };
};
const pr = (number: number, more: Partial<Pr> = {}): Pr => ({ number, sha: String(number).padStart(40, "a"), title: `PR ${number}`, body: "", baseRef: "main", headRef: `b${number}`, files: [`f${number}.ts`], ...more });
const nums = (l: { number: number }[]) => l.map((p) => p.number);
/** a fake merge: conflicts when a file of the PR is already taken by main or by a PR in */
const fakeMerge = (taken: string[] = []) => {
  const owner = new Set(taken);
  return (base: string, p: Pr) => {
    const clash = (p.files || []).filter((f) => owner.has(f));
    if (clash.length) return { ok: false, files: clash };
    for (const f of p.files || []) owner.add(f);
    return { ok: true, commit: `${base}+${p.number}` };
  };
};

describe("stand: what it is called", () => {
  it("the label «стенд», the branch stand/auto, the alias stand, the pinned task #3123", () => {
    expect([S.LABEL, S.BRANCH, S.ALIAS, S.STAND_ISSUE]).toEqual(["стенд", "stand/auto", "stand", 3123]);
  });
});

describe("stand.plan: the order by dependencies, then by number", () => {
  it("no dependencies: by number", () => {
    expect(nums(S.plan({ prs: [pr(30), pr(10), pr(20)] }).order)).toEqual([10, 20, 30]);
  });
  it("«зависит от #N» in the description: after N, even when N has the bigger number", () => {
    const r = S.plan({ prs: [pr(10, { body: "Зависит от #30" }), pr(20), pr(30)] });
    expect(nums(r.order)).toEqual([30, 10, 20]); // #10 waits for #30, then the rest by number
    expect(r.deps).toEqual({ 10: 30 });
  });
  it("«depends on #N» and a base branch of another PR count as the dependency; the base wins over the text", () => {
    expect(S.dependencyOf(pr(5, { body: "depends on: #4" }))).toEqual({ number: 4, how: "body" });
    expect(S.dependencyOf(pr(5, { baseRef: "b9", body: "зависит от #4" }), { b9: 9 })).toEqual({ number: 9, how: "base" });
    expect(nums(S.plan({ prs: [pr(3, { baseRef: "b7" }), pr(7)], openHeads: { b7: 7, b3: 3 } }).order)).toEqual([7, 3]);
  });
  it("a chain: each after its dependency", () => {
    const r = S.plan({ prs: [pr(1, { body: "зависит от #2" }), pr(2, { body: "зависит от #3" }), pr(3), pr(4)] });
    expect(nums(r.order)).toEqual([3, 2, 1, 4]);
  });
  it("a dependency that is no longer open (merged) is in main: no wait, no skip", () => {
    const r = S.plan({ prs: [pr(10, { body: "зависит от #5" })], open: [10] });
    expect(nums(r.order)).toEqual([10]);
    expect(r.skipped).toEqual([]);
  });
  it("a dependency open but without the label: left out with the reason, and so are the PRs after it", () => {
    const r = S.plan({ prs: [pr(10, { body: "зависит от #5" }), pr(11, { body: "зависит от #10" }), pr(12)], open: [5, 10, 11, 12] });
    expect(nums(r.order)).toEqual([12]);
    expect(r.skipped).toEqual([
      { number: 10, sha: pr(10).sha, reason: "зависит от #5 — его нет на стенде (нет ярлыка «стенд»)" },
      { number: 11, sha: pr(11).sha, reason: "зависит от #10, он не вошёл" },
    ]);
  });
  it("a base branch that is not main and not an open PR's: left out", () => {
    expect(S.plan({ prs: [pr(10, { baseRef: "old-thing" })] }).skipped[0].reason).toBe("база PR — ветка old-thing: не main и не ветка открытого PR");
  });
  it("a cycle of dependencies: all on it out, the others in", () => {
    const r = S.plan({ prs: [pr(1, { body: "зависит от #2" }), pr(2, { body: "зависит от #1" }), pr(3)] });
    expect(nums(r.order)).toEqual([3]);
    expect(nums(r.skipped)).toEqual([1, 2]);
    expect(r.skipped[0].reason).toMatch(/^круг зависимостей: #1 → #2|^круг зависимостей: #2 → #1/);
  });
  it("a PR changing .github/workflows and a PR from a fork are left out", () => {
    const r = S.plan({ prs: [pr(1, { files: [".github/workflows/checks.yml", "a.ts"] }), pr(2, { fork: true }), pr(3)] });
    expect(nums(r.order)).toEqual([3]);
    expect(r.skipped.map((s) => s.reason)).toEqual(["меняет .github/workflows — на стенд такие не берутся", "PR из чужого репозитория — на стенд не берётся"]);
  });
});

describe("stand.mergeAll: a conflict is left out with the reason, the stand stays alive", () => {
  it("everything merges: the stand is main + all, in order", () => {
    const r = S.mergeAll({ mainSha: "M", order: [pr(1), pr(2)], merge: fakeMerge() });
    expect(r).toMatchObject({ stand: "M+1+2", skipped: [] });
    expect(nums(r.included)).toEqual([1, 2]);
  });
  it("a conflict with a PR already in: «конфликт с #X, файлы …», the next PRs still go in", () => {
    const r = S.mergeAll({ mainSha: "M", order: [pr(1, { files: ["a.ts", "b.ts"] }), pr(2, { files: ["b.ts", "c.ts"] }), pr(3)], merge: fakeMerge() });
    expect(nums(r.included)).toEqual([1, 3]);
    expect(r.stand).toBe("M+1+3");
    expect(r.skipped).toEqual([{ number: 2, sha: pr(2).sha, reason: "конфликт с #1, файлы b.ts" }]);
  });
  it("a conflict with main itself: «конфликт с main»; a long file list is cut", () => {
    const files = ["a", "b", "c", "d", "e", "f", "g"].map((x) => `${x}.ts`);
    const r = S.mergeAll({ mainSha: "M", order: [pr(4, { files })], merge: fakeMerge(files) });
    expect(r.skipped[0].reason).toBe("конфликт с main, файлы a.ts, b.ts, c.ts, d.ts, e.ts и ещё 2");
  });
  it("a PR depending on one that conflicted is left out too", () => {
    const r = S.mergeAll({ mainSha: "M", order: [pr(1, { files: ["a.ts"] }), pr(2, { files: ["a.ts"] }), pr(3)], deps: { 3: 2 }, merge: fakeMerge() });
    expect(nums(r.included)).toEqual([1]);
    expect(r.skipped.map((s) => [s.number, s.reason])).toEqual([[2, "конфликт с #1, файлы a.ts"], [3, "зависит от #2, он не вошёл"]]);
  });
  it("exclude (the build job's breakers): out with the given reason, and its dependents", () => {
    const r = S.mergeAll({ mainSha: "M", order: [pr(1), pr(2), pr(3)], deps: { 3: 2 }, merge: fakeMerge(), exclude: { 2: "ломает сборку" } });
    expect(nums(r.included)).toEqual([1]);
    expect(r.skipped.map((s) => s.reason)).toEqual(["ломает сборку", "зависит от #2, он не вошёл"]);
  });
});

describe("stand.findBreaker: the PR that breaks the build, by halving the list", () => {
  const list = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => pr(n));
  it("finds the first PR whose prefix does not build, in about log2(n) builds", () => {
    for (const bad of [1, 5, 9]) {
      let calls = 0;
      const builds = (prefix: Pr[]) => { calls++; return !prefix.some((p) => p.number === bad); };
      expect(S.findBreaker(list, builds)?.number).toBe(bad);
      expect(calls).toBeLessThanOrEqual(1 + Math.ceil(Math.log2(list.length)) + 1);
    }
  });
  it("two PRs that break only together: the later one is dropped", () => {
    const builds = (prefix: Pr[]) => !(prefix.some((p) => p.number === 3) && prefix.some((p) => p.number === 7));
    expect(S.findBreaker(list, builds)?.number).toBe(7);
  });
  it("main alone does not build → null (the stand stays as it was)", () => {
    expect(S.findBreaker(list, () => false)).toBeNull();
  });
});

describe("stand.manifest and the pinned task", () => {
  const m = S.manifest({
    mainSha: "1".repeat(40), stand: "2".repeat(40), at: "2026-11-27T23:00:00.000Z",
    included: [pr(3117, { title: "Стенд", body: "## Что\n- **Где смотреть — что увидеть:** Сметы → открыть любую — шапка серая\n" }), pr(3200)],
    skipped: [{ number: 3300, sha: "3".repeat(40), reason: "конфликт с #3117, файлы a.ts" }, { number: 3250, sha: "", reason: "x" }],
  });
  it("the manifest: main's SHA, the PRs in with SHA and «где смотреть», the PRs out with the reason (by number)", () => {
    expect(m.main).toBe("1".repeat(40));
    expect(m.stand).toBe("2".repeat(40));
    expect(m.included).toEqual([
      { number: 3117, sha: pr(3117).sha, title: "Стенд", where: "Сметы → открыть любую — шапка серая" },
      { number: 3200, sha: pr(3200).sha, title: "PR 3200", where: "" },
    ]);
    expect(nums(m.skipped)).toEqual([3250, 3300]);
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
  });
  it("«где смотреть» is read in its usual spellings", () => {
    expect(S.whereLine("Где смотреть: Клиенты")).toBe("Клиенты");
    expect(S.whereLine("> где смотреть - что увидеть — Лиды, красный кружок")).toBe("Лиды, красный кружок");
    expect(S.whereLine("ничего")).toBe("");
  });
  it("the body: the link, SHAs, in with «где смотреть — что увидеть», out with the reason", () => {
    const b = S.renderIssue(m, "https://octodex--stand.expo.app");
    expect(b).toContain("**Стенд:** https://octodex--stand.expo.app");
    expect(b).toContain("main `1111111` · стенд `2222222`");
    expect(b).toContain("На стенде входить только в демо или в тестовый проект"); // review of #3125 п.9
    expect(b).toContain("### Вошли (2)");
    expect(b).toContain("- #3117 `aaaaaaa` Стенд\n  - где смотреть — что увидеть: Сметы → открыть любую — шапка серая");
    expect(b).toContain("(в описании PR нет такой строки)");
    expect(b).toContain("### Не вошли (2)");
    expect(b).toContain("- #3300 `3333333` — конфликт с #3117, файлы a.ts");
  });
});

describe("stand: the real git merges (merge-tree, commit-tree) on a throw-away repository", () => {
  const dir = mkdtempSync(join(tmpdir(), "stand-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();
  const commit = (files: Record<string, string>, msg: string) => { for (const [f, c] of Object.entries(files)) writeFileSync(join(dir, f), c); git("add", "-A"); git("commit", "-q", "-m", msg); return git("rev-parse", "HEAD"); };

  it("a conflict is reported with its file; a clean PR merges; the same input gives the same SHA twice", () => {
    git("init", "-q", "-b", "main");
    const main = commit({ "a.ts": "a\n", "b.ts": "b\n" }, "main");
    git("checkout", "-q", "-b", "p1"); const h1 = commit({ "a.ts": "a1\n" }, "p1");
    git("checkout", "-q", "main"); git("checkout", "-q", "-b", "p2"); const h2 = commit({ "a.ts": "a2\n" }, "p2");
    git("checkout", "-q", "main"); git("checkout", "-q", "-b", "p3"); const h3 = commit({ "c.ts": "c\n" }, "p3");
    git("checkout", "-q", "main");
    // the script's own merge (merge-tree --name-only, commit-tree with a fixed date)
    const merge = S.gitMerger(dir, "2026-11-27T00:00:00Z");
    const order = [pr(1, { sha: h1, files: ["a.ts"] }), pr(2, { sha: h2, files: ["a.ts"] }), pr(3, { sha: h3, files: ["c.ts"] })];
    const r = S.mergeAll({ mainSha: main, order, merge });
    expect(nums(r.included)).toEqual([1, 3]);
    expect(r.skipped).toEqual([{ number: 2, sha: h2, reason: "конфликт с #1, файлы a.ts" }]);
    expect(git("show", `${r.stand}:a.ts`)).toBe("a1");
    expect(git("show", `${r.stand}:c.ts`)).toBe("c");
    expect(S.mergeAll({ mainSha: main, order, merge }).stand).toBe(r.stand);
    // a PR that changes .github/workflows is left out by the merged tree itself, whatever the API's file list said
    git("checkout", "-q", "-b", "p4", main);
    execFileSync("mkdir", ["-p", join(dir, ".github/workflows")]);
    const h4 = commit({ ".github/workflows/x.yml": "on: push\n" }, "p4");
    git("checkout", "-q", "main");
    const r4 = S.mergeAll({ mainSha: main, order: [pr(4, { sha: h4, files: [] }), pr(5, { sha: h3, files: ["c.ts"] })], merge });
    expect(nums(r4.included)).toEqual([5]);
    expect(r4.skipped).toEqual([{ number: 4, sha: h4, reason: "меняет .github/workflows (.github/workflows/x.yml) — на стенд такие не берутся" }]);
    // a merge commit has both parents: main's history and the PR's
    expect(git("rev-list", "--parents", "-n", "1", r.stand).split(" ")).toHaveLength(3);
  });
});

describe("stand: text from a PR is inert in the task body (review of #3125 п.3)", () => {
  const evil = "@user [x](http://e) <!-- `code` **b** _i_ # h | t \\ ~s~ !";
  it("Markdown and HTML marks escaped, «@» broken, one line", () => {
    const t = S.md(`${evil}\nвторая строка`);
    expect(t).not.toMatch(/(^|[^\\])[[\]()<>`*_#|~!]/);
    expect(t).not.toMatch(/@(?!\u200b)/);
    expect(t).not.toContain("\n");
    expect(t).toContain("\\[x\\]\\(http://e\\)");
    expect(t).toContain("\\<\\!--");
  });
  it("a field is cut to 200 characters, the body to the limit", () => {
    expect(S.md("я".repeat(500)).length).toBeLessThanOrEqual(S.FIELD_MAX);
    const many = Array.from({ length: 900 }, (_, i) => ({ number: i + 1, sha: "", reason: "x".repeat(300) }));
    const b = S.renderIssue(S.manifest({ mainSha: "1".repeat(40), stand: "2".repeat(40), included: [], skipped: many }), "");
    expect(b.length).toBeLessThanOrEqual(S.BODY_MAX + 20);
  });
  it("a file or branch name from a PR is escaped inside our reasons; our «#N» stays a link", () => {
    const r = S.mergeAll({ mainSha: "M", order: [pr(1, { files: ["[x](http://e).ts"] }), pr(2, { files: ["[x](http://e).ts"] })], merge: fakeMerge() });
    expect(r.skipped[0].reason).toBe("конфликт с #1, файлы \\[x\\]\\(http://e\\).ts");
    expect(S.plan({ prs: [pr(3, { baseRef: "@user/[x]" })] }).skipped[0].reason).toContain("@\u200buser/\\[x\\]");
  });
  it("the body: the title and «где смотреть» from a PR come through escaped; a strange link or SHA is not shown", () => {
    const m = S.manifest({ mainSha: "1".repeat(40), stand: "2".repeat(40), included: [pr(5, { title: evil, body: `Где смотреть: ${evil}` })],
      skipped: [{ number: 6, sha: "x](http://e)", reason: "конфликт с #5" }] });
    const b = S.renderIssue(m, "https://e.com/<script>");
    expect(b).not.toContain("[x](http://e)");
    expect(b).not.toContain("<!-- `code`");
    expect(b).not.toMatch(/@user/);
    expect(b).toContain("**Стенд:** —");
    expect(b).toContain("- #6 — ");
  });
});

describe("stand: the push token stays out of the arguments (review of #3125 п.7)", () => {
  const [argv, env] = S.pushArgv("a".repeat(40), "ghs_SECRET", { PATH: "/bin" });
  it("arguments: only push --force origin <sha>:refs/heads/stand/auto", () => {
    expect(argv).toEqual(["push", "--force", "origin", `${"a".repeat(40)}:refs/heads/stand/auto`]);
    expect(argv.join(" ")).not.toMatch(/SECRET|extraheader|basic/);
  });
  it("the token in GIT_CONFIG_*, only for github.com, the base environment kept", () => {
    expect(env).toMatchObject({ PATH: "/bin", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader" });
    expect(Buffer.from(env.GIT_CONFIG_VALUE_0.replace("AUTHORIZATION: basic ", ""), "base64").toString()).toBe("x-access-token:ghs_SECRET");
  });
  it("the CLI pushes through pushArgv and prints the error without the command line", () => {
    const src = readFileSync(join(__dirname, "../../../scripts/stand.cjs"), "utf8");
    expect(src).toContain("pushArgv(r.stand, env.GH_TOKEN, process.env)");
    expect(src).not.toMatch(/"-c", `http\.extraheader/);
    expect(src).toContain('replace(/basic [A-Za-z0-9+/=]+/g, "basic ***")');
  });
});

describe("stand: the code of the PRs is built only inside a throw-away container (security review of #3125 п.1)", () => {
  const [cmd, argv] = S.buildArgv({ wt: "/tmp/wt", cmd: "npm ci", subject: "Merge pull request #1", uid: 1001, gid: 118 });
  it("docker run --rm, only the worktree mounted, the runner's user, no variable but HOME and SUBJECT", () => {
    expect(cmd).toBe("docker");
    expect(argv.slice(0, 2)).toEqual(["run", "--rm"]);
    expect(argv).toContain("/tmp/wt:/w");
    expect(argv.filter((a) => a === "-v")).toHaveLength(1);
    expect(argv[argv.indexOf("--user") + 1]).toBe("1001:118");
    const vars = argv.flatMap((a, i) => (argv[i - 1] === "-e" ? [a.split("=")[0]] : []));
    expect(vars).toEqual(["HOME", "SUBJECT"]);
    expect(argv).not.toContain("--privileged");
    expect(argv.join(" ")).not.toMatch(/docker\.sock|--network[= ]host|--pid|ACTIONS_|GITHUB_TOKEN/);
    expect(argv.slice(-4)).toEqual([S.BUILD_IMAGE, "bash", "-c", "npm ci"]);
    // the image is pinned by digest, never a moving tag alone (rule 17)
    expect(S.BUILD_IMAGE).toMatch(/^node:22-bookworm@sha256:[0-9a-f]{64}$/);
  });
  it("the CLI builds every candidate through buildArgv and passes the container no environment of the runner", () => {
    const src = readFileSync(join(__dirname, "../../../scripts/stand.cjs"), "utf8");
    const build = src.slice(src.indexOf('} else if (cmd === "build")'), src.indexOf('} else if (cmd === "issue")'));
    expect(build).toContain("buildArgv({ wt,");
    expect(build).toContain("env: { PATH: process.env.PATH, HOME: process.env.HOME }");
    expect(build).not.toMatch(/run\("bash"/);
  });
});

describe("stand.yml «should»: a workflow_run counts by its file and repository, not by its name (review of #3125 п.2)", () => {
  const yml = readFileSync(join(__dirname, "../../../.github/workflows/stand.yml"), "utf8");
  const should = yml.slice(yml.indexOf("\n  should:"), yml.indexOf("\n  merge:"));
  const script = should.slice(should.indexOf("run: |") + 7).split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n");
  const dir = mkdtempSync(join(tmpdir(), "stand-should-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  // a fake gh: the PR has the label «стенд»
  writeFileSync(join(dir, "gh"), "#!/bin/bash\necho стенд\n", { mode: 0o755 });
  const go = (e: Record<string, string>) => {
    const out = join(dir, "out");
    writeFileSync(out, "");
    execFileSync("bash", ["-c", script], { env: { ...process.env, EVENT: "", REF: "", WF_PATH: "", HEAD_REPO: "", PATH: `${dir}:${process.env.PATH}`, GITHUB_OUTPUT: out, GITHUB_REPOSITORY: "o/r", REPO: "o/r", ...e } });
    return readFileSync(out, "utf8").trim();
  };
  const run = { EVENT: "workflow_run", WF_EVENT: "pull_request", WF_CONCLUSION: "success", HEAD_REPO: "o/r", PR: "7" };
  it("the stand trigger and a Preview of a labelled PR of this repository: go", () => {
    expect(go({ ...run, WF_PATH: ".github/workflows/stand-trigger.yml" })).toBe("go=true");
    expect(go({ ...run, WF_PATH: ".github/workflows/preview.yml" })).toBe("go=true");
  });
  it("a run from a fork, even of the same file: no", () => {
    expect(go({ ...run, WF_PATH: ".github/workflows/stand-trigger.yml", HEAD_REPO: "fork/r" })).toBe("go=false");
  });
  it("another file of the same name «Stand trigger» / «Preview»: no", () => {
    expect(go({ ...run, WF_PATH: ".github/workflows/evil.yml" })).toBe("go=false");
  });
  it("a cancelled or skipped run: no; push to main and a run by hand from main: go", () => {
    expect(go({ ...run, WF_PATH: ".github/workflows/stand-trigger.yml", WF_CONCLUSION: "skipped" })).toBe("go=false");
    expect(go({ EVENT: "push", REF: "refs/heads/main" })).toBe("go=true");
    expect(go({ EVENT: "workflow_dispatch", REF: "refs/heads/other" })).toBe("go=false");
  });
  it("reads the file and the repository of the run, as preview-deploy.yml does", () => {
    expect(should).toContain("WF_PATH: ${{ github.event.workflow_run.path }}");
    expect(should).toContain("HEAD_REPO: ${{ github.event.workflow_run.head_repository.full_name }}");
    expect(should).not.toContain("workflow_run.name");
  });
});

describe("stand.yml: who writes, where the code of the PRs runs, where the key is", () => {
  const wf = (f: string) => readFileSync(join(__dirname, "../../../.github/workflows", f), "utf8");
  const s = wf("stand.yml");
  const job = (name: string) => {
    const m = s.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z0-9-]+:\\n|(?![\\s\\S]))`, "m"));
    if (!m) throw new Error(`job ${name} not found`);
    return m[1];
  };
  it("starts from main only: after Preview / Stand trigger, a push to main, by hand; never on pull_request; one group, older runs cancelled", () => {
    expect(s).toMatch(/workflow_run:\n\s+workflows: \[Preview, Stand trigger\]\n\s+types: \[completed\]/);
    expect(s).toMatch(/push:\n\s+branches: \[main\]/);
    expect(s).toContain("workflow_dispatch:");
    expect(s).not.toMatch(/^ {2}pull_request/m);
    expect(s).toMatch(/concurrency:\n\s+group: stand\n\s+cancel-in-progress: true/);
  });
  it("the trigger takes only the label «стенд» (put on / off) or closing such a PR, and runs nothing of the PR", () => {
    const t = wf("stand-trigger.yml");
    expect(t).toMatch(/types: \[labeled, unlabeled, closed\]/);
    expect(t).toContain("github.event.label.name == 'стенд'");
    expect(t).toContain("contains(github.event.pull_request.labels.*.name, 'стенд')");
    expect(t).not.toMatch(/actions\/checkout|secrets\.|npm /);
    expect(t).toMatch(/^permissions: \{\}$/m);
  });
  it("merge: the only job that writes stand/auto (contents: write), no npm, the script from main", () => {
    const m = job("merge");
    expect(m).toMatch(/contents: write/);
    expect(m).toContain("ref: main");
    expect(m).toContain("node scripts/stand.cjs merge --out manifest.json --push");
    expect(m).not.toMatch(/npm |setup-node|secrets\./);
    expect(job("merge-again")).toContain("--expect \"$BUILT\"");
    expect(job("merge-again")).not.toMatch(/npm |setup-node|secrets\./);
    for (const j of ["should", "build", "deploy"]) expect(job(j), j).not.toMatch(/contents: write/);
  });
  it("build: read-only, no key, no cache — the only job running code of the PRs", () => {
    const b = job("build");
    expect(b).toMatch(/permissions:\n\s+contents: read\n/);
    expect(b).not.toMatch(/secrets\.|environment:|cache:|actions\/cache/);
    expect(b).toContain(`node scripts/stand.cjs build --manifest "$RUNNER_TEMP/trusted/manifest.json"`);
  });
  it("every artifact is downloaded under runner.temp (trusted / untrusted), never next to scripts/ (review of #3125 п.5)", () => {
    const downloads = s.split("uses: actions/download-artifact@v4").slice(1).map((d) => d.split("\n      - ")[0]);
    expect(downloads.length).toBeGreaterThanOrEqual(6);
    for (const d of downloads) expect(d, d).toMatch(/path: \$\{\{ runner\.temp \}\}\/(trusted|untrusted)/);
    // what the build job made is untrusted; the dist goes next to the app only after its checks
    for (const d of downloads.filter((x) => /name: stand-(build|dist)/.test(x))) expect(d).toMatch(/\/untrusted/);
    expect(job("deploy")).toMatch(/find dist -type l[\s\S]*cp -R dist\/\. "\$GITHUB_WORKSPACE\/apps\/mobile\/dist\/"/);
  });
  it("deploy decides from the write jobs what goes online; the build job's stand must equal it (review of #3125 п.4)", () => {
    const d = job("deploy");
    expect(d).toContain("CHANGED: ${{ needs.merge-again.result == 'success' }}");
    expect(d).toContain("STAND: ${{ needs.merge-again.result == 'success' && needs.merge-again.outputs.stand || needs.merge.outputs.stand }}");
    expect(d).not.toContain("needs.build.outputs.changed");
    expect(d).toContain('[ "$BUILT" = "$STAND" ] || { echo "::error::the build job built');
    expect(d).toMatch(/require\(process\.argv\[1\]\)\.stand' "\$f"\)" = "\$STAND"/);
    expect(job("merge-again")).toContain("stand: ${{ steps.again.outputs.stand }}");
    expect(job("merge")).toContain("stand: ${{ steps.merge.outputs.stand }}");
  });
  it("deploy never runs in a cancelled run — an old build must not go online (review of #3125 п.6)", () => {
    const d = job("deploy");
    expect(d).toContain("if: ${{ !cancelled() && needs.build.result == 'success' && (needs.merge-again.result == 'success' || needs.merge-again.result == 'skipped') }}");
    expect(s).not.toMatch(/always\(\)/);
  });
  it("deploy: the environment preview-web, static files checked as in the preview, the alias stand, the pinned task", () => {
    const d = job("deploy");
    expect(d).toMatch(/environment: preview-web/);
    for (const c of ["dist/index.html", "dist/server", "find dist -type l"]) expect(d).toContain(c);
    expect(d).toContain("npx eas-cli@27.4.1 deploy --non-interactive --alias stand");
    expect(d).toContain("node scripts/stand.cjs issue --manifest");
    // the manifest of a write job, never the build job's
    expect(d).not.toContain("name: stand-build");
  });
});
