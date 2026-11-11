/**
 * Store-build gate (#1004, audit condition for #906 п.6): a build for TestFlight / the store goes only from a commit on which the
 * FULL Checks run (all 6 views: the nightly run or a manual «Run workflow») is green. A push to main runs only 390-dark,
 * a PR three views; neither proves the other widths and the light theme. `decide` is pure; the CLI part reads the runs of
 * checks.yml for the commit (REST, GITHUB_TOKEN with actions: read) and exits 1 with what to do.
 */
const FULL_EVENTS = ["schedule", "workflow_dispatch"];

/** runs: [{ event, conclusion, head_sha, html_url? }] of checks.yml; sha: the commit to build */
function decide(runs, sha) {
  const ofCommit = runs.filter((r) => r.head_sha === sha);
  const full = ofCommit.filter((r) => FULL_EVENTS.includes(r.event));
  const green = full.find((r) => r.conclusion === "success");
  if (green) return { ok: true, message: `the full Checks run is green on ${sha.slice(0, 7)} (${green.event})` };
  const how = "Actions → Checks → Run workflow (branch main) — wait for the green «checks», then run this build again (все 6 видов, ~25 мин).";
  if (full.length) return { ok: false, message: `Сборка для магазина только с коммита с зелёным ПОЛНЫМ прогоном 6 видов: на ${sha.slice(0, 7)} полный прогон есть, но он ${full.map((r) => r.conclusion || "ещё идёт").join(", ")}. ${how}` };
  if (ofCommit.length) return { ok: false, message: `Сборка для магазина только с коммита с зелёным ПОЛНЫМ прогоном 6 видов: на ${sha.slice(0, 7)} были только прогоны PR/push (${[...new Set(ofCommit.map((r) => r.event))].join(", ")}) — они проверяют не все виды. ${how}` };
  return { ok: false, message: `Сборка для магазина только с коммита с зелёным ПОЛНЫМ прогоном 6 видов: на ${sha.slice(0, 7)} прогонов Checks нет. ${how}` };
}

/** `gh api --paginate --slurp` prints a JSON array of pages, each page {workflow_runs: […]} — one flat list of runs */
function runsFromPages(json) {
  return JSON.parse(json).flatMap((page) => page.workflow_runs ?? []);
}

module.exports = { FULL_EVENTS, decide, runsFromPages };

if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.SHA;
  if (!repo || !sha) { console.error("GITHUB_REPOSITORY and SHA are required"); process.exit(2); }
  const out = execFileSync("gh", ["api", "--paginate", "--slurp", `repos/${repo}/actions/workflows/checks.yml/runs?head_sha=${sha}&per_page=100`], { encoding: "utf8" });
  const runs = runsFromPages(out);
  const res = decide(runs, sha);
  if (res.ok) console.log(res.message);
  else { console.log(`::error::${res.message}`); process.exit(1); }
}
