/**
 * Daily release health (#1143, the stop #1141: SUPABASE_ACCESS_TOKEN was refused and releases silently stopped for 7 hours).
 * Two checks, each keeps ONE open task while it fails and closes it when it passes again:
 *   1) the Supabase key: `supabase projects list` with the secret and our project in it — tried 3 times 30 s apart (the
 *      workflow only says ok / not): a passing outage of the network or of Supabase is not a stop;
 *   2) the last Release on main: a failed run (not a skipped one — the gate skips docs-only pushes). A stop only when one of
 *      the release's OWN steps failed (link, migrations, functions, publish…); a run that broke on the runner (setting up,
 *      checkout, the CLI's download, or no failed step at all) gets a task «проверки», not «остановка».
 * A task «остановка» pauses the pipeline for every PR (pipelinePause): a false alarm must not freeze the work (the director).
 * Never prints a secret: it gets only «ok / refused» and the run's number and link. `decide` is pure (test/releaseHealth).
 */
const LABEL = "остановка";
/** a release that broke on the runner, not on its own step: worth a look, not a stop */
const LABEL_RUNNER = "проверки";
/** release.yml's own steps (test/releaseHealth reads release.yml: each name is there) */
const RELEASE_STEPS = [
  "Secrets are set", "Link the project", "Show pending", "Apply new migrations", "Deploy edge functions",
  "Expo token is set", "Who publishes", "Build number (the merged PR)", "Publish the Expo Go update (channel preview)",
  "Check that Expo serves the new update", "Build the web app", "Deploy the web app (production)", "Mark this commit released (tag `released`)",
];
/** «stop» — a step of the release itself failed; «runner» — anything else (set up, checkout, the CLI, no step) */
const failureKind = (failedSteps) => (failedSteps.some((n) => RELEASE_STEPS.includes(n)) ? "stop" : "runner");
const CHECKS = {
  key: {
    title: "Ключ Supabase отклонён — выпуск остановится (ежедневная проверка)",
    body: (x) =>
      `Ежедневная проверка (#1143): \`supabase projects list\` с секретом \`SUPABASE_ACCESS_TOKEN\` не прошла, или проекта в списке нет. ` +
      `Выпуск (release.yml) не сможет применить миграции и опубликовать сборку. Заменить ключ: Settings → Secrets and variables → Actions ` +
      `(ключ — на supabase.com, Account → Access Tokens). Разбор остановки — по docs/ai/DIRECTOR.md «Остановка работы». Прогон: ${x.runUrl}`,
  },
  runner: {
    title: "Выпуск на main упал не на своём шаге — сбой раннера? (ежедневная проверка)",
    body: (x) =>
      `Ежедневная проверка (#1143): последний прогон Release на main упал, но не на своём шаге (шаги: ${(x.failedSteps || []).join(", ") || "нет упавшего шага"}): ${x.release.url}. ` +
      `Скорее всего сбой раннера. Если следующий выпуск пройдёт, задача закроется сама. Прогон проверки: ${x.runUrl}`,
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
 * @param {{ keyOk: boolean, release: {conclusion: string, url: string} | null, failedSteps?: string[],
 *           open: {key: number | null, release: number | null, runner?: number | null} }} x
 * @returns {{ key: Act, release: Act, runner: Act }}  Act = "create"|"comment"|"close"|"none"
 */
function decide(x) {
  const one = (bad, open) => (bad ? (open ? "comment" : "create") : open ? "close" : "none");
  const failed = releaseFailed(x.release);
  const kind = failed ? failureKind(x.failedSteps || []) : null;
  return { key: one(!x.keyOk, x.open.key), release: one(kind === "stop", x.open.release), runner: one(kind === "runner", x.open.runner ?? null) };
}
module.exports = { LABEL, LABEL_RUNNER, RELEASE_STEPS, CHECKS, decide, releaseFailed, failureKind };

if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const gh = (a) => execFileSync("gh", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const repo = process.env.GITHUB_REPOSITORY;
  const runUrl = process.env.RUN_URL || "";
  const keyOk = process.env.KEY_OK === "true";
  const runs = JSON.parse(gh(["run", "list", "-R", repo, "--workflow", "release.yml", "--branch", "main", "--limit", "10", "--json", "conclusion,status,url,databaseId"]) || "[]");
  // the newest finished run that did something (a skipped gate says nothing about the release)
  const last = runs.find((r) => r.status === "completed" && r.conclusion !== "skipped") || null;
  // the steps that failed in the last failed release (its own, or the runner's)
  const failedSteps = releaseFailed(last)
    ? JSON.parse(gh(["run", "view", String(last.databaseId), "-R", repo, "--json", "jobs", "--jq", "[.jobs[].steps[] | select(.conclusion == \"failure\") | .name]"]) || "[]")
    : [];
  const labelOf = (k) => (k === "runner" ? LABEL_RUNNER : LABEL);
  const openOf = (k) => {
    const title = CHECKS[k].title;
    const found = JSON.parse(gh(["issue", "list", "-R", repo, "--state", "open", "--label", labelOf(k), "--search", `"${title}" in:title`, "--json", "number,title"]) || "[]").find((i) => i.title === title);
    return found ? found.number : null;
  };
  const open = { key: openOf("key"), release: openOf("release"), runner: openOf("runner") };
  const actions = decide({ keyOk, release: last, failedSteps, open });
  for (const k of ["key", "release", "runner"]) {
    const c = CHECKS[k];
    const n = open[k];
    const a = actions[k];
    if (a === "create") gh(["issue", "create", "-R", repo, "--title", c.title, "--label", labelOf(k), "--body", c.body({ runUrl, release: last, failedSteps })]);
    if (a === "comment") gh(["issue", "comment", String(n), "-R", repo, "--body", `Всё ещё не прошло: ${runUrl}`]);
    if (a === "close") {
      gh(["issue", "comment", String(n), "-R", repo, "--body", `Снова в порядке: ${runUrl}`]);
      gh(["issue", "close", String(n), "-R", repo, "--reason", "completed"]);
    }
  }
  console.log(`release health: key=${keyOk ? "ok" : "refused"} → ${actions.key}; release=${last ? last.conclusion : "none"} (${failedSteps.join(", ") || "-"}) → stop ${actions.release}, runner ${actions.runner}`);
  // red when something is wrong: the run itself shows it too (the task is opened first)
  if (!keyOk || releaseFailed(last)) process.exit(1);
}
