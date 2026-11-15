#!/usr/bin/env node
/**
 * The build number in the header of every screen («GoRix v1.0.0 · 733 · …») is written by the build, not by a PR (#733):
 * every PR bumping BUILD made every open PR conflict after each merge and run its checks again. In the repo
 * src/config/version.ts keeps `BUILD = 0` (a local build, «dev» in the header; test/buildNumber.test.ts guards it);
 * release.yml, preview.yml and eas-build.yml run this right before they build, and it rewrites the file (not committed).
 *
 *   node scripts/setBuild.cjs <N>                       the number itself (preview: the PR's number)
 *   node scripts/setBuild.cjs "" --message "<subject>"  main: the merged PR from the commit's subject when the API gave none
 * No number → exit 1: never publish a build without one.
 */
const fs = require("node:fs");
const path = require("node:path");

const FILE = path.join(__dirname, "../src/config/version.ts");
const LINE = /^export const BUILD = \d+;$/m;

/** The PR a commit of main came from: «Merge pull request #713 from …» or the last «(#N)» of a squash subject («… (#606) (#725)» → 725). */
function buildFromMessage(subject) {
  const s = String(subject ?? "").split("\n")[0];
  const merge = s.match(/^Merge pull request #(\d+)\b/);
  if (merge) return Number(merge[1]);
  const all = [...s.matchAll(/\(#(\d+)\)/g)];
  return all.length ? Number(all[all.length - 1][1]) : null;
}

/** The number to write: the given one when it is a PR number, else from the subject, else null. */
function pickBuild(given, subject) {
  const n = /^\d+$/.test(String(given ?? "").trim()) ? Number(String(given).trim()) : null;
  if (n && n > 0) return n;
  return subject == null ? null : buildFromMessage(subject);
}

function writeBuild(n, file = FILE) {
  const src = fs.readFileSync(file, "utf8");
  if (!LINE.test(src)) throw new Error(`${file}: no «export const BUILD = <n>;» line`);
  fs.writeFileSync(file, src.replace(LINE, `export const BUILD = ${n};`));
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--message");
  const subject = i >= 0 ? args[i + 1] ?? "" : null;
  const given = args.find((a, k) => !a.startsWith("--") && !(i >= 0 && k === i + 1));
  const n = pickBuild(given, subject);
  if (!n) {
    console.error(`::error::no build number: not given (${JSON.stringify(given ?? "")}) and none in the commit subject (${JSON.stringify(subject ?? "")}) — not publishing a build without one (#733)`);
    process.exit(1);
  }
  writeBuild(n);
  console.log(`BUILD = ${n}`);
}

module.exports = { buildFromMessage, pickBuild, writeBuild };
