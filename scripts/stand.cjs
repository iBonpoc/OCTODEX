/**
 * The stand (#3117 Б, #3120): one web copy at a fixed link = fresh main + every open PR labelled «стенд». Nobody writes to the
 * branch `stand/auto` by hand: stand.yml rebuilds it from origin/main each time and this script decides what goes in.
 *
 * Order: a PR goes after the PR it depends on (at most one: its base branch is that PR's branch, or «зависит от #N» /
 * «depends on #N» in the description), otherwise by number. A PR is left out, with the reason, when:
 *   - it conflicts with main or with a PR already in (git merge-tree: «конфликт с #X, файлы …»);
 *   - it depends on a PR that is left out, or on an open PR without the label;
 *   - it changes .github/workflows (the branch push must not carry workflow files; nor would the stand run them);
 *   - the combination breaks the build: the build job finds the PR by halving the list (findBreaker) and drops it.
 * The manifest (JSON) says what the stand is: main's SHA, the PRs in with their SHAs, the PRs out with the reason.
 *
 * The pure part (plan, mergeAll, findBreaker, manifest, renderIssue) is tested in apps/mobile/test/stand.test.ts. The CLI part
 * runs git (merge-tree, commit-tree — no checkout, no code of a PR is run) and the build (only in the job with no keys):
 *   node scripts/stand.cjs merge  --out manifest.json [--exclude manifest-build.json] [--push]   (job merge / merge-again)
 *   node scripts/stand.cjs build  --manifest manifest.json --out manifest-build.json --dist <dir>  (job build: no keys, read-only;
 *                                 every candidate is built in `docker run --rm` with only the worktree mounted, buildArgv)
 *   node scripts/stand.cjs issue  --manifest manifest.json --url <link>                             (job deploy: the pinned task)
 * Merge commits are made with a fixed author and date (gitMerger), so the same input gives the same SHA in every job: the
 * write job checks that the SHA the build job built is the one it pushes.
 */
const LABEL = "стенд";
const BRANCH = "stand/auto";
const ALIAS = "stand";
const STAND_ISSUE = 3123; // «Стенд — ссылка и состав», pinned; its body is written by stand.yml
const MAX_BREAKERS = 3; // the build job drops at most this many PRs; then the stand stays as it was
const WORKFLOWS_RE = /^\.github\/workflows\//;
/**
 * The build of the stand in its worktree (as preview.yml, plus typecheck), in two containers (security review 2 of #3125):
 * the install with the network, the build without it (--network none, Expo offline). STAND_INSTALL_CMD / STAND_BUILD_CMD
 * replace them only in the smoke test.
 */
const INSTALL_CMD = `set -e
npm ci --no-audit --no-fund`;
const BUILD_CMD = `set -e
npm run typecheck
cd apps/mobile
node scripts/setBuild.cjs "" --message "$SUBJECT"
npx expo export --platform web`;

/** The PR a PR depends on: its base branch is another open PR's branch, else «зависит от #N» / «depends on #N». */
function dependencyOf(pr, openHeads = {}) {
  const base = String(pr.baseRef || "main");
  if (base !== "main") {
    const n = openHeads[base];
    return n ? { number: n, how: "base" } : { number: null, how: "base", unknown: base };
  }
  const m = String(pr.body || "").match(/(?:зависит\s+от|depends\s+on)\s*:?\s*#(\d+)/i);
  return m ? { number: Number(m[1]), how: "body" } : null;
}

/**
 * @param {{prs: Array<{number:number, sha:string, title?:string, body?:string, baseRef?:string, headRef?:string, files?:string[], fork?:boolean}>,
 *          open?: number[], openHeads?: Record<string, number>}} a  prs — the open PRs labelled «стенд»; open — every open PR number;
 *          openHeads — branch → open PR number
 * @returns {{order: object[], skipped: Array<{number:number, sha:string, reason:string}>, deps: Record<number, number>}}
 */
function plan({ prs, open = [], openHeads = {} }) {
  const byNum = new Map(prs.map((p) => [p.number, p]));
  const openSet = new Set([...open, ...prs.map((p) => p.number)]);
  const skipped = new Map(); // number → reason
  const deps = {};
  for (const p of [...prs].sort((a, b) => a.number - b.number)) {
    if (p.fork) { skipped.set(p.number, "PR из чужого репозитория — на стенд не берётся"); continue; }
    if ((p.files || []).some((f) => WORKFLOWS_RE.test(f))) { skipped.set(p.number, "меняет .github/workflows — на стенд такие не берутся"); continue; }
    const d = dependencyOf(p, openHeads);
    if (!d) continue;
    if (d.number == null) { skipped.set(p.number, `база PR — ветка ${md(d.unknown)}: не main и не ветка открытого PR`); continue; }
    if (d.number === p.number) continue;
    if (byNum.has(d.number)) deps[p.number] = d.number;
    else if (openSet.has(d.number) || d.how === "base") skipped.set(p.number, `зависит от #${d.number} — его нет на стенде (нет ярлыка «${LABEL}»)`);
    // a dependency that is no longer open is merged (or closed): it is in main already
  }
  // a cycle of dependencies: every PR on it is out
  for (const start of Object.keys(deps).map(Number)) {
    const seen = [];
    let at = start;
    while (deps[at] != null && !seen.includes(at)) { seen.push(at); at = deps[at]; }
    if (deps[at] != null && seen.includes(at)) {
      const ring = seen.slice(seen.indexOf(at));
      for (const n of ring) if (!skipped.has(n)) skipped.set(n, `круг зависимостей: ${ring.map((x) => `#${x}`).join(" → ")}`);
    }
  }
  // a PR whose dependency is out is out too (down the whole chain)
  let changed = true;
  while (changed) {
    changed = false;
    for (const [n, d] of Object.entries(deps)) {
      const k = Number(n);
      if (!skipped.has(k) && skipped.has(d)) { skipped.set(k, `зависит от #${d}, он не вошёл`); changed = true; }
    }
  }
  // order: by number, a PR right after (somewhere after) the one it depends on
  const order = [];
  const placed = new Set();
  const place = (p) => {
    if (placed.has(p.number) || skipped.has(p.number)) return;
    const d = deps[p.number];
    if (d != null && !placed.has(d)) place(byNum.get(d));
    placed.add(p.number);
    order.push(p);
  };
  for (const p of [...prs].sort((a, b) => a.number - b.number)) place(p);
  const sk = [...skipped].map(([number, reason]) => ({ number, sha: byNum.get(number)?.sha || "", reason })).sort((a, b) => a.number - b.number);
  return { order, skipped: sk, deps };
}

/**
 * Merges the planned PRs onto main one by one. merge(baseSha, pr) → {ok:true, commit} | {ok:false, files:string[]} (git merge-tree).
 * exclude: number → reason (from the build job). A conflict names the PRs already in that changed the same files, else main.
 */
function mergeAll({ mainSha, order, deps = {}, merge, exclude = {} }) {
  let current = mainSha;
  const included = [];
  const skipped = [];
  const out = new Set();
  for (const pr of order) {
    const d = deps[pr.number];
    if (exclude[pr.number]) { skipped.push({ number: pr.number, sha: pr.sha, reason: exclude[pr.number] }); out.add(pr.number); continue; }
    if (d != null && out.has(d)) { skipped.push({ number: pr.number, sha: pr.sha, reason: `зависит от #${d}, он не вошёл` }); out.add(pr.number); continue; }
    const r = merge(current, pr);
    if (r.ok) { current = r.commit; included.push(pr); continue; }
    if (r.reason) { skipped.push({ number: pr.number, sha: pr.sha, reason: r.reason }); out.add(pr.number); continue; }
    const files = [...new Set(r.files || [])].sort();
    const with_ = included.filter((p) => (p.files || []).some((f) => files.includes(f))).map((p) => `#${p.number}`);
    const list = files.length ? `, файлы ${files.slice(0, 5).map(md).join(", ")}${files.length > 5 ? ` и ещё ${files.length - 5}` : ""}` : "";
    skipped.push({ number: pr.number, sha: pr.sha, reason: `конфликт с ${with_.length ? with_.join(", ") : "main"}${list}` });
    out.add(pr.number);
  }
  return { stand: current, included, skipped };
}

/**
 * The PR that breaks the build: the shortest prefix of `list` (in merge order) that does not build ends with it.
 * builds(prefix) → boolean. Expects builds([]) (main alone) true and builds(list) false; returns null when main alone fails.
 * About log2(n) builds.
 */
function findBreaker(list, builds) {
  if (!builds([])) return null;
  let lo = 0; // builds(list.slice(0, lo)) is true
  let hi = list.length; // builds(list.slice(0, hi)) is false
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (builds(list.slice(0, mid))) lo = mid; else hi = mid;
  }
  return list[hi - 1];
}

/** «Где смотреть — что увидеть» from the PR description (the line itself, without the words), or "". */
function whereLine(body) {
  for (const raw of String(body || "").split("\n")) {
    const l = raw.replace(/^[\s>*\-•]+/, "").replace(/\*\*/g, "");
    const m = l.match(/^где\s+смотреть\s*(?:—|-|–)?\s*что\s+увидеть\s*[:：—–-]?\s*(.*)$/i) || l.match(/^где\s+смотреть\s*[:：—–-]\s*(.*)$/i);
    if (m && m[1].trim()) return m[1].trim();
  }
  return "";
}

/** The manifest: what the stand is. */
function manifest({ mainSha, stand, included, skipped, at = new Date().toISOString() }) {
  return {
    main: mainSha,
    stand,
    at,
    included: included.map((p) => ({ number: p.number, sha: p.sha, title: p.title || "", where: whereLine(p.body) })),
    skipped: [...skipped].sort((a, b) => a.number - b.number).map((s) => ({ number: s.number, sha: s.sha || "", reason: s.reason })),
  };
}

/** The body of the pinned task «Стенд — ссылка и состав». */
const FIELD_MAX = 200;
const BODY_MAX = 60000; // GitHub takes 65536

/**
 * Text from a PR (title, «где смотреть», a reason with file names) made inert for the task body (review of #3125 п.3): one line,
 * at most 200 characters, Markdown and HTML marks escaped, «@» broken with a zero-width space (no mention, no notification).
 */
function md(text) {
  let t = String(text ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (t.length > FIELD_MAX) t = t.slice(0, FIELD_MAX - 1) + "…";
  return t.replace(/[\\`*_[\]()<>#|~!]/g, (c) => `\\${c}`).replace(/@/g, "@\u200b");
}

/** Our own reasons keep their «#N» links: what came from a PR in them (file and branch names) is escaped where they are made. */
const line = (t) => { const x = String(t ?? "").replace(/[\r\n\t]+/g, " ").replace(/<!--|-->/g, ""); return x.length > 2 * FIELD_MAX ? x.slice(0, 2 * FIELD_MAX - 1) + "…" : x; };

function renderIssue(m, url) {
  const short = (s) => (/^[0-9a-f]{7,40}$/.test(String(s || "")) ? String(s).slice(0, 7) : "");
  const n = (x) => (Number.isInteger(Number(x)) ? Number(x) : 0);
  url = /^https:\/\/[a-z0-9-]+--stand\.expo\.app\/?$/.test(String(url || "")) ? url : "";
  const lines = [
    "<!-- stand.yml пишет это тело сам после каждой сборки: руками не править -->",
    `**Стенд:** ${url || "—"}`,
    "",
    "⚠ На стенде входить только в демо или в тестовый проект: это код PR, ещё не принятый, а база у него общая с приложением.",
    "",
    `Собран ${m.at} · main \`${short(m.main)}\` · стенд \`${short(m.stand)}\` (ветка \`${BRANCH}\`)`,
    "",
    `### Вошли (${m.included.length})`,
  ];
  if (!m.included.length) lines.push("Только main: открытых PR с ярлыком «" + LABEL + "» нет или ни один не вошёл.");
  for (const p of m.included) lines.push(`- #${n(p.number)} \`${short(p.sha)}\` ${md(p.title)}${p.where ? `\n  - где смотреть — что увидеть: ${md(p.where)}` : "\n  - где смотреть — что увидеть: (в описании PR нет такой строки)"}`);
  lines.push("", `### Не вошли (${m.skipped.length})`);
  if (!m.skipped.length) lines.push("—");
  for (const s of m.skipped) lines.push(`- #${n(s.number)}${short(s.sha) ? ` \`${short(s.sha)}\`` : ""} — ${line(s.reason)}`);
  lines.push("", "Как попасть на стенд: ярлык «" + LABEL + "» на PR. Пересборка — сама после каждого пуша в такой PR и каждого влития в main (#3117).");
  const body = lines.join("\n");
  return body.length > BODY_MAX ? body.slice(0, BODY_MAX) + "\n\n… (обрезано)" : body;
}

/**
 * The merge of one PR onto the stand so far, without a checkout: git merge-tree (exit 1 = conflict, the conflicted files after
 * the tree line), then commit-tree with a fixed author and date (main's commit date), so the same merges give the same SHAs
 * in every job. Runs no code of the PR.
 */
function gitMerger(cwd, date) {
  const { execFileSync } = require("node:child_process");
  const env = { ...process.env, GIT_AUTHOR_NAME: "stand", GIT_AUTHOR_EMAIL: "stand@users.noreply.github.com", GIT_COMMITTER_NAME: "stand",
    GIT_COMMITTER_EMAIL: "stand@users.noreply.github.com", GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  const git = (a) => execFileSync("git", a, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return (base, pr) => {
    let tree;
    try {
      tree = git(["merge-tree", "--write-tree", "--name-only", "--no-messages", base, pr.sha]).split("\n")[0].trim();
    } catch (err) {
      if (err.status !== 1) throw err;
      const out = String(err.stdout || "").split("\n").map((x) => x.trim()).filter(Boolean);
      return { ok: false, files: [...new Set(out.slice(1))] };
    }
    // by the tree, not by the API's file list (it stops at 3000 files): what the merge adds under .github/workflows
    const wf = git(["diff", "--name-only", base, tree, "--", ".github/workflows"]).split("\n").map((x) => x.trim()).filter(Boolean);
    if (wf.length) return { ok: false, reason: `меняет .github/workflows (${wf.slice(0, 3).map(md).join(", ")}) — на стенд такие не берутся` };
    const commit = git(["commit-tree", tree, "-p", base, "-p", pr.sha, "-m", `stand: #${pr.number} ${pr.sha.slice(0, 7)}`]).trim();
    return { ok: true, commit };
  };
}

/**
 * The build of one candidate runs in a throw-away container (security review of #3125 п.1): the code of the PRs (npm ci
 * postinstall, typecheck, expo export) sees only the worktree mounted at /w — not the runner's processes, its environment
 * (ACTIONS_RUNTIME_TOKEN of the artifact and cache steps) or its files, so it cannot write the caches main reads. The container
 * gets no variable but SUBJECT, runs as the runner's user (the worktree stays removable) and is removed after the build.
 */
// Pinned by digest (rule 17, checked 27.11.2026): the Docker Official Image library/node (Node.js Docker team), tag 22-bookworm,
// Node 22.23.5, built 24.11.2026, the multi-platform index. A new digest only deliberately, after the same check.
const BUILD_IMAGE = "node:22-bookworm@sha256:7c400d78797d8cbe3f6bb21d2227b86af4cd24b0014cc9f62ff989cc16de988e";
function buildArgv({ wt, cmd, subject, uid, gid, network = false }) {
  return ["docker", ["run", "--rm", "--user", `${uid}:${gid}`,
    // no capabilities, no setuid, bounded processes and memory; the network only for npm ci
    "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=4096", "--memory=7g",
    ...(network ? [] : ["--network", "none"]),
    "-e", "HOME=/tmp", "-e", `SUBJECT=${subject}`, "-e", "EXPO_OFFLINE=1", "-e", "EXPO_NO_TELEMETRY=1", "-e", "CI=1",
    "-v", `${wt}:/w`, "-w", "/w", BUILD_IMAGE, "bash", "-c", cmd]];
}

/**
 * git push of the stand: the token goes in the environment (GIT_CONFIG_COUNT / KEY_0 / VALUE_0), never in the arguments, which
 * any process of the runner can read and which an error message prints (review of #3125 п.7).
 */
function pushArgv(stand, token, baseEnv = {}) {
  const auth = Buffer.from(`x-access-token:${token}`).toString("base64");
  return [["push", "--force", "origin", `${stand}:refs/heads/${BRANCH}`],
    { ...baseEnv, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${auth}` }];
}

/**
 * The dist the container built goes out of the worktree only as plain files and directories (security review 2 of #3125): a
 * symbolic link (dist/x.js → /proc/self/environ) would be followed on the runner by upload-artifact and put its secrets into a
 * public artifact. lstat everywhere: the root must be a real directory, anything that is not a regular file or a directory
 * (a link, a device, a pipe, a socket) stops the build. Files are copied by content.
 */
function copyDistSafe(src, dst) {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = fs.lstatSync(src);
  if (!root.isDirectory()) throw new Error(`${src}: not a real directory (${root.isSymbolicLink() ? "a symbolic link" : "not a directory"})`);
  const walk = (rel) => {
    for (const name of fs.readdirSync(path.join(src, rel))) {
      const r = path.join(rel, name);
      const st = fs.lstatSync(path.join(src, r));
      if (st.isDirectory()) walk(r);
      else if (!st.isFile()) throw new Error(`dist/${r}: not a regular file or a directory — the stand takes only plain files`);
    }
  };
  walk("");
  fs.rmSync(dst, { recursive: true, force: true });
  const copy = (rel) => {
    fs.mkdirSync(path.join(dst, rel), { recursive: true });
    for (const name of fs.readdirSync(path.join(src, rel))) {
      const r = path.join(rel, name);
      const st = fs.lstatSync(path.join(src, r));
      if (st.isDirectory()) copy(r);
      else if (st.isFile()) fs.writeFileSync(path.join(dst, r), fs.readFileSync(path.join(src, r)));
      else throw new Error(`dist/${r}: changed while copied`);
    }
  };
  copy("");
}

/** git options for the worktree checkout of the stand: the LFS filters are off (they would run on the runner, with its network). */
const WORKTREE_GIT = ["-c", "filter.lfs.smudge=", "-c", "filter.lfs.process=", "-c", "filter.lfs.required=false"];

module.exports = { WORKTREE_GIT, copyDistSafe, pushArgv, md, FIELD_MAX, BODY_MAX, BUILD_IMAGE, buildArgv, LABEL, BRANCH, ALIAS, STAND_ISSUE, MAX_BREAKERS, INSTALL_CMD, BUILD_CMD, dependencyOf, plan, mergeAll, findBreaker, whereLine, manifest, renderIssue, gitMerger };

// ---------------------------------------------------------------------------------------------------------------------- CLI
if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const fs = require("node:fs");
  const path = require("node:path");
  const env = process.env;
  const args = process.argv.slice(2);
  const cmd = args[0];
  const opt = (name) => { const i = args.indexOf(`--${name}`); return i > 0 ? args[i + 1] : undefined; };
  const flag = (name) => args.includes(`--${name}`);
  const repo = env.GITHUB_REPOSITORY;
  const run = (c, a, o = {}) => execFileSync(c, a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20, ...o });
  const git = (a, o) => run("git", a, o).trim();
  const gh = (a) => run("gh", a);
  const SHA = /^[0-9a-f]{40}$/;

  const fetchHeads = (mainSha, prs) => {
    git(["fetch", "-q", "--no-tags", "origin", mainSha]);
    for (const p of prs) git(["fetch", "-q", "--no-tags", "origin", `+refs/pull/${p.number}/head:refs/stand/pr/${p.number}`]);
    for (const p of prs) if (git(["rev-parse", `refs/stand/pr/${p.number}`]) !== p.sha) throw new Error(`#${p.number}: the head moved while the stand was built`);
  };
  const gitMerge = (mainSha) => gitMerger(process.cwd(), git(["show", "-s", "--format=%cI", mainSha]));
  const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
  const writeJson = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2) + "\n");

  /** The open PRs with the label (live), every open PR and its branch. */
  const readPrs = () => {
    // one compact JSON object per line (bodies keep their line breaks escaped)
    const all = gh(["api", `repos/${repo}/pulls?state=open&per_page=100`, "--paginate", "--jq", ".[] | {number, sha: .head.sha, title, body, baseRef: .base.ref, headRef: .head.ref, fork: (.head.repo.full_name != .base.repo.full_name), labels: [.labels[].name]}"])
      .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    const openHeads = Object.fromEntries(all.filter((p) => !p.fork).map((p) => [p.headRef, p.number]));
    const prs = all.filter((p) => p.labels.includes(LABEL)).map((p) => {
      const files = gh(["api", `repos/${repo}/pulls/${p.number}/files?per_page=100`, "--paginate", "--jq", ".[].filename"]).split("\n").filter(Boolean);
      return { ...p, files };
    });
    for (const p of prs) if (!SHA.test(p.sha)) throw new Error(`#${p.number}: bad head`);
    return { prs, open: all.map((p) => p.number), openHeads };
  };

  if (cmd === "merge") {
    // job merge / merge-again (contents: write, no npm, no code of a PR is run)
    const mainSha = git(["rev-parse", "origin/main"]);
    const first = opt("from") ? readJson(opt("from")) : null; // merge-again: the same input as the first pass
    const input = first ? first.input : readPrs();
    const planned = plan(input);
    const { deps } = planned;
    // merge-again: only the PRs that were in (one that conflicted stays out with its reason, even if it would fit now —
    // the build job built exactly the first pass minus the breakers)
    const order = first ? planned.order.filter((p) => first.included.some((q) => q.number === p.number)) : planned.order;
    const skipped = first ? first.skipped : planned.skipped;
    const base = first ? first.main : mainSha;
    fetchHeads(base, order);
    let exclude = {};
    if (opt("exclude")) {
      const b = readJson(opt("exclude"));
      // the build job ran code of the PRs: trust only numbers that were in, and only its reason text
      const inNow = new Set(first.included.map((p) => p.number));
      for (const s of b.excluded || []) if (inNow.has(Number(s.number))) exclude[Number(s.number)] = "ломает сборку вместе с остальными (typecheck или expo export), найдено делением списка";
    }
    const r = mergeAll({ mainSha: base, order, deps, merge: gitMerge(base), exclude });
    const m = { ...manifest({ mainSha: base, stand: r.stand, included: r.included, skipped: [...skipped, ...r.skipped] }), input, deps };
    if (opt("expect") && opt("expect") !== r.stand) throw new Error(`the build job built ${opt("expect")}, the merge gives ${r.stand}`);
    writeJson(opt("out") || "manifest.json", m);
    console.log(`stand ${r.stand}: in ${r.included.map((p) => `#${p.number}`).join(" ") || "—"}; out ${m.skipped.map((s) => `#${s.number}`).join(" ") || "—"}`);
    if (flag("push")) {
      // only this job writes the branch: force, from scratch on main every time
      const [a, e] = pushArgv(r.stand, env.GH_TOKEN, process.env);
      try { run("git", a, { env: e }); } catch (err) {
        // the error without the command line or the environment (review of #3125 п.7)
        console.error(`::error::git push of the stand failed (exit ${err.status}): ${String(err.stderr || "").replace(/basic [A-Za-z0-9+/=]+/g, "basic ***").trim()}`);
        process.exit(1);
      }
    }
    if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `stand=${r.stand}\n`);
  } else if (cmd === "build") {
    // job build (contents: read, no keys): builds main + the PRs; a broken combination → halve the list to find the PR
    const m = readJson(opt("manifest"));
    if (!SHA.test(m.main) || !SHA.test(m.stand)) throw new Error("bad manifest");
    const order = m.included.map((p) => ({ ...m.input.prs.find((q) => q.number === p.number) }));
    fetchHeads(m.main, order);
    const merge = gitMerge(m.main);
    if (mergeAll({ mainSha: m.main, order, merge }).stand !== m.stand) throw new Error("the merges here do not give the stand of the merge job");
    const wt = path.resolve(opt("worktree") || "stand-wt");
    let built = null; // the commit whose build is in the worktree now
    const buildAt = (sha) => {
      built = sha;
      try { git(["worktree", "remove", "--force", wt]); } catch { /* none yet */ }
      // no LFS download, no filter of the PR's .gitattributes runs on the runner (review 2 of #3125)
      git([...WORKTREE_GIT, "worktree", "add", "--detach", wt, sha], { env: { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" } });
      const subject = git(["show", "-s", "--format=%s", m.main]);
      try {
        const ids = { wt, subject, uid: process.getuid(), gid: process.getgid() };
        for (const step of [{ cmd: env.STAND_INSTALL_CMD || INSTALL_CMD, network: true }, { cmd: env.STAND_BUILD_CMD || BUILD_CMD, network: false }]) {
          const [c, a] = buildArgv({ ...ids, ...step });
          run(c, a, { stdio: "inherit", env: { PATH: process.env.PATH, HOME: process.env.HOME } });
        }
        return true;
      } catch { return false; }
    };
    const cache = new Map();
    const shaOf = (list) => mergeAll({ mainSha: m.main, order: list, merge }).stand;
    const builds = (list) => { const s = shaOf(list); if (!cache.has(s)) cache.set(s, buildAt(s)); return cache.get(s); };
    let list = order;
    const excluded = [];
    let ok = builds(list);
    while (!ok && excluded.length < MAX_BREAKERS) {
      const bad = findBreaker(list, builds);
      if (!bad) throw new Error("main alone does not build: the stand stays as it was");
      excluded.push({ number: bad.number });
      // the PRs that depend on it (through the chain) go out with it
      const outNums = new Set([bad.number]);
      let grew = true;
      while (grew) { grew = false; for (const p of list) if (!outNums.has(p.number) && outNums.has(m.deps[p.number])) { outNums.add(p.number); grew = true; } }
      list = mergeAll({ mainSha: m.main, order: list.filter((p) => !outNums.has(p.number)), merge }).included;
      ok = builds(list);
    }
    if (!ok) throw new Error(`still no build after dropping ${MAX_BREAKERS} PRs: the stand stays as it was`);
    const stand = shaOf(list);
    if (built !== stand && !buildAt(stand)) throw new Error(`${stand} built before, not now`);
    if (opt("dist")) copyDistSafe(path.join(wt, "apps/mobile/dist"), opt("dist"));
    writeJson(opt("out") || "manifest-build.json", { stand, excluded });
    console.log(`built ${stand}; dropped ${excluded.map((e) => `#${e.number}`).join(" ") || "—"}`);
    if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `stand=${stand}\nchanged=${excluded.length ? "true" : "false"}\n`);
  } else if (cmd === "issue") {
    // job deploy: the body of the pinned task (an edit sends no e-mail, unlike a comment)
    const m = readJson(opt("manifest"));
    const body = renderIssue(m, opt("url"));
    fs.writeFileSync("stand-issue.md", body);
    gh(["api", "-X", "PATCH", `repos/${repo}/issues/${STAND_ISSUE}`, "-F", "body=@stand-issue.md"]);
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, body + "\n");
  } else {
    console.error("usage: stand.cjs merge|build|issue …");
    process.exit(2);
  }
}
