/**
 * A new push to a PR takes off the label «принято» (#3117 В, #3121): the founder accepted one commit, the new one he has not seen.
 * accepted-reset.yml runs this on pull_request «synchronize». The line «принято снято: новый пуш <SHA>» goes into a marked block
 * at the end of the PR description, not a comment: editing the body sends no e-mail (the founder, 05.11.2026, preview.yml).
 * `withLine` is pure (tested in apps/mobile/test/acceptedReset.test.ts); the CLI reads the PR live and does nothing without the label.
 */
const LABEL = "принято";
const START = "<!-- octodex-accepted -->";
const END = "<!-- /octodex-accepted -->";
const KEEP = 10; // the block keeps the last lines only

/** The body with the line «принято снято: новый пуш <sha7>» added to the marked block (made when missing). */
function withLine(body, sha, at) {
  const line = `- принято снято: новый пуш \`${String(sha).slice(0, 7)}\` (${at})`;
  const old = String(body || "");
  const re = new RegExp(`${START}[\\s\\S]*?${END}`);
  const m = old.match(re);
  const prev = m ? m[0].split("\n").filter((l) => l.startsWith("- ")) : [];
  if (prev.includes(line)) return old;
  const lines = [...prev, line].slice(-KEEP);
  const block = `${START}\n### Ярлык «${LABEL}»\n${lines.join("\n")}\n\nПринять заново — снова повесить «${LABEL}» на этот пуш.\n${END}`;
  return m ? old.replace(re, block) : `${old}${old ? "\n\n" : ""}${block}`;
}

module.exports = { LABEL, START, END, withLine };

if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const fs = require("node:fs");
  const env = process.env;
  const gh = (a) => execFileSync("gh", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (!/^\d+$/.test(env.PR || "") || !/^[0-9a-f]{40}$/.test(env.HEAD_SHA || "")) { console.error("bad PR or commit"); process.exit(1); }
  const pr = JSON.parse(gh(["api", `repos/${env.GITHUB_REPOSITORY}/pulls/${env.PR}`, "--jq", "{labels: [.labels[].name], body, head: .head.sha}"]));
  if (!pr.labels.includes(LABEL)) { console.log(`#${env.PR}: no «${LABEL}» — nothing to take off`); process.exit(0); }
  gh(["api", "-X", "DELETE", `repos/${env.GITHUB_REPOSITORY}/issues/${env.PR}/labels/${encodeURIComponent(LABEL)}`]);
  fs.writeFileSync("accepted-body.md", withLine(pr.body, env.HEAD_SHA, new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"));
  gh(["api", "-X", "PATCH", `repos/${env.GITHUB_REPOSITORY}/pulls/${env.PR}`, "-F", "body=@accepted-body.md"]);
  console.log(`#${env.PR}: «${LABEL}» taken off, new push ${env.HEAD_SHA.slice(0, 7)}`);
}
