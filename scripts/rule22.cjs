/**
 * Rule 22 guard (CLAUDE.md, #902; stages 1–6 since the founder's decision of 15.11.2026): every PR refers to a task labelled
 * «до-1.0» that sits in a stage container or an old epic (CONTAINERS), directly or through up to 2 levels of sub-tasks.
 * The label keeps its old name: it marks "a task of stages 1–6", not a release boundary. `decide` is pure (the issue lookups are passed in); the CLI part reads
 * the PR and the issues from GitHub (REST, GITHUB_TOKEN with pull-requests/issues read) and exits 1 with the reason.
 */
/** Stage containers and old epics, one list (CLAUDE.md rule 22). A new stage container is added here and in rule22.test.ts. */
const CONTAINERS = [
  769, 770, 771, 772, 773, 774, 775, // old epics Э0–Э6, kept as task folders
  1341, // Э5 continued
  1542, // stage 1 «Надёжность»
  1878, // stage 2 «Главный путь»
  1879, // stage 3 «Gutters»
  1880, 1526, // stage 4 «Люди и компании»
  1881, 1544, // stage 5 «ИИ-помощник и сканеры»
  1882, // stage 6 «Админ-панель и магазин»
  2294, // «Редизайн Графит — всё приложение» (решение основателя 20.11, вопрос 52)
];
const EPICS = CONTAINERS; // old name, kept for callers
const LABEL = "до-1.0";
const SKIP_LABEL = "починка-main";
const MAX_LEVELS = 2;

/** Task numbers the PR body names with Closes/Fixes/Resolves/Refs (also "Closes #1, #2"); only this repository's #N. */
function referencedIssues(body) {
  const out = new Set();
  const re = /\b(?:clos(?:e|es|ed)|fix(?:es|ed)?|resolv(?:e|es|ed)|refs?)\b\s*:?\s*((?:#\d+)(?:\s*(?:,|and|и|&)\s*#\d+)*)/gi;
  for (const m of String(body ?? "").matchAll(re)) for (const n of m[1].matchAll(/#(\d+)/g)) out.add(Number(n[1]));
  // "Closes https://github.com/<this repository>/issues/N" counts for GitHub too
  const repo = (process.env.GITHUB_REPOSITORY || "").toLowerCase();
  const urlRe = /\b(?:clos(?:e|es|ed)|fix(?:es|ed)?|resolv(?:e|es|ed)|refs?)\b\s*:?\s*https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)\b/gi;
  for (const m of String(body ?? "").matchAll(urlRe)) if (repo && m[1].toLowerCase() === repo) out.add(Number(m[2]));
  return [...out];
}

const docsOnly = (files) => files.length > 0 && files.every((f) => /^docs\//.test(f) || /\.md$/.test(f));

/** is the task `n` a «до-1.0» task inside a stage container or an epic? getIssue(n) -> {labels: string[]} | null; getParent(n) -> number | null */
async function inEpic(n, { getIssue, getParent }) {
  if (CONTAINERS.includes(n)) return { ok: false, why: `#${n} is a stage container or an epic itself: refer to a task inside it` };
  const issue = await getIssue(n);
  if (!issue) return { ok: false, why: `#${n} is not a task of this repository` };
  if (!issue.labels.includes(LABEL)) return { ok: false, why: `#${n} has no label «${LABEL}»` };
  let at = n;
  for (let level = 0; level < MAX_LEVELS; level++) {
    const parent = await getParent(at);
    if (parent === null || parent === undefined) break;
    if (CONTAINERS.includes(parent)) return { ok: true };
    at = parent;
  }
  return { ok: false, why: `#${n} is not inside a stage container or an epic (${CONTAINERS.map((c) => `#${c}`).join(", ")}; parent chain of ${MAX_LEVELS} levels)` };
}

/** -> { ok, skip?, message } */
async function decide({ body, prLabels, files, getIssue, getParent }) {
  if (prLabels.includes(SKIP_LABEL)) return { ok: true, skip: `label «${SKIP_LABEL}»` };
  if (docsOnly(files)) return { ok: true, skip: "documents only" };
  const refs = referencedIssues(body);
  const head = "PR не ссылается на задачу до-1.0 в контейнере этапа или эпике (правило 22)";
  if (refs.length === 0) return { ok: false, message: `${head}: добавьте в описание «Closes #N» или «Refs #N».` };
  const whys = [];
  for (const n of refs) {
    const r = await inEpic(n, { getIssue, getParent });
    if (r.ok) return { ok: true, message: `#${n} is a «${LABEL}» task in a stage container or an epic` };
    whys.push(r.why);
  }
  return { ok: false, message: `${head}. ${whys.join("; ")}.` };
}

module.exports = { CONTAINERS, EPICS, referencedIssues, docsOnly, inEpic, decide };

if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const repo = process.env.GITHUB_REPOSITORY;
  const pr = process.env.PR_NUMBER;
  const api = (p, extra = []) => JSON.parse(execFileSync("gh", ["api", ...extra, p], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) || "null");
  const tryApi = (p) => { try { return api(p); } catch (e) { if (/HTTP 404/.test(String(e.stderr || e.message))) return null; throw e; } };
  (async () => {
    const prData = api(`repos/${repo}/pulls/${pr}`);
    const files = api(`repos/${repo}/pulls/${pr}/files?per_page=100`, ["--paginate", "--slurp"]).flat().flatMap((f) => [f.filename, f.previous_filename].filter(Boolean));
    const res = await decide({
      body: prData.body,
      prLabels: prData.labels.map((l) => l.name),
      files,
      getIssue: async (n) => { const i = tryApi(`repos/${repo}/issues/${n}`); return i && !i.pull_request ? { labels: i.labels.map((l) => (typeof l === "string" ? l : l.name)) } : null; },
      getParent: async (n) => { const p = tryApi(`repos/${repo}/issues/${n}/parent`); return p ? p.number : null; },
    });
    if (res.ok) { console.log(res.skip ? `skipped: ${res.skip}` : res.message); return; }
    console.log(`::error::${res.message}`);
    process.exit(1);
  })().catch((e) => { console.error(e); process.exit(2); });
}
