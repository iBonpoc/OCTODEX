/**
 * «Pipeline pause» (#1087, rule 26): while a task labelled «остановка» is open, a pull request without the label
 * «починка» is stopped in seconds with a plain text — its heavy jobs do not take runners. Closing the stop (or labelling the
 * PR «починка») lets scripts/pipelineResume.cjs re-run it. `decide` is pure; the CLI part reads the open stops from GitHub.
 * Only pull_request runs are paused: push to main, the nightly run and a manual run never are (a fix that has been merged
 * must still be checked on main). If GitHub cannot be read the pipeline is NOT paused (a stop must not come from a blip).
 */
const STOP_LABEL = "остановка";
const FIX_LABEL = "починка";

/** @param {{event: string, prLabels: string[], stops: {number: number, title?: string}[]}} a -> {pause: boolean, message: string} */
function decide({ event, prLabels, stops }) {
  if (event !== "pull_request") return { pause: false, message: `no pause for «${event}»` };
  if (prLabels.includes(FIX_LABEL)) return { pause: false, message: `label «${FIX_LABEL}»: the PR is a fix, it runs` };
  if (!Array.isArray(stops) || stops.length === 0) return { pause: false, message: "no open stop" };
  const list = stops.map((s) => `#${s.number}`).join(", ");
  return { pause: true, message: `пауза: остановка ${list} — прогон не запущен, раннеры свободны. Поправка остановки получает метку «${FIX_LABEL}»; закрыли остановку — прогон перезапустится сам.` };
}

/** the open stops from the issues API list (it holds pull requests too — they are not stops) */
function stopsFrom(list) {
  return (Array.isArray(list) ? list : []).filter((i) => i && !i.pull_request).map((i) => ({ number: i.number, title: i.title }));
}

/** the live label list when it is an array of {name}; otherwise the fallback (a broken answer must not drop «починка») */
function liveLabels(list, fallback) {
  return Array.isArray(list) ? list.map((l) => (typeof l === "string" ? l : l && l.name)).filter(Boolean) : fallback;
}

module.exports = { STOP_LABEL, FIX_LABEL, decide, stopsFrom, liveLabels };

if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const repo = process.env.GITHUB_REPOSITORY;
  try {
    const out = execFileSync("gh", ["api", "-X", "GET", `repos/${repo}/issues`, "-f", `labels=${STOP_LABEL}`, "-f", "state=open", "-f", "per_page=100"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const stops = stopsFrom(JSON.parse(out || "[]"));
    // The labels are read LIVE: the event carries the labels of the moment the PR was opened/pushed, but «починка» is often added
    // a minute later, while the run waits for a runner (probe #1129: the run stayed red after the label). PR_LABELS is the fallback.
    let prLabels = (process.env.PR_LABELS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (process.env.PR_NUMBER) {
      try {
        const live = JSON.parse(execFileSync("gh", ["api", `repos/${repo}/issues/${process.env.PR_NUMBER}/labels`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) || "[]");
        prLabels = liveLabels(live, prLabels);
      } catch { /* keep the event's labels */ }
    }
    const res = decide({ event: process.env.EVENT_NAME || "", prLabels, stops });
    if (!res.pause) { console.log(res.message); process.exit(0); }
    console.log(`::error::${res.message}`);
    process.exit(1);
  } catch (e) {
    console.log(`::warning::pipeline pause: stops could not be read (${String(e.stderr || e.message).split("\n")[0]}) — not paused`);
    process.exit(0);
  }
}
