/**
 * Which e2e a Checks run does (rule 26 stop of 18.11: 9 PRs × the full matrix held every runner, merging waited over an hour).
 * - push to main, the nightly run, a manual run, and a PR labelled «к-влитию»: the FULL matrix — every spec at all 3 widths ×
 *   2 themes, each view in 2 parts.
 * - a PR without the label: only the specs the PR added or changed (e2e/specs/*.cjs), at all 6 views in ONE job
 *   (run.cjs --all-layouts); none changed — no e2e at all. A changed e2e helper (e2e/*.cjs outside specs/: run.cjs, helpers)
 *   reaches every spec, so it gets the full matrix. Types, unit and database tests run as always.
 * The lead merges only after the full run: putting the label on starts it (pull_request «labeled»).
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
 * @param {{event: string, labels: string[], changedSpecs: string[] | null, helper?: boolean}} a  changedSpecs null = the diff
 *   is unknown; helper = an e2e helper changed
 * @returns {{mode: "full" | "changed" | "none", views: string[], parts: number[], specs: string[], message: string}}
 */
function decide({ event, labels, changedSpecs, helper = false }) {
  const full = (why) => ({ mode: "full", views: ALL_VIEWS, parts: [1, 2], specs: [], message: `full e2e matrix: ${why}` });
  if (event !== "pull_request") return full(`«${event}»`);
  if ((labels || []).includes(MERGE_LABEL)) return full(`label «${MERGE_LABEL}»`);
  if (changedSpecs == null) return full("the PR's diff could not be read");
  if (helper) return full("an e2e helper changed (it reaches every spec)");
  const specs = specsFrom(changedSpecs.map((s) => (s.includes("/") ? s : `apps/mobile/e2e/specs/${s}`)));
  if (!specs.length) return { mode: "none", views: [], parts: [], specs, message: `no spec changed: e2e skipped until the label «${MERGE_LABEL}»` };
  return { mode: "changed", views: ["all"], parts: [1], specs, message: `only the PR's specs at all 6 views: ${specs.join(" ")} (full matrix after the label «${MERGE_LABEL}»)` };
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
  if (env.EVENT_NAME === "pull_request") {
    // the labels the PR has NOW (a removed label counts as removed); the payload only when GitHub cannot be read
    try { labels = sh("gh", ["api", `repos/${env.GITHUB_REPOSITORY}/pulls/${env.PR_NUMBER}`, "--jq", ".labels[].name"]).split("\n").map((s) => s.trim()).filter(Boolean); } catch { /* the payload's labels */ }
    // the PR's own changes: from the merge-base of its head (main moving on adds nothing here)
    try {
      const paths = sh("git", ["diff", "--name-only", "--diff-filter=AMR", `${env.BASE_SHA}...${env.PR_HEAD_SHA}`]).split("\n");
      changedSpecs = specsFrom(paths);
      helper = helperChanged(paths);
    } catch { changedSpecs = null; }
  }
  const r = decide({ event: env.EVENT_NAME || "", labels, changedSpecs, helper });
  console.log(r.message);
  const out = [`mode=${r.mode}`, `views=${JSON.stringify(r.views)}`, `parts=${JSON.stringify(r.parts)}`, `specs=${r.specs.join(" ")}`];
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, out.join("\n") + "\n");
  else console.log(out.join("\n"));
}
