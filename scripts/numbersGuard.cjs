/**
 * Numbers guard (#2099; the founder: «почему чат не проверяет, занят номер миграции? чтобы таких проблем не было»): a PR never takes a
 * number another one has or was given.
 *
 * What the PR ADDS is checked (old duplicates stay as they are — a header «-- T119 (cont.)», cloud specs of one number):
 *  - a new migration `supabase/migrations/<14 digits>_<name>.sql`: the version is unique (no other migration has it), later than the last
 *    migration of the base (main) — `db push` refuses an earlier one (CHECKS §9 №9) — and not reserved for another task;
 *  - a new e2e spec `apps/mobile/e2e/specs/<n>-…` or `apps/mobile/e2e/cloud/specs/<n>-…`: its number is not another spec's of its
 *    folder, nor an older spec's of the other folder (a task's browser + cloud pair added by one PR shares a number), and not reserved
 *    for another task;
 *  - a new test header `-- T<n>` in `supabase/tests/core_rls.sql`: n is not a test of the base and not reserved for another task; a
 *    continuation of a test («-- T119 (cont.)», «(more)», «(продолжение)») is not a new number.
 * Reserved numbers: `supabase/migrations/RESERVED.md` (kept by the director): rows «| migration | 20261117320000 | #2066 |»,
 * «| e2e | 482–497 | #2075 |», «| T | 363 | #2080 |». A number reserved for a task is that task's: a PR may use it only when its body names
 * the task (Closes / Refs #N). A row without a task («—») only says «given out», nobody's yet.
 *
 * `decide` is pure; the CLI reads git (BASE_SHA … HEAD_SHA) and the PR's body (PR_BODY).
 */
const MIGRATION = /^supabase\/migrations\/(\d{14})_[^/]+\.sql$/;
const SPEC = /^apps\/mobile\/e2e\/(?:cloud\/)?specs\/(\d+)-[^/]+$/;
const RLS = "supabase/tests/core_rls.sql";
const T_HEAD = /^--\s*T(\d+)\b(.*)$/;
const CONT = /\((?:cont|more|продолж)/i;

/** the rows of RESERVED.md: [{ kind: "migration" | "e2e" | "T", from, to, task?: number }] */
function reserved(md) {
  const out = [];
  for (const line of String(md ?? "").split("\n")) {
    const c = line.split("|").map((x) => x.trim());
    if (c.length < 4) continue;
    const kind = /^migration|^миграц/i.test(c[1]) ? "migration" : /^e2e/i.test(c[1]) ? "e2e" : /^T$/i.test(c[1]) ? "T" : null;
    const m = c[2].match(/^T?(\d+)(?:\s*[–-]\s*T?(\d+))?$/);
    if (!kind || !m) continue;
    const t = c[3].match(/#(\d+)/);
    out.push({ kind, from: BigInt(m[1]), to: BigInt(m[2] ?? m[1]), ...(t ? { task: Number(t[1]) } : {}) });
  }
  return out;
}

/** the task numbers the PR's body refers to (Closes / Fixes / Resolves / Refs #N, also «Closes #1, #2») */
function bodyTasks(body) {
  const out = new Set();
  const re = /\b(?:clos(?:e|es|ed)|fix(?:es|ed)?|resolv(?:e|es|ed)|refs?)\b\s*:?\s*((?:#\d+)(?:\s*(?:,|and|и|&)\s*#\d+)*)/gi;
  for (const m of String(body ?? "").matchAll(re)) for (const n of m[1].matchAll(/#(\d+)/g)) out.add(Number(n[1]));
  return out;
}

/**
 * input: {
 *   added: string[]            — paths the PR adds,
 *   baseMigrations: string[]   — migration versions of the base (main),
 *   headMigrations: string[]   — migration versions after the PR (all files),
 *   headSpecs: string[]        — spec paths after the PR (both folders),
 *   rlsAddedLines: string[]    — the lines the PR adds to core_rls.sql,
 *   baseTests: number[]        — the T numbers of the base's core_rls.sql,
 *   reservedMd: string, body: string | undefined (undefined — not a PR: the reserved rows are only told)
 * } -> { ok, problems: string[], notes: string[] }
 */
function decide(x) {
  const problems = [];
  const notes = [];
  const rows = reserved(x.reservedMd);
  const mine = bodyTasks(x.body);
  const owner = (kind, n) => rows.find((r) => r.kind === kind && r.from <= BigInt(n) && BigInt(n) <= r.to && r.task !== undefined);
  const notMine = (kind, n, what) => {
    const r = owner(kind, n);
    if (!r || mine.has(r.task)) return;
    if (x.body === undefined) notes.push(`${what}: зарезервирован за #${r.task} (supabase/migrations/RESERVED.md) — проверится в PR`);
    else problems.push(`${what}: номер зарезервирован за #${r.task} (supabase/migrations/RESERVED.md) — возьмите свой у руководителя или укажите «Refs #${r.task}», если это та задача`);
  };

  const lastBase = [...x.baseMigrations].sort().pop() ?? "";
  for (const path of x.added) {
    const m = path.match(MIGRATION);
    if (m) {
      const v = m[1];
      const same = x.headMigrations.filter((h) => h === v).length;
      if (same > 1) problems.push(`${path}: версия ${v} уже есть у другой миграции`);
      if (v <= lastBase) problems.push(`${path}: версия ${v} не позже последней миграции main (${lastBase}) — db push её не примет (CHECKS §9 №9)`);
      notMine("migration", v, path);
      continue;
    }
    const s = path.match(SPEC);
    if (s) {
      const n = Number(s[1]);
      // one task's pair — the browser spec and the cloud one — shares a number (e2e 180, 196, 198, 260, 417, 472): the same number in the
      // OTHER folder is fine when this PR adds that spec too; in the same folder, or an older spec of the other one — taken
      const folder = (h) => (h.includes("/e2e/cloud/") ? "cloud" : "specs");
      const others = x.headSpecs.filter((h) => h !== path && Number((h.match(SPEC) ?? [])[1]) === n && (folder(h) === folder(path) || !x.added.includes(h)));
      if (others.length) problems.push(`${path}: номер ${n} уже у ${others.join(", ")} — номер e2e даёт руководитель (CHECKS §9 №37)`);
      notMine("e2e", n, path);
    }
  }
  const baseT = new Set(x.baseTests);
  const seenNew = new Set();
  for (const line of x.rlsAddedLines) {
    const m = line.match(T_HEAD);
    if (!m || CONT.test(m[2])) continue;
    const n = Number(m[1]);
    if (seenNew.has(n)) continue;
    seenNew.add(n);
    if (baseT.has(n)) problems.push(`${RLS}: «-- T${n}» уже есть в main — следующий свободный номер даёт руководитель (продолжение старого теста — «-- T${n} (cont.)»)`);
    notMine("T", n, `${RLS} T${n}`);
  }
  return { ok: problems.length === 0, problems, notes };
}

/** the T numbers of a core_rls.sql text (headers, ranges «T23–T25» too) */
function testsOf(text) {
  const out = new Set();
  for (const line of String(text).split("\n")) {
    const m = line.match(/^--\s*T(\d+)(?:\s*[–-]\s*T?(\d+))?/);
    if (!m) continue;
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    for (let i = a; i <= Math.min(b, a + 50); i++) out.add(i);
  }
  return [...out];
}

module.exports = { decide, reserved, bodyTasks, testsOf, MIGRATION, SPEC };

if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "pipe"] });
  const base = process.env.BASE_SHA;
  const head = process.env.HEAD_SHA || "HEAD";
  if (!base) { console.log("skipped: no BASE_SHA (not a pull request)"); process.exit(0); }
  const from = git("merge-base", base, head).trim();
  const ls = (rev, dir) => git("ls-tree", "-r", "--name-only", rev, "--", dir).split("\n").filter(Boolean);
  const versions = (paths) => paths.map((p) => (p.match(MIGRATION) ?? [])[1]).filter(Boolean);
  const show = (rev, path) => { try { return git("show", `${rev}:${path}`); } catch { return ""; } };
  const added = git("diff", "--name-only", "--diff-filter=A", "--no-renames", from, head).split("\n").filter(Boolean);
  const rlsDiff = git("diff", "-U0", from, head, "--", RLS);
  const res = decide({
    added,
    baseMigrations: versions(ls(from, "supabase/migrations")),
    headMigrations: versions(ls(head, "supabase/migrations")),
    headSpecs: [...ls(head, "apps/mobile/e2e/specs"), ...ls(head, "apps/mobile/e2e/cloud/specs")].filter((p) => SPEC.test(p)),
    rlsAddedLines: rlsDiff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)),
    baseTests: testsOf(show(from, RLS)),
    reservedMd: show(head, "supabase/migrations/RESERVED.md"),
    body: process.env.PR_BODY,
  });
  for (const n of res.notes) console.log(`::notice::${n}`);
  if (res.ok) { console.log("ok: номера миграций, e2e и T уникальны"); process.exit(0); }
  for (const p of res.problems) console.log(`::error::${p}`);
  process.exit(1);
}
