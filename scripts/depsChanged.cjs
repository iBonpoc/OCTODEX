/**
 * «Did this PR change dependencies?» (#1074). `npx expo install --check` compares with versions fetched from Expo's network, so
 * an Expo patch release turns EVERY PR red without any change of ours. It stays red only when the PR itself touches the
 * dependency files (then the difference is ours); otherwise it is a warning, and scripts/expoPatches daily run opens the task.
 * The PR's own change is measured from the MERGE-BASE of the PR head (not from the base tip of the moment): main moving on
 * after the PR was opened must not turn the answer. Not a pull request (push to main, nightly, manual) → false (warning only).
 * #2945: a package.json counts only when one of its DEP_FIELDS differs between the merge-base and the head (a change of
 * "scripts" or "description" is not a dependency change); package-lock.json counts as before. Cannot compare → true.
 */
const DEP_FILE = /^(?:package\.json|package-lock\.json|(?:apps|packages)\/[^/]+\/package\.json)$/;

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "overrides", "resolutions"];

/** @param {string | null} before @param {string | null} after package.json texts (null = absent) -> boolean */
function depFieldsDiffer(before, after) {
  try {
    if (before == null || after == null) return true;
    const a = JSON.parse(before);
    const b = JSON.parse(after);
    return DEP_FIELDS.some((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));
  } catch {
    return true; // cannot compare → the strict side
  }
}

/**
 * @param {string[]} files changed paths (a rename lists both names)
 * @param {(file: string) => { before: string | null, after: string | null }} [read] the file at the merge-base and the head;
 *   without it every package.json counts (strict)
 * -> boolean
 */
function depsChanged(files, read) {
  return files.some((f) => {
    if (!DEP_FILE.test(f)) return false;
    if (!f.endsWith("/package.json") && f !== "package.json") return true; // package-lock.json
    if (!read) return true;
    try {
      const { before, after } = read(f);
      return depFieldsDiffer(before, after);
    } catch {
      return true;
    }
  });
}

module.exports = { DEP_FILE, DEP_FIELDS, depFieldsDiffer, depsChanged };

if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const git = (...a) => execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const { EVENT_NAME, BASE_SHA, HEAD_SHA, GITHUB_OUTPUT } = process.env;
  let value;
  if (EVENT_NAME !== "pull_request") value = false;
  else {
    try {
      const mb = git("merge-base", BASE_SHA, HEAD_SHA);
      const show = (rev, f) => {
        try {
          return execFileSync("git", ["show", `${rev}:${f}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        } catch {
          return null; // absent on that side
        }
      };
      const files = git("diff", "--name-only", mb, HEAD_SHA).split("\n").filter(Boolean);
      value = depsChanged(files, (f) => ({ before: show(mb, f), after: show(HEAD_SHA, f) }));
    } catch {
      value = true; // cannot tell → the strict side (red on a real mismatch)
    }
  }
  console.log(`deps=${value}`);
  if (GITHUB_OUTPUT) require("node:fs").appendFileSync(GITHUB_OUTPUT, `deps=${value}\n`);
}
