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

/** a stub runner dir: `initdb`/`postgres` of a fake PostgreSQL, a fake apt that logs its calls and may fail */
function toolbox(opts: { pg: boolean; faketime: boolean; aptWorks: boolean; fpr?: string; dpkgWorks?: boolean }) {
  const dir = mkdtempSync(join(tmpdir(), "dbtools-"));
  const bin = join(dir, "pgbin");
  const libroot = join(dir, "lib");
  mkdirSync(bin);
  mkdirSync(join(libroot, "x86_64-linux-gnu", "faketime"), { recursive: true });
  if (opts.pg) {
    writeFileSync(join(bin, "initdb"), "#!/usr/bin/env bash\n");
    writeFileSync(join(bin, "postgres"), "#!/usr/bin/env bash\necho 'postgres (PostgreSQL) 17.4'\n");
    for (const f of ["initdb", "postgres"]) spawnSync("chmod", ["+x", join(bin, f)]);
  }
  const ext = join(dir, "ext");
  mkdirSync(ext);
  writeFileSync(join(ext, "pgcrypto.control"), "# pgcrypto\n");
  if (opts.faketime) writeFileSync(join(libroot, "x86_64-linux-gnu", "faketime", "libfaketime.so.1"), "");
  const calls = join(dir, "calls.log");
  // the stub apt, when it works, downloads PostgreSQL 17's package into the cache dir it is given (--download-only); the stub
  // dpkg «installs» what is there the way the package does: the binaries appear
  const debs = join(dir, "pg17-debs");
  const installPg = `if [[ "$*" == *postgresql-17* && "$*" == *--download-only* ]]; then touch ${debs}/postgresql-17_17.4-1_amd64.deb ${debs}/libllvm19_1_amd64.deb; fi`;
  const dpkg = join(dir, "dpkg.sh");
  // a file «dpkg-fail-once» makes the next dpkg fail once (a cache that no longer fits the image)
  writeFileSync(dpkg, `#!/usr/bin/env bash\necho "dpkg $*" >> ${join(dir, "calls.log")}\nif [ -f ${join(dir, "dpkg-fail-once")} ]; then rm ${join(dir, "dpkg-fail-once")}; exit 1; fi\n${opts.dpkgWorks === false ? "exit 1" : `ls ${debs}/postgresql-17_*.deb >/dev/null 2>&1 || exit 1\nprintf '#!/usr/bin/env bash\\n' > ${bin}/initdb; printf "#!/usr/bin/env bash\\necho 'postgres (PostgreSQL) 17.4'\\n" > ${bin}/postgres; chmod +x ${bin}/initdb ${bin}/postgres`}\n`);
  const installFt = `if [[ "$*" == *faketime* ]]; then touch ${join(libroot, "x86_64-linux-gnu", "faketime", "libfaketime.so.1")}; fi`;
  writeFileSync(join(dir, "apt.sh"), `#!/usr/bin/env bash\necho "apt $*" >> ${calls}\n${opts.aptWorks ? installPg + "\n" + installFt + "\nexit 0" : "exit 100"}\n`);
  const src = join(dir, "libfaketime");
  const SHA = "d475b925943ad404c6c728ac868dc73949e7281c";
  const ghEnv = join(dir, "github_env");
  writeFileSync(ghEnv, "");
  const env: NodeJS.ProcessEnv = {
    ...process.env, RETRY_DELAYS: "0 0", HOME: dir,
    DBTOOLS_PGBIN: bin, DBTOOLS_LIBROOT: libroot, DBTOOLS_PGEXT: ext,
    DBTOOLS_PG_DEBS: debs, DBTOOLS_DPKG_INSTALL: `bash ${dpkg}`,
    // the PGDG key and list: a stub that logs; the fingerprint the key «shows» (the real one unless the test says otherwise)
    DBTOOLS_PGDG_SETUP: `echo pgdg-setup >> ${join(dir, "calls.log")}`,
    DBTOOLS_PGDG_FPR_CMD: `echo fpr:::::::::${opts.fpr ?? "B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8"}:`,
    DBTOOLS_APT_UPDATE: `bash ${join(dir, "apt.sh")} update`, DBTOOLS_APT_INSTALL: `bash ${join(dir, "apt.sh")} install`,
    DBTOOLS_FAKETIME_SRC: src, GITHUB_ENV: ghEnv, DBTOOLS_INSTALL_DIR: join(dir, "usr-local-faketime"), DBTOOLS_SUDO: "",
    // «git clone» and «make» are stubs that leave what the real ones leave
    DBTOOLS_CLONE: `mkdir -p ${src}/src && echo ${SHA} > ${src}/.sha && echo clone >> ${calls}`,
    DBTOOLS_SHA_CMD: `cat ${src}/.sha`,
    DBTOOLS_BUILD: `touch ${src}/src/libfaketime.so.1 && echo make >> ${calls}`,
  };
  const run = (...args: string[]) => spawnSync("bash", [join(repo, "scripts/dbTools.sh"), ...args], { env, encoding: "utf8" });
  return { dir, env, run, calls: () => (existsSync(calls) ? readFileSync(calls, "utf8") : ""), ghEnv: () => readFileSync(ghEnv, "utf8"), src, SHA, bin, debs };
}

describe("scripts/dbTools.sh: the database tools without Ubuntu's mirrors", () => {
  it("PostgreSQL and libfaketime already there: apt is not called, the choice is printed", () => {
    const t = toolbox({ pg: true, faketime: true, aptWorks: false });
    const r = t.run();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("postgresql-17: already there (postgres (PostgreSQL) 17.4)");
    expect(r.stdout).toContain("faketime: system package");
    expect(t.calls()).toBe("");
  });
  it("no PostgreSQL 17 on the image (#806): the PGDG repository, its key checked, apt downloads into the cache, dpkg installs", () => {
    const t = toolbox({ pg: false, faketime: true, aptWorks: true });
    const r = t.run("postgres");
    expect(r.status).toBe(0);
    expect(t.calls()).toMatch(/pgdg-setup[\s\S]*apt update[\s\S]*apt install --no-install-recommends --download-only -o Dir::Cache::archives=\S*pg17-debs postgresql-17[\s\S]*dpkg/);
    expect(r.stdout).toContain("installed from PGDG");
    expect(r.stdout).toContain("dbtools: checked — postgres (PostgreSQL) 17.4, pgcrypto present");
  });
  it("the next run (the cache restored, a fresh image): installed from the cached packages — no PGDG, no apt, no mirror", () => {
    const t = toolbox({ pg: false, faketime: true, aptWorks: true });
    t.run("postgres");
    spawnSync("rm", ["-f", join(t.bin, "initdb"), join(t.bin, "postgres")]);
    writeFileSync(join(t.dir, "calls.log"), "");
    const r = t.run("postgres");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("from the cached packages");
    expect(t.calls()).not.toMatch(/apt|pgdg-setup/);
  });
  it("a cache that no longer fits the image (dpkg refuses): a warning, then the PGDG and apt path", () => {
    const t = toolbox({ pg: false, faketime: true, aptWorks: true });
    mkdirSync(t.debs, { recursive: true });
    writeFileSync(join(t.debs, "postgresql-17_17.0-1_amd64.deb"), "");
    // the first dpkg (the old cache) fails, the one after the fresh download works
    writeFileSync(join(t.dir, "dpkg-fail-once"), "");
    const r = t.run("postgres");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("::warning::dbtools: the cached packages of PostgreSQL 17 did not install");
    expect(r.stdout).toContain("installed from PGDG");
  });
  it("the PGDG key with another fingerprint: not trusted — nothing installed (rule 17)", () => {
    const t = toolbox({ pg: false, faketime: true, aptWorks: true, fpr: "0".repeat(40) });
    const r = t.run("postgres");
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/PGDG signing key is not B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8/);
    expect(t.calls()).not.toMatch(/apt install/);
  });
  it("no PostgreSQL and apt does not work: the job fails with the plain note (there is no other way)", () => {
    const t = toolbox({ pg: false, faketime: true, aptWorks: false });
    const r = t.run("postgres");
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/runner's network/);
  });
  it("faketime: apt works → the package is used and nothing is built", () => {
    const t = toolbox({ pg: true, faketime: false, aptWorks: true });
    const r = t.run("faketime");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("faketime: installed by apt");
    expect(t.calls()).toMatch(/apt update[\s\S]*apt install/);
    expect(t.calls()).not.toMatch(/clone|make/);
    expect(t.ghEnv()).toBe("");
  });
  it("an unknown tool name fails (a typo must not pass without the tool)", () => {
    const t = toolbox({ pg: true, faketime: true, aptWorks: false });
    const r = t.run("faketim");
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain("::error::");
  });
  it("faketime: apt does not work → built from the source, the commit is checked, FAKETIME_LIB goes to GITHUB_ENV", () => {
    const t = toolbox({ pg: true, faketime: false, aptWorks: false });
    const r = t.run("faketime");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("apt did not work — from the source (libfaketime v0.9.10)");
    expect(r.stdout).toContain("built from the source, commit d475b92");
    expect(t.calls()).toMatch(/clone[\s\S]*make/);
    // the library is copied where the user «postgres» can read it — never under $HOME (/home/runner is closed to other users)
    const dest = join(t.dir, "usr-local-faketime", "libfaketime.so.1");
    expect(existsSync(dest)).toBe(true);
    expect(t.ghEnv()).toContain(`FAKETIME_LIB=${dest}`);
    expect(t.ghEnv()).not.toContain(`FAKETIME_LIB=${t.src}`);
    // apt was tried ONCE (not four times): a dead mirror must not eat minutes — and it is a warning, not an error, for it has a fallback
    expect((t.calls().match(/apt update/g) ?? []).length).toBe(1);
    expect(r.stdout).toContain("::warning::apt: faketime (one quick try)");
    expect(r.stdout).not.toContain("::error::");
  });
  it("faketime: a source built earlier (the cache) is used without cloning again", () => {
    const t = toolbox({ pg: true, faketime: false, aptWorks: false });
    t.run("faketime");
    writeFileSync(join(t.dir, "calls.log"), "");
    const again = t.run("faketime");
    expect(again.status).toBe(0);
    expect(again.stdout).toContain("built earlier (cache)");
    expect(t.calls()).not.toMatch(/clone|make/);
  });
  it("the real defaults: install dir outside $HOME, fetched by the pinned commit, cache key carries the full sha", () => {
    const sh = readFileSync(join(repo, "scripts/dbTools.sh"), "utf8");
    expect(sh).toContain('INSTALL_DIR="${DBTOOLS_INSTALL_DIR:-/usr/local/lib/faketime}"');
    expect(sh).toMatch(/fetch -q --depth 1 \$URL \$SHA/);
    const wf = readFileSync(join(repo, ".github/workflows/checks.yml"), "utf8");
    expect(wf).toContain(`libfaketime-v0.9.10-\${{ runner.os }}-\${{ runner.arch }}-d475b925943ad404c6c728ac868dc73949e7281c`);
  });
  it("faketime: the tag now points at another commit → not built (rule 17)", () => {
    const t = toolbox({ pg: true, faketime: false, aptWorks: false });
    t.env.DBTOOLS_CLONE = `mkdir -p ${t.src}/src && echo ${"0".repeat(40)} > ${t.src}/.sha`;
    const r = spawnSync("bash", [join(repo, "scripts/dbTools.sh"), "faketime"], { env: t.env, encoding: "utf8" });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/not the pinned d475b925943ad404c6c728ac868dc73949e7281c/);
    expect(t.ghEnv()).toBe("");
  });
});

describe("scripts/dbTools.sh: the first check of the job", () => {
  it("PostgreSQL 17.x (the live database's version, #806) with pgcrypto: «checked» is printed", () => {
    const t = toolbox({ pg: true, faketime: true, aptWorks: false });
    expect(t.run("postgres").stdout).toContain("dbtools: checked — postgres (PostgreSQL) 17.4, pgcrypto present");
  });
  it("another major version (the image's 16) fails with a plain note", () => {
    const t = toolbox({ pg: true, faketime: true, aptWorks: false });
    writeFileSync(join(t.dir, "pgbin", "postgres"), "#!/usr/bin/env bash\necho 'postgres (PostgreSQL) 16.4'\n");
    const r = t.run("postgres");
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/need PostgreSQL 17\.x[\s\S]*ubuntu-24\.04/);
  });
  it("the real defaults: 17 from PGDG by the pinned key fingerprint, the cache dir is the one checks.yml keeps", () => {
    const sh = readFileSync(join(repo, "scripts/dbTools.sh"), "utf8");
    expect(sh).toContain("PG_MAJOR=17");
    expect(sh).toContain('PGDG_FPR="B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8"');
    expect(sh).toContain("https://apt.postgresql.org/pub/repos/apt noble-pgdg main");
    expect(sh).toContain('PG_DEBS="${DBTOOLS_PG_DEBS:-${HOME}/pg$PG_MAJOR-debs}"');
    const wf = readFileSync(join(repo, ".github/workflows/checks.yml"), "utf8");
    expect(wf).toMatch(/path: ~\/pg17-debs/);
    expect(readFileSync(join(repo, "supabase/tests/run.sh"), "utf8")).toContain('PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"');
  });
  it("no pgcrypto extension fails with a plain note", () => {
    const t = toolbox({ pg: true, faketime: true, aptWorks: false });
    spawnSync("rm", [join(t.dir, "ext", "pgcrypto.control")]);
    const r = t.run("postgres");
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/no pgcrypto extension/);
  });
});

describe("scripts/playwrightInstall.sh: Chromium without apt when apt is down", () => {
  function pw(depsWork: boolean, launches = true) {
    const dir = mkdtempSync(join(tmpdir(), "pw-"));
    const log = join(dir, "log");
    const stub = join(dir, "pw.sh");
    writeFileSync(stub, `#!/usr/bin/env bash\necho "$*" >> ${log}\nif [[ "$*" == *--with-deps* ]]; then ${depsWork ? "exit 0" : "exit 100"}; fi\nexit 0\n`);
    const r = spawnSync("bash", [join(repo, "scripts/playwrightInstall.sh")], { env: { ...process.env, PW_INSTALL: `bash ${stub}`, RETRY_DELAYS: "0 0", PW_VERSION_CMD: "echo Version 1.x", PW_LAUNCH: launches ? "echo chromium launches" : "exit 1" }, encoding: "utf8" });
    return { r, log: readFileSync(log, "utf8") };
  }
  it("with dependencies when apt works (one call)", () => {
    const { r, log } = pw(true);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("chromium with system dependencies");
    expect(log.trim().split("\n")).toEqual(["--with-deps chromium"]);
  });
  it("Chromium that is installed but does not start fails with a plain note", () => {
    const { r } = pw(false, false);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/Chromium is installed but does not start/);
  });
  it("without dependencies when apt does not work, and says so", () => {
    const { r, log } = pw(false);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("WITHOUT system dependencies");
    expect(r.stdout).not.toContain("::error::"); // the failed first try has a fallback: a warning
    expect(log.trim().split("\n")).toEqual(["--with-deps chromium", "chromium"]); // one quick try, then the plain install
  });
});

describe("workflows: no raw apt and no raw Playwright install", () => {
  const dir = join(repo, ".github/workflows");
  const lines = readdirSync(dir)
    .filter((f) => f.endsWith(".yml"))
    .flatMap((f) => readFileSync(join(dir, f), "utf8").split("\n").map((l, i) => ({ f, n: i + 1, l })))
    .filter(({ l }) => !/^\s*#/.test(l));
  it("no apt-get and no `playwright install` in a workflow — the scripts do it (mirror-proof, with retries)", () => {
    const bare = lines.filter(({ l }) => /apt-get|playwright install/.test(l)).map(({ f, n, l }) => `${f}:${n} ${l.trim().slice(0, 90)}`);
    expect(bare, `use scripts/dbTools.sh (postgres, faketime) or scripts/playwrightInstall.sh:\n${bare.join("\n")}`).toEqual([]);
  });
  it("the database and browser steps call the scripts, after apt's own settings", () => {
    const calls = lines.filter(({ l }) => /dbTools\.sh|playwrightInstall\.sh/.test(l));
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const c of calls) {
      const before = lines.filter((x) => x.f === c.f && x.n < c.n && x.n >= c.n - 3).map((x) => x.l).join("\n");
      expect(before, `${c.f}:${c.n}`).toContain("aptRetries.sh");
    }
  });
  it("the 23:40 run passes FAKETIME_LIB through sudo (sudo drops the environment)", () => {
    const yml = readFileSync(join(dir, "checks.yml"), "utf8");
    expect(yml).toMatch(/sudo DB_NOW=la-2340 FAKETIME_LIB="\$\{FAKETIME_LIB:-\}" bash supabase\/tests\/run\.sh/);
  });
});
