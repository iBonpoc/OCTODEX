/**
 * Rule 22 guard (CLAUDE.md, #902): every PR refers to a task labelled «до-1.0» that sits in a release epic (#769–#775),
 * directly or through up to 2 levels of sub-tasks. `decide` is pure (the issue lookups are passed in); the CLI part reads
 * the PR and the issues from GitHub (REST, GITHUB_TOKEN with pull-requests/issues read) and exits 1 with the reason.
 */
const EPICS = [769, 770, 771, 772, 773, 774, 775];
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

/** is the task `n` a «до-1.0» task inside an epic? getIssue(n) -> {labels: string[]} | null; getParent(n) -> number | null */
async function inEpic(n, { getIssue, getParent }) {
  if (EPICS.includes(n)) return { ok: false, why: `#${n} is an epic itself: refer to a task inside it` };
  const issue = await getIssue(n);
  if (!issue) return { ok: false, why: `#${n} is not a task of this repository` };
  if (!issue.labels.includes(LABEL)) return { ok: false, why: `#${n} has no label «${LABEL}»` };
  let at = n;
  for (let level = 0; level < MAX_LEVELS; level++) {
    const parent = await getParent(at);
    if (parent === null || parent === undefined) break;
    if (EPICS.includes(parent)) return { ok: true };
    at = parent;
  }
  return { ok: false, why: `#${n} is not inside an epic #769–#775 (parent chain of ${MAX_LEVELS} levels)` };
}

/** -> { ok, skip?, message } */
async function decide({ body, prLabels, files, getIssue, getParent }) {
  if (prLabels.includes(SKIP_LABEL)) return { ok: true, skip: `label «${SKIP_LABEL}»` };
  if (docsOnly(files)) return { ok: true, skip: "documents only" };
  const refs = referencedIssues(body);
  const head = "PR не ссылается на задачу до-1.0 в эпике (правило 22)";
  if (refs.length === 0) return { ok: false, message: `${head}: добавьте в описание «Closes #N» или «Refs #N».` };
  const whys = [];
  for (const n of refs) {
    const r = await inEpic(n, { getIssue, getParent });
    if (r.ok) return { ok: true, message: `#${n} is a «${LABEL}» task in an epic` };
    whys.push(r.why);
  }
  return { ok: false, message: `${head}. ${whys.join("; ")}.` };
}

module.exports = { EPICS, referencedIssues, docsOnly, inEpic, decide };

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
