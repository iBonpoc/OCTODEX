/**
 * «Did this PR change dependencies?» (#1074). `npx expo install --check` compares with versions fetched from Expo's network, so
 * an Expo patch release turns EVERY PR red without any change of ours. It stays red only when the PR itself touches the
 * dependency files (then the difference is ours); otherwise it is a warning, and scripts/expoPatches daily run opens the task.
 * The PR's own change is measured from the MERGE-BASE of the PR head (not from the base tip of the moment): main moving on
 * after the PR was opened must not turn the answer. Not a pull request (push to main, nightly, manual) → false (warning only).
 */
const DEP_FILE = /^(?:package\.json|package-lock\.json|(?:apps|packages)\/[^/]+\/package\.json)$/;

/** @param {string[]} files changed paths (a rename lists both names) -> boolean */
function depsChanged(files) {
  return files.some((f) => DEP_FILE.test(f));
}

module.exports = { DEP_FILE, depsChanged };

if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const git = (...a) => execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const { EVENT_NAME, BASE_SHA, HEAD_SHA, GITHUB_OUTPUT } = process.env;
  let value;
  if (EVENT_NAME !== "pull_request") value = false;
  else {
    try {
      const mb = git("merge-base", BASE_SHA, HEAD_SHA);
      value = depsChanged(git("diff", "--name-only", mb, HEAD_SHA).split("\n").filter(Boolean));
    } catch {
      value = true; // cannot tell → the strict side (red on a real mismatch)
    }
  }
  console.log(`deps=${value}`);
  if (GITHUB_OUTPUT) require("node:fs").appendFileSync(GITHUB_OUTPUT, `deps=${value}\n`);
}
