/**
 * Which e2e a Checks run does (rule 26 stop of 18.11: 9 PRs × the full matrix held every runner, merging waited over an hour).
 * - push to main, the nightly run, a manual run, and a PR labelled «к-влитию»: the FULL matrix — every spec at all 3 widths ×
 *   2 themes, each view in 2 parts.
 * - a PR without the label: only the specs the PR added or changed (e2e/specs/*.cjs), at all 6 views in ONE job
 *   (run.cjs --all-layouts); none changed — no e2e at all. A changed e2e helper (e2e/*.cjs outside specs/: run.cjs, helpers)
 *   reaches every spec, so it gets the full matrix. Types, unit and database tests run as always.
 * The lead merges only after the full run: putting the label on starts it (pull_request «labeled»).
 * - a DRAFT PR without the label (#3117 А): no e2e and no iOS/Android bundle at all — only the quick checks (pause, fast,
 *   numbers, rule22, scenarios). «Ready for review» (pull_request «ready_for_review») starts the usual run; the label still
 *   starts the full matrix, draft or not.
 * `decide` is pure; the CLI part reads the diff and the PR's labels NOW (a re-run keeps the old payload, see pipelinePause #1253).
 */
const MERGE_LABEL = "к-влитию";
const ALL_VIEWS = ["390-dark", "390-light", "820-dark", "820-light", "1280-dark", "1280-light"];
const SPEC_RE = /^apps\/mobile\/e2e\/specs\/([\w.-]+\.cjs)$/;
const HELPER_RE = /^apps\/mobile\/e2e\/[\w.-]+\.cjs$/;

/** a changed e2e helper (e2e/*.cjs, not a spec) among the paths */
function helperChanged(paths) {
  return (Array.isArray(paths) ? paths : []).some((p) => HELPER_RE.test(String(p).trim()));
}

/** the spec files (basenames) among the PR's added / changed / renamed paths */
function specsFrom(paths) {
  return [...new Set((Array.isArray(paths) ? paths : []).map((p) => SPEC_RE.exec(String(p).trim())?.[1]).filter(Boolean))].sort();
}

/**
 * @param {{event: string, labels: string[], changedSpecs: string[] | null, helper?: boolean, draft?: boolean}} a  changedSpecs
 *   null = the diff is unknown; helper = an e2e helper changed; draft = the PR is a draft now
 * @returns {{mode: "full" | "changed" | "none", views: string[], parts: number[], specs: string[], draft: boolean, message: string}}
 *   draft true = a draft without the label: e2e and the bundle are skipped (checks.yml reads it as green)
 */
function decide({ event, labels, changedSpecs, helper = false, draft = false }) {
  const full = (why) => ({ mode: "full", views: ALL_VIEWS, parts: [1, 2], specs: [], draft: false, message: `full e2e matrix: ${why}` });
  if (event !== "pull_request") return full(`«${event}»`);
  if ((labels || []).includes(MERGE_LABEL)) return full(`label «${MERGE_LABEL}»`);
  if (draft === true) return { mode: "none", views: [], parts: [], specs: [], draft: true, message: "draft PR: no e2e and no bundle until «Ready for review» or the label «" + MERGE_LABEL + "»" };
  if (changedSpecs == null) return full("the PR's diff could not be read");
  if (helper) return full("an e2e helper changed (it reaches every spec)");
  const specs = specsFrom(changedSpecs.map((s) => (s.includes("/") ? s : `apps/mobile/e2e/specs/${s}`)));
  if (!specs.length) return { mode: "none", views: [], parts: [], specs, draft: false, message: `no spec changed: e2e skipped until the label «${MERGE_LABEL}»` };
  return { mode: "changed", views: ["all"], parts: [1], specs, draft: false, message: `only the PR's specs at all 6 views: ${specs.join(" ")} (full matrix after the label «${MERGE_LABEL}»)` };
}

module.exports = { MERGE_LABEL, ALL_VIEWS, specsFrom, helperChanged, decide };

if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const fs = require("node:fs");
  const env = process.env;
  const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  let labels = String(env.PR_LABELS || "").split(",").map((s) => s.trim()).filter(Boolean);
  let changedSpecs = null;
  let helper = false;
  let draft = env.PR_DRAFT === "true";
  if (env.EVENT_NAME === "pull_request") {
    // the labels and the draft state the PR has NOW (a removed label counts as removed, «ready for review» as not a draft);
    // the payload only when GitHub cannot be read
    try {
      const pr = JSON.parse(sh("gh", ["api", `repos/${env.GITHUB_REPOSITORY}/pulls/${env.PR_NUMBER}`, "--jq", "{labels: [.labels[].name], draft: .draft}"]));
      labels = pr.labels.map((s) => String(s).trim()).filter(Boolean);
      draft = pr.draft === true;
    } catch { /* the payload's labels and draft */ }
    // the PR's own changes: from the merge-base of its head (main moving on adds nothing here)
    try {
      const paths = sh("git", ["diff", "--name-only", "--diff-filter=AMR", `${env.BASE_SHA}...${env.PR_HEAD_SHA}`]).split("\n");
      changedSpecs = specsFrom(paths);
      helper = helperChanged(paths);
    } catch { changedSpecs = null; }
  }
  const r = decide({ event: env.EVENT_NAME || "", labels, changedSpecs, helper, draft });
  console.log(r.message);
  const out = [`mode=${r.mode}`, `draft=${r.draft}`, `views=${JSON.stringify(r.views)}`, `parts=${JSON.stringify(r.parts)}`, `specs=${r.specs.join(" ")}`];
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, out.join("\n") + "\n");
  else console.log(out.join("\n"));
}
