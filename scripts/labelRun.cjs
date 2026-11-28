/**
 * A label other than «к-влитию» does not start the full Checks run (#3130, #3117): the stand puts «стенд» and «принято» on
 * PRs often, and every «labeled» event started all the jobs again (it waits behind the run in progress, #2480, and is not
 * cancelled). Such a «light» run does no work: its «checks» repeats the conclusion of the last finished «checks» of the same
 * commit, so a green light run can never hide a red full one (no finished run → red).
 * Not light: the label «к-влитию» itself, and any label put on a PR that has «к-влитию» (its full run must not be replaced by
 * a light one in the pending slot of the group). `isLight` and `reflect` are pure (apps/mobile/test/labelRun.test.ts).
 *   node scripts/labelRun.cjs light     (job pause)  → light=true|false
 *   node scripts/labelRun.cjs reflect   (job checks) → exit 0 only when the last finished «checks» of the commit is green
 */
const { MERGE_LABEL } = require("./e2eScope.cjs");

/** @param {{event: string, action?: string, label?: string, labels?: string[]}} a */
function isLight({ event, action, label, labels = [] }) {
  if (event !== "pull_request" || action !== "labeled") return false;
  if (!label || label === MERGE_LABEL) return false;
  return !(labels || []).includes(MERGE_LABEL);
}

/** the run id in a check run's details_url (…/actions/runs/<id>/job/<job>) */
const runIdOf = (cr) => String(cr?.details_url || cr?.html_url || "").match(/\/actions\/runs\/(\d+)/)?.[1] || "";

/**
 * @param {Array<{name: string, status: string, conclusion: string | null, completed_at?: string | null, details_url?: string}>} checkRuns
 * @param {string} ownRunId
 * @returns {{ok: boolean, message: string}}
 */
function reflect(checkRuns, ownRunId) {
  const done = (Array.isArray(checkRuns) ? checkRuns : [])
    .filter((c) => c && c.name === "checks" && c.status === "completed" && runIdOf(c) !== String(ownRunId))
    .sort((a, b) => String(b.completed_at || "").localeCompare(String(a.completed_at || "")));
  if (!done.length) return { ok: false, message: "лёгкий прогон (ярлык не «к-влитию»): на этом коммите нет законченного прогона checks — красный, пока его нет (перезапустите Checks или сделайте пуш)" };
  const last = done[0];
  if (last.conclusion === "success") return { ok: true, message: `лёгкий прогон (ярлык не «к-влитию»): повторяет зелёный checks прогона ${runIdOf(last)}` };
  return { ok: false, message: `лёгкий прогон (ярлык не «к-влитию»): последний checks этого коммита — ${last.conclusion} (прогон ${runIdOf(last)})` };
}

module.exports = { isLight, reflect, runIdOf };

if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const fs = require("node:fs");
  const env = process.env;
  const gh = (a) => execFileSync("gh", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const cmd = process.argv[2];
  if (cmd === "light") {
    let labels = String(env.PR_LABELS || "").split(",").map((s) => s.trim()).filter(Boolean);
    // the labels the PR has NOW (a «к-влитию» put on meanwhile counts)
    try { labels = gh(["api", `repos/${env.GITHUB_REPOSITORY}/pulls/${env.PR_NUMBER}`, "--jq", ".labels[].name"]).split("\n").map((s) => s.trim()).filter(Boolean); } catch { /* the payload */ }
    const light = isLight({ event: env.EVENT_NAME, action: env.ACTION, label: env.LABEL, labels });
    console.log(light ? `light run: label «${env.LABEL}» is not «${MERGE_LABEL}» — no jobs, «checks» repeats the last result of this commit` : "a full run");
    if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `light=${light}\n`);
  } else if (cmd === "reflect") {
    if (!/^[0-9a-f]{40}$/.test(env.HEAD_SHA || "")) { console.error("bad commit"); process.exit(1); }
    const runs = gh(["api", `repos/${env.GITHUB_REPOSITORY}/commits/${env.HEAD_SHA}/check-runs?check_name=checks&filter=all&per_page=100`, "--paginate",
      "--jq", ".check_runs[] | {name, status, conclusion, completed_at, details_url} | @json"]).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    const r = reflect(runs, env.GITHUB_RUN_ID);
    console.log(r.message);
    if (!r.ok) { console.log(`::error::${r.message}`); process.exit(1); }
  } else { console.error("usage: labelRun.cjs light|reflect"); process.exit(2); }
}
