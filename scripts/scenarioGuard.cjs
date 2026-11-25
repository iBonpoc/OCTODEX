/**
 * Scenario guard (#2068; rule of #2001 — docs/15-story-map.md §7 п.9, docs/ai/WORKER.md stage 0 п.4): a PR that adds a
 * spec of a step, or a new section to one, writes its acceptance as scenarios «С<n>. ДАНО … КОГДА … ТОГДА …».
 *
 * What is checked (only what the PR adds — old specs are never rewritten):
 *  - a NEW file docs/specs/*.md or docs/14-*.md has at least one scenario;
 *  - in a changed spec, every section whose heading the PR added (the outermost added heading, with all its subsections)
 *    has at least one scenario; edits inside an old section without a new heading are not checked;
 *  - a section (or file) may opt out with the comment `<!-- без сценариев: <причина> -->` (a research note, a comparison);
 *  - the PR added scenarios AND added test files: at least one added test names a scenario «С<n>» (Cyrillic or Latin C);
 *    a PR without new test files (docs only, a stage 0) is not asked this.
 * Sections: a heading of ANY level (#…######) the PR added starts a section; it runs to the next heading of the same or a
 * higher level. Only the outermost added heading is checked (its added subsections are inside it): a new «## 9» with «### 9.1…
 * 9.9» needs one scenario somewhere in it; a new «### 5.3б» inside an old «## 5» needs its own (a new step's plan is a section).
 * Every opt-out used is printed in the report (seen in the PR's log), with its reason.
 *
 * `decide` is pure (file texts and added line numbers are passed in); the CLI part reads them from git (BASE_SHA … HEAD_SHA).
 */
/** A spec is docs/specs/<name>.md or docs/14-*.md; a folder table of contents (README.md) is not a spec (#2684). */
const SPEC = /^docs\/(specs\/(?!README\.md$)[^/]+|14-[^/]+)\.md$/;
const TEST = /(^|\/)(test|tests|e2e\/specs|e2e\/cloud)\/.+\.(ts|tsx|cjs|mjs|js|sql)$|\.test\.(ts|tsx|cjs|mjs|js)$/;
const OPT_OUT = /<!--\s*без сценариев\s*:\s*\S[^>]*-->/i;
const HEADING = /^(#{1,6})\s+\S/;

/** one scenario: a list item, quote or paragraph naming С<n> with ДАНО, КОГДА and ТОГДА */
function scenarios(text) {
  const out = [];
  const chunks = [];
  let cur = [];
  for (const line of String(text).split("\n")) {
    const starts = /^\s*([-*+>]|\d+[.)])\s/.test(line) || HEADING.test(line);
    if (!line.trim() || starts) { if (cur.length) chunks.push(cur.join(" ")); cur = []; }
    if (line.trim()) cur.push(line);
  }
  if (cur.length) chunks.push(cur.join(" "));
  for (const c of chunks) {
    const m = c.match(/(?:^|[^\p{L}\p{N}])С(\d+)(?![\p{L}\p{N}])/u);
    if (m && /ДАНО/.test(c) && /КОГДА/.test(c) && /ТОГДА/.test(c)) out.push(Number(m[1]));
  }
  return out;
}

/** the headings of a markdown text (code blocks skipped): [{ line (1-based), level }] */
function headings(lines) {
  const out = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    const m = !fence && l.match(HEADING);
    if (m) out.push({ line: i + 1, level: m[1].length });
  });
  return out;
}

/** the sections the PR added: outermost added headings, each with its body and subsections -> [{ line, title, text }] */
function addedSections(text, added) {
  const lines = String(text).split("\n");
  const hs = headings(lines);
  const out = [];
  let coveredTo = 0;
  hs.forEach((h, i) => {
    if (!added.has(h.line) || h.line <= coveredTo) return;
    const next = hs.slice(i + 1).find((x) => x.level <= h.level);
    const end = next ? next.line - 1 : lines.length;
    coveredTo = end;
    out.push({ line: h.line, title: lines[h.line - 1].trim(), text: lines.slice(h.line - 1, end).join("\n") });
  });
  return out;
}

/**
 * files: [{ path, status: "A" | "M" | ..., text (after), added: line numbers added (1-based, after) }]
 * -> { ok, problems: string[], found: number[], skipped: string[] (the opt-outs used, with their reasons) }
 */
function decide(files) {
  const problems = [];
  const found = [];
  const skipped = [];
  const optOut = (where, text) => { const m = text.match(OPT_OUT); if (m) skipped.push(`${where}: ${m[0]}`); return !!m; };
  for (const f of files) {
    if (!SPEC.test(f.path) || f.status === "D" || f.text == null) continue;
    if (f.status === "A") {
      if (optOut(f.path, f.text)) continue;
      const s = scenarios(f.text);
      if (!s.length) problems.push(`${f.path}: новая спека без сценариев «С1. ДАНО … КОГДА … ТОГДА …» (story-map §7 п.9)`);
      found.push(...s);
      continue;
    }
    for (const sec of addedSections(f.text, new Set(f.added))) {
      if (optOut(`${f.path}:${sec.line} «${sec.title}»`, sec.text)) continue;
      const s = scenarios(sec.text);
      if (!s.length) problems.push(`${f.path}:${sec.line} «${sec.title}»: новый раздел без сценариев «С1. ДАНО … КОГДА … ТОГДА …» (или пометка <!-- без сценариев: причина -->)`);
      found.push(...s);
    }
  }
  const tests = files.filter((f) => f.status === "A" && TEST.test(f.path) && f.text != null);
  if (found.length && tests.length && !tests.some((t) => /(?:^|[^\p{L}\p{N}])[СC]\d+(?![\p{L}\p{N}])/u.test(t.text))) {
    problems.push(`новые тесты (${tests.map((t) => t.path).join(", ")}) не называют ни одного сценария «С<n>» из спеки — номер сценария в названии теста (story-map §7 п.9)`);
  }
  return { ok: problems.length === 0, problems, found, skipped };
}

/** the added line numbers (after) of one file from `git diff -U0` output */
function addedLines(diff) {
  const out = [];
  for (const m of String(diff).matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const n = m[2] === undefined ? 1 : Number(m[2]);
    for (let i = 0; i < n; i++) out.push(start + i);
  }
  return out;
}

module.exports = { decide, scenarios, addedSections, addedLines, SPEC, TEST };

if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 << 20 });
  const base = process.env.BASE_SHA;
  const head = process.env.HEAD_SHA || "HEAD";
  if (!base) { console.log("skipped: no BASE_SHA (not a pull request)"); process.exit(0); }
  const from = git("merge-base", base, head).trim();
  const files = git("diff", "--name-status", "--no-renames", from, head).split("\n").filter(Boolean).map((l) => {
    const [status, path] = l.split("\t");
    const s = status[0];
    if (s === "D" || !(SPEC.test(path) || TEST.test(path))) return { path, status: s, text: null, added: [] };
    return { path, status: s, text: git("show", `${head}:${path}`), added: addedLines(git("diff", "-U0", from, head, "--", path)) };
  });
  const res = decide(files);
  for (const x of res.skipped) console.log(`::notice::без сценариев — ${x}`);
  if (res.ok) { console.log(`ok: сценарии ${res.found.length ? res.found.map((n) => `С${n}`).join(", ") : "— (новых разделов спек нет)"}`); process.exit(0); }
  for (const p of res.problems) console.log(`::error::${p}`);
  process.exit(1);
}
