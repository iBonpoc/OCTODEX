/** #1060: the runner's network (apt mirror, DNS) fails now and then — every apt / Playwright-deps step retries instead of failing the PR. */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repo = join(__dirname, "../../..");
const retry = join(repo, "scripts/retry.sh");

/** a command that fails `failures` times, then succeeds; the counter lives in a file */
function flaky(failures: number) {
  const dir = mkdtempSync(join(tmpdir(), "retry-"));
  const counter = join(dir, "n");
  writeFileSync(counter, "0");
  const script = join(dir, "cmd.sh");
  writeFileSync(script, `#!/usr/bin/env bash\nn=$(( $(cat ${counter}) + 1 )); echo $n > ${counter}\n[ $n -gt ${failures} ]\n`);
  return { script, count: () => Number(readFileSync(counter, "utf8")) };
}
const run = (cmd: string[]) => spawnSync("bash", [retry, "test step", "bash", ...cmd], { env: { ...process.env, RETRY_DELAYS: "0 0 0" }, encoding: "utf8" });

describe("scripts/retry.sh", () => {
  it("succeeds at once when the command works", () => {
    const f = flaky(0);
    expect(run([f.script]).status).toBe(0);
    expect(f.count()).toBe(1);
  });
  it("retries a command that fails twice and then passes", () => {
    const f = flaky(2);
    const r = run([f.script]);
    expect(r.status).toBe(0);
    expect(f.count()).toBe(3);
    expect(r.stdout).toContain("attempt 1 failed");
  });
  it("gives up after 4 attempts with the plain note and the command's exit code", () => {
    const f = flaky(99);
    const r = run([f.script]);
    expect(r.status).toBe(1);
    expect(f.count()).toBe(4);
    expect(r.stdout).toMatch(/::error::test step: failed 4 times/);
    expect(r.stdout).toMatch(/runner's network/);
  });
});

describe("scripts/aptRetries.sh: the runner's apt avoids the azure mirror", () => {
  const apt = join(repo, "scripts/aptRetries.sh");
  function setup() {
    const dir = mkdtempSync(join(tmpdir(), "apt-"));
    mkdirSync(join(dir, "sources.list.d"));
    mkdirSync(join(dir, "conf"));
    // the runner image: the azure mirror first, the plain archive after it — after the rewrite the two lines are one
    writeFileSync(join(dir, "apt-mirrors.txt"), "http://azure.archive.ubuntu.com/ubuntu/ priority:1\nhttp://archive.ubuntu.com/ubuntu/ priority:1\n");
    writeFileSync(join(dir, "sources.list.d", "ubuntu.sources"), "Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu/\nSuites: noble\n");
    writeFileSync(join(dir, "sources.list.d", "mirror.sources"), "Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble\n");
    const env = { ...process.env, APT_SUDO: "", APT_MIRRORS_FILE: join(dir, "apt-mirrors.txt"), APT_SOURCES_DIR: join(dir, "sources.list.d"), APT_LEGACY_LIST: join(dir, "no-such.list"), APT_CONF_DIR: join(dir, "conf") };
    return { dir, env, run: () => spawnSync("bash", [apt], { env, encoding: "utf8" }) };
  }
  it("rewrites the mirror list: no azure left, archive.ubuntu.com is there once", () => {
    const t = setup();
    expect(t.run().status).toBe(0);
    const list = readFileSync(join(t.dir, "apt-mirrors.txt"), "utf8");
    expect(list).not.toContain("azure");
    expect(list.split("\n").filter((l) => l.includes("archive.ubuntu.com/ubuntu/")).length).toBe(1); // no duplicates
  });
  it("adds archive.ubuntu.com as the fallback when the list had only other mirrors", () => {
    const t = setup();
    writeFileSync(join(t.dir, "apt-mirrors.txt"), "http://mirror.example.com/ubuntu/ priority:1\n");
    expect(t.run().status).toBe(0);
    expect(readFileSync(join(t.dir, "apt-mirrors.txt"), "utf8")).toContain("http://archive.ubuntu.com/ubuntu/ priority:2");
  });
  it("rewrites a source that names the azure mirror directly, and leaves the others alone", () => {
    const t = setup();
    t.run();
    expect(readFileSync(join(t.dir, "sources.list.d", "ubuntu.sources"), "utf8")).toContain("URIs: http://archive.ubuntu.com/ubuntu/");
    expect(readFileSync(join(t.dir, "sources.list.d", "mirror.sources"), "utf8")).toContain("mirror+file:/etc/apt/apt-mirrors.txt");
  });
  it("writes apt's retries and timeouts, and is idempotent", () => {
    const t = setup();
    t.run();
    const once = readFileSync(join(t.dir, "apt-mirrors.txt"), "utf8");
    t.run();
    expect(readFileSync(join(t.dir, "apt-mirrors.txt"), "utf8")).toBe(once);
    const conf = readFileSync(join(t.dir, "conf", "80-retries"), "utf8");
    expect(conf).toContain('Acquire::Retries "3"');
    expect(conf).toContain("Acquire::http::Timeout");
  });
  it("does not fail on a runner without the mirror list", () => {
    const t = setup();
    t.env.APT_MIRRORS_FILE = join(t.dir, "absent.txt");
    expect(spawnSync("bash", [apt], { env: t.env, encoding: "utf8" }).status).toBe(0);
    expect(existsSync(join(t.dir, "absent.txt"))).toBe(false);
  });
});

describe("workflows: every apt / Playwright-deps call is wrapped", () => {
  const dir = join(repo, ".github/workflows");
  const lines = readdirSync(dir)
    .filter((f) => f.endsWith(".yml"))
    .flatMap((f) => readFileSync(join(dir, f), "utf8").split("\n").map((l, i) => ({ f, n: i + 1, l })))
    .filter(({ l }) => !/^\s*#/.test(l));
  it("no bare apt-get install or `playwright install --with-deps` outside scripts/retry.sh", () => {
    const bare = lines.filter(({ l }) => /apt-get install|playwright install --with-deps/.test(l) && !/retry\.sh/.test(l)).map(({ f, n, l }) => `${f}:${n} ${l.trim().slice(0, 90)}`);
    expect(bare, `wrap it: bash scripts/retry.sh "<what>" bash -c '<command>' (and scripts/aptRetries.sh once before):\n${bare.join("\n")}`).toEqual([]);
  });
  it("the steps that wrap them also set apt's own retries first", () => {
    const wrapped = lines.filter(({ l }) => /retry\.sh/.test(l) && /apt-get|playwright/.test(l));
    expect(wrapped.length).toBeGreaterThanOrEqual(4);
    for (const w of wrapped) {
      const before = lines.filter((x) => x.f === w.f && x.n < w.n && x.n >= w.n - 3).map((x) => x.l).join("\n");
      expect(before, `${w.f}:${w.n}`).toContain("aptRetries.sh");
    }
  });
});
