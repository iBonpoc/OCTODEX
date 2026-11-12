/**
 * Daily Expo check (#1074): what to do with the single task «Обновить патчи Expo». Never red, so main stays green when
 * Expo publishes patches. `decide` is pure: mismatch (the check failed), open task number or null -> action.
 */
const TITLE = "Обновить патчи Expo (ежедневная проверка)";
const LABEL = "проверки";

/** @returns {{action: "create"|"comment"|"close"|"none"}} */
function decide({ mismatch, openIssue }) {
  if (mismatch) return { action: openIssue ? "comment" : "create" };
  return { action: openIssue ? "close" : "none" };
}
module.exports = { TITLE, LABEL, decide };

if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const gh = (a) => execFileSync("gh", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const repo = process.env.GITHUB_REPOSITORY;
  const mismatch = process.env.MISMATCH === "true";
  const url = process.env.RUN_URL || "";
  const found = JSON.parse(gh(["issue", "list", "-R", repo, "--state", "open", "--label", LABEL, "--search", `"${TITLE}" in:title`, "--json", "number,title"]) || "[]").find((i) => i.title === TITLE);
  const { action } = decide({ mismatch, openIssue: found ? found.number : null });
  if (action === "create") gh(["issue", "create", "-R", repo, "--title", TITLE, "--label", LABEL, "--body", `Expo выпустил патчи SDK: \`npx expo install --check\` расходится с package.json. Выполнить \`npx expo install --fix\` в apps/mobile отдельным PR (проверка зависимостей по правилу 17, docs/ai/CHECKS.md §4). Прогон: ${url}`]);
  if (action === "comment") gh(["issue", "comment", String(found.number), "-R", repo, "--body", `Расхождение остаётся: ${url}`]);
  if (action === "close") { gh(["issue", "comment", String(found.number), "-R", repo, "--body", `Версии снова совпадают с Expo: ${url}`]); gh(["issue", "close", String(found.number), "-R", repo, "--reason", "completed"]); }
  console.log(`expo patches: mismatch=${mismatch} → ${action}`);
}
