/**
 * Re-run the pull requests that the pipeline pause stopped (#1087). Called when a stop is closed/unlabelled or a PR gets the
 * label «починка». One run at a time, oldest PR first. A run is picked only when its «checks» run FAILED and the job «pause»
 * failed in it (never a run that failed on a real test). `pickRuns` is pure.
 */
/** @param {{prs: {number: number, runs: {id: number, conclusion: string, headSha: string, pauseFailed: boolean}[]}[], prHeads: Record<number,string>}} a -> run ids */
function pickRuns({ prs, prHeads }) {
  const ids = [];
  for (const pr of [...prs].sort((a, b) => a.number - b.number)) {
    const latest = pr.runs.filter((r) => r.headSha === prHeads[pr.number]).sort((a, b) => b.id - a.id)[0];
    if (latest && latest.conclusion === "failure" && latest.pauseFailed) ids.push(latest.id);
  }
  return ids;
}
module.exports = { pickRuns };

if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const repo = process.env.GITHUB_REPOSITORY;
  const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const api = (p, extra = []) => JSON.parse(gh(["api", "-X", "GET", ...extra, p]) || "null");
  const only = process.env.ONLY_PR ? Number(process.env.ONLY_PR) : null;
  const stops = api(`repos/${repo}/issues`, ["-f", "labels=остановка", "-f", "state=open", "-f", "per_page=100"]).filter((i) => !i.pull_request);
  const prsApi = api(`repos/${repo}/pulls`, ["-f", "state=open", "-f", "per_page=100"]).filter((p) => !only || p.number === only);
  const prs = [];
  const prHeads = {};
  for (const p of prsApi) {
    prHeads[p.number] = p.head.sha;
    if (stops.length && !p.labels.some((l) => l.name === "починка")) continue; // still paused: re-running would just pause again
    const runs = api(`repos/${repo}/actions/workflows/checks.yml/runs`, ["-f", `head_sha=${p.head.sha}`, "-f", "event=pull_request", "-f", "per_page=5"]).workflow_runs ?? [];
    const rows = [];
    for (const r of runs) {
      const jobs = api(`repos/${repo}/actions/runs/${r.id}/jobs`, ["-f", "per_page=100"]).jobs ?? [];
      rows.push({ id: r.id, conclusion: r.conclusion, headSha: r.head_sha, pauseFailed: jobs.some((j) => j.name === "Pipeline pause" && j.conclusion === "failure") });
    }
    prs.push({ number: p.number, runs: rows });
  }
  for (const id of pickRuns({ prs, prHeads })) {
    console.log(`re-running run ${id}`);
    gh(["run", "rerun", String(id), "--failed", "-R", repo]);
  }
}
