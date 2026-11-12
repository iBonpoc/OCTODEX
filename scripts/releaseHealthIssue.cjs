/**
 * Daily release health (#1143, the stop #1141: SUPABASE_ACCESS_TOKEN was refused and releases silently stopped for 7 hours).
 * Two checks, each keeps ONE open task with the label «остановка» while it fails and closes it when it passes again:
 *   1) the Supabase key: `supabase projects list` with the secret and our project in it (the workflow only says ok / not);
 *   2) the last Release on main: a failed run (not a skipped one — the gate skips docs-only pushes).
 * Never prints a secret: it gets only «ok / refused» and the run's number and link. `decide` is pure (test/releaseHealth).
 */
const LABEL = "остановка";
const CHECKS = {
  key: {
    title: "Ключ Supabase отклонён — выпуск остановится (ежедневная проверка)",
    body: (x) =>
      `Ежедневная проверка (#1143): \`supabase projects list\` с секретом \`SUPABASE_ACCESS_TOKEN\` не прошла, или проекта в списке нет. ` +
      `Выпуск (release.yml) не сможет применить миграции и опубликовать сборку. Заменить ключ: Settings → Secrets and variables → Actions ` +
      `(ключ — на supabase.com, Account → Access Tokens). Разбор остановки — по docs/ai/DIRECTOR.md «Остановка работы». Прогон: ${x.runUrl}`,
  },
  release: {
    title: "Выпуск на main упал (ежедневная проверка)",
    body: (x) =>
      `Ежедневная проверка (#1143): последний прогон Release на main — ${x.release.conclusion}: ${x.release.url}. ` +
      `Сборки до телефонов не доходят, пока выпуск не пройдёт. Разбор остановки — по docs/ai/DIRECTOR.md «Остановка работы». Прогон проверки: ${x.runUrl}`,
  },
};

/** a release run that stopped the release (a skipped one is the gate saying «nothing to release», a cancelled one gave way to a newer run) */
const releaseFailed = (r) => !!r && (r.conclusion === "failure" || r.conclusion === "timed_out" || r.conclusion === "startup_failure");

/**
 * @param {{ keyOk: boolean, release: {conclusion: string, url: string} | null, open: {key: number | null, release: number | null} }} x
 * @returns {{ key: "create"|"comment"|"close"|"none", release: "create"|"comment"|"close"|"none" }}
 */
function decide(x) {
  const one = (bad, open) => (bad ? (open ? "comment" : "create") : open ? "close" : "none");
  return { key: one(!x.keyOk, x.open.key), release: one(releaseFailed(x.release), x.open.release) };
}
module.exports = { LABEL, CHECKS, decide, releaseFailed };

if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const gh = (a) => execFileSync("gh", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const repo = process.env.GITHUB_REPOSITORY;
  const runUrl = process.env.RUN_URL || "";
  const keyOk = process.env.KEY_OK === "true";
  const runs = JSON.parse(gh(["run", "list", "-R", repo, "--workflow", "release.yml", "--branch", "main", "--limit", "10", "--json", "conclusion,status,url,databaseId"]) || "[]");
  // the newest finished run that did something (a skipped gate says nothing about the release)
  const last = runs.find((r) => r.status === "completed" && r.conclusion !== "skipped") || null;
  const openOf = (title) => {
    const found = JSON.parse(gh(["issue", "list", "-R", repo, "--state", "open", "--label", LABEL, "--search", `"${title}" in:title`, "--json", "number,title"]) || "[]").find((i) => i.title === title);
    return found ? found.number : null;
  };
  const open = { key: openOf(CHECKS.key.title), release: openOf(CHECKS.release.title) };
  const actions = decide({ keyOk, release: last, open });
  for (const k of ["key", "release"]) {
    const c = CHECKS[k];
    const n = open[k];
    const a = actions[k];
    if (a === "create") gh(["issue", "create", "-R", repo, "--title", c.title, "--label", LABEL, "--body", c.body({ runUrl, release: last })]);
    if (a === "comment") gh(["issue", "comment", String(n), "-R", repo, "--body", `Всё ещё не прошло: ${runUrl}`]);
    if (a === "close") {
      gh(["issue", "comment", String(n), "-R", repo, "--body", `Снова в порядке: ${runUrl}`]);
      gh(["issue", "close", String(n), "-R", repo, "--reason", "completed"]);
    }
  }
  console.log(`release health: key=${keyOk ? "ok" : "refused"} → ${actions.key}; release=${last ? last.conclusion : "none"} → ${actions.release}`);
  // red when something is wrong: the run itself shows it too (the task is opened first)
  if (!keyOk || releaseFailed(last)) process.exit(1);
}
