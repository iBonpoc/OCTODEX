/**
 * The founder's questions index (#2521 «0001 — Вопросы основателю», the founder's word of 25.11.2026: «нужен какой-то
 * документ с вопросами основателя… чтобы все агенты знали об этом документе, и мы вели диалог через этот документ»).
 * Every question is its own issue labelled «вопрос»; the body of #2521 is rebuilt from them by .github/workflows/questions-index.yml
 * on every change of such an issue and once a day: open ones on top, grouped by direction, then «Отвечено за 14 дней».
 * The header with the rules (everything above «## Открыто») is kept as the director wrote it in the issue.
 * `render` is pure (apps/mobile/test/questionsIndex.test.ts); the CLI part reads the issues and writes the body (REST, GITHUB_TOKEN, issues: write).
 */
const INDEX = 2521;
const LABEL = "вопрос";
const ANSWERED_DAYS = 14;
const OPEN_MARK = "## Открыто";

/** Directions, in this order; an issue goes to the first group whose label it has. */
const GROUPS = [
  { title: "Gutters", labels: ["gutters"] },
  { title: "Сметы", labels: ["сметы"] },
  { title: "Деньги и тарифы", labels: ["деньги"] },
  { title: "Дизайн и вид", labels: ["дизайн"] },
  { title: "Лиды и клиенты", labels: ["лиды"] },
  { title: "Бренд, домен, право", labels: ["бренд", "право"] },
  { title: "Ядро", labels: ["ядро"] },
];
const OTHER = "Остальное";

const DEFAULT_HEADER = [
  "# Вопросы основателю — оглавление",
  "",
  "**Что это.** Одно место, где лежат все вопросы к основателю. Каждый вопрос — отдельная задача GitHub с ярлыком `вопрос`; здесь — их список. Номер задачи — номер вопроса навсегда.",
  "",
  "**Как отвечать (основателю).** Как удобно: в любом чате проекта — голосом или словами, например «2517 — первый вариант»; или комментарием прямо в задаче вопроса. Ответ записывается дословно в задачу в тот же ход, задача закрывается, вопрос уходит из этого списка.",
  "",
  "**Правила для чатов.** Перед тем как спросить основателя — найди здесь: может быть, уже спрошено или решено. Новый вопрос — задача с ярлыками `вопрос` и `основатель` в виде: что решаем простыми словами; варианты (для вида — снимок каждого); совет; что делаем по умолчанию, если ответа нет; срочность. Решение без вопроса — задача с ярлыком `решение`, сразу закрытая. Ответы и решения — журнал по ярлыку `решение`.",
].join("\n");

/** The header of the current body: everything above «## Открыто» (the rules the director keeps there); none — the default. */
function headerOf(body) {
  const s = String(body ?? "").replace(/\r\n/g, "\n");
  const i = s.indexOf(OPEN_MARK);
  const head = i > 0 ? s.slice(0, i).trim() : "";
  return head || DEFAULT_HEADER;
}

/** dd.mm from an ISO date (the company's dates are US, but this page is the founder's: Russian dd.mm, as in the issues) */
const ddmm = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * «Срочность» of a question: the last «**Срочность.** …» line in its body or comments (the unified form), cut to its first
 * sentence; none — the label «после-1.0» says «после выпуска», «срочно» says «срочно», else «срочность не указана».
 */
function urgencyOf(issue) {
  const texts = [issue.body, ...(issue.comments || [])].map((t) => String(t ?? ""));
  let last = null;
  for (const t of texts) for (const m of t.matchAll(/\*\*Срочность[.:]?\*\*[.:]?[ \t]*([^\n]+)/g)) last = m[1];
  if (last) {
    const plain = last.replace(/\*\*|__|`/g, "").trim();
    const first = plain.split(/(?<=[.!?])\s/)[0].replace(/[.;:,]+$/, "");
    if (first) return clip(first, 90);
  }
  const labels = issue.labels || [];
  if (labels.includes("срочно")) return "срочно";
  if (labels.includes("после-1.0")) return "после выпуска";
  return "срочность не указана";
}

const groupOf = (issue) => {
  const labels = issue.labels || [];
  const g = GROUPS.find((x) => x.labels.some((l) => labels.includes(l)));
  return g ? g.title : OTHER;
};

/** One line in markdown: the title may hold «*», «[» or a newline — it must not break the list. */
const safeTitle = (t) => String(t ?? "").replace(/\s+/g, " ").replace(/([\\*_[\]<>])/g, "\\$1").trim();

/**
 * @param {{ issues: {number:number,title:string,labels:string[],state:"open"|"closed",createdAt:string,closedAt?:string|null,
 *            stateReason?:string|null,body?:string,comments?:string[],isPullRequest?:boolean}[], currentBody?: string, now: string|Date, repo?: string }} x
 * @returns {string} the new body of the index
 */
function render(x) {
  const now = new Date(x.now).getTime();
  const repoUrl = `https://github.com/${x.repo || "iBonpoc/OCTODEX"}/issues`;
  const qs = (x.issues || []).filter((i) => !i.isPullRequest && i.number !== INDEX && (i.labels || []).includes(LABEL));
  const open = qs.filter((i) => i.state === "open").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.number - b.number);
  const since = now - ANSWERED_DAYS * 24 * 3600 * 1000;
  const answered = qs
    .filter((i) => i.state === "closed" && i.closedAt && new Date(i.closedAt).getTime() >= since)
    .sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)) || b.number - a.number);

  const out = [headerOf(x.currentBody), "", `${OPEN_MARK}: ${open.length}`, ""];
  if (!open.length) out.push("Открытых вопросов нет.", "");
  const titles = [...GROUPS.map((g) => g.title), OTHER];
  for (const t of titles) {
    const inGroup = open.filter((i) => groupOf(i) === t);
    if (!inGroup.length) continue;
    out.push(`### ${t}`);
    for (const i of inGroup) out.push(`- [ ] **#${i.number}** ${safeTitle(i.title)} — ${urgencyOf(i)} — с ${ddmm(i.createdAt)}`);
    out.push("");
  }
  out.push(`## Отвечено за ${ANSWERED_DAYS} дней: ${answered.length}`, "");
  if (!answered.length) out.push("За эти дни ответов не было.", "");
  for (const i of answered) {
    const how = i.stateReason === "not_planned" ? "снят" : "отвечен";
    out.push(`- [x] [#${i.number}](${repoUrl}/${i.number}) ${safeTitle(i.title)} — ${how} ${ddmm(i.closedAt)}`);
  }
  if (answered.length) out.push("");
  out.push(
    "---",
    `*Собирается само из задач с ярлыком \`${LABEL}\` (scripts/questionsIndex.cjs): при каждой правке такой задачи и раз в сутки. Править список руками бесполезно — правьте задачу вопроса; шапку выше «${OPEN_MARK}» можно менять.*`,
  );
  return out.join("\n");
}

module.exports = { INDEX, LABEL, GROUPS, OTHER, ANSWERED_DAYS, DEFAULT_HEADER, render, headerOf, urgencyOf, groupOf, ddmm, safeTitle };

if (require.main === module) {
  const { execFileSync } = require("node:child_process");
  const repo = process.env.GITHUB_REPOSITORY || "iBonpoc/OCTODEX";
  const api = (path, opts = {}) =>
    execFileSync("gh", ["api", ...(opts.args || []), path], { encoding: "utf8", input: opts.input, stdio: [opts.input ? "pipe" : "ignore", "pipe", "inherit"], maxBuffer: 64 << 20 });
  const pages = (path) => JSON.parse(api(path, { args: ["--paginate", "--slurp"] })).flat();
  const now = new Date();
  const since = new Date(now.getTime() - (ANSWERED_DAYS + 1) * 24 * 3600 * 1000).toISOString();
  const raw = [
    ...pages(`repos/${repo}/issues?labels=${encodeURIComponent(LABEL)}&state=open&per_page=100`),
    ...pages(`repos/${repo}/issues?labels=${encodeURIComponent(LABEL)}&state=closed&since=${since}&per_page=100`),
  ];
  const seen = new Set();
  const issues = raw
    .filter((i) => !seen.has(i.number) && seen.add(i.number))
    .map((i) => ({
      number: i.number,
      title: i.title,
      labels: (i.labels || []).map((l) => (typeof l === "string" ? l : l.name)),
      state: i.state,
      stateReason: i.state_reason,
      createdAt: i.created_at,
      closedAt: i.closed_at,
      body: i.body || "",
      isPullRequest: !!i.pull_request,
      // the comments matter only for an open question (its «Срочность» line)
      comments: i.state === "open" && i.comments ? pages(`repos/${repo}/issues/${i.number}/comments?per_page=100`).map((c) => c.body || "") : [],
    }));
  const current = JSON.parse(api(`repos/${repo}/issues/${INDEX}`)).body || "";
  const body = render({ issues, currentBody: current, now, repo });
  if (process.env.DRY_RUN) {
    console.log(body); // a look before the first real run: nothing is written
  } else if (body.trim() === current.trim()) {
    console.log(`#${INDEX}: nothing changed (${issues.length} questions read)`);
  } else {
    api(`repos/${repo}/issues/${INDEX}`, { args: ["-X", "PATCH", "--input", "-"], input: JSON.stringify({ body }) });
    console.log(`#${INDEX}: rewritten (${issues.length} questions read)`);
  }
}
