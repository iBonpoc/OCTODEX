/**
 * Store-build gate (#1004, audit condition for #906 п.6): a build for TestFlight / the store goes only from a commit on which the
 * FULL Checks run (all 6 views: the nightly run or a manual «Run workflow») is green. A push to main runs only 390-dark,
 * a PR three views; neither proves the other widths and the light theme. `decide` is pure; the CLI part reads the runs of
 * checks.yml for the commit (REST, GITHUB_TOKEN with actions: read) and exits 1 with what to do.
 */
const FULL_EVENTS = ["schedule", "workflow_dispatch"];

const MAIN = "main";

/**
 * runs: [{ event, conclusion, head_sha, head_branch, head_repository: { full_name } }] of checks.yml; sha: the commit to build;
 * ref: the ref the build was started from; repo: owner/name. Only runs of main in this repository count: a full run started by
 * hand on another branch has the same sha as a build started from that branch, and proves nothing about main (review of #1052).
 */
function decide(runs, sha, { ref = `refs/heads/${MAIN}`, repo } = {}) {
  const how = "Actions → Checks → Run workflow (branch main) — wait for the green «checks», then run this build again (все 6 видов, ~25 мин).";
  if (ref !== `refs/heads/${MAIN}`) return { ok: false, message: `Сборка для магазина только с ветки main, а запущена с ${ref}. Actions → EAS build → Run workflow → Use workflow from: main.` };
  const ofMain = runs.filter((r) => r.head_branch === MAIN && (!repo || r.head_repository?.full_name === repo));
  const ofCommit = ofMain.filter((r) => r.head_sha === sha);
  const full = ofCommit.filter((r) => FULL_EVENTS.includes(r.event));
  const green = full.find((r) => r.conclusion === "success");
  if (green) return { ok: true, message: `the full Checks run is green on ${sha.slice(0, 7)} (${green.event})` };
  if (full.length) return { ok: false, message: `Сборка для магазина только с коммита с зелёным ПОЛНЫМ прогоном 6 видов: на ${sha.slice(0, 7)} полный прогон есть, но он ${full.map((r) => r.conclusion || "ещё идёт").join(", ")}. ${how}` };
  if (ofCommit.length) return { ok: false, message: `Сборка для магазина только с коммита с зелёным ПОЛНЫМ прогоном 6 видов: на ${sha.slice(0, 7)} были только прогоны PR/push (${[...new Set(ofCommit.map((r) => r.event))].join(", ")}) — они проверяют не все виды. ${how}` };
  return { ok: false, message: `Сборка для магазина только с коммита с зелёным ПОЛНЫМ прогоном 6 видов: на ${sha.slice(0, 7)} прогонов Checks нет. ${how}` };
}

/** `gh api --paginate --slurp` prints a JSON array of pages, each page {workflow_runs: […]} — one flat list of runs */
function runsFromPages(json) {
  return JSON.parse(json).flatMap((page) => page.workflow_runs ?? []);
}

module.exports = { FULL_EVENTS, MAIN, decide, runsFromPages };

if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.SHA;
  if (!repo || !sha) { console.error("GITHUB_REPOSITORY and SHA are required"); process.exit(2); }
  let runs;
  try {
    const out = execFileSync("gh", ["api", "--paginate", "--slurp", `repos/${repo}/actions/workflows/checks.yml/runs?head_sha=${sha}&per_page=100`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    runs = runsFromPages(out);
  } catch (e) {
    console.log(`::error::Не удалось прочитать прогоны Checks для ${sha.slice(0, 7)} (GitHub API): ${String((e && (e.stderr || e.message)) || e).trim().split("\n")[0]}. Запустите сборку ещё раз через минуту; если повторится — сообщите руководителю.`);
    process.exit(1);
  }
  const res = decide(runs, sha, { ref: process.env.REF || "", repo });
  if (res.ok) console.log(res.message);
  else { console.log(`::error::${res.message}`); process.exit(1); }
}
