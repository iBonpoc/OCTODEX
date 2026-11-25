/** The founder's questions index (#2521): the body is rebuilt from the issues labelled «вопрос» (scripts/questionsIndex.cjs). */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Issue = {
  number: number; title: string; labels: string[]; state: "open" | "closed"; createdAt: string;
  closedAt?: string | null; stateReason?: string | null; body?: string; comments?: string[]; isPullRequest?: boolean;
};
const { render, headerOf, urgencyOf, groupOf, DEFAULT_HEADER, INDEX } = require("../../../scripts/questionsIndex.cjs") as {
  render: (x: { issues: Issue[]; currentBody?: string; now: string; repo?: string }) => string;
  headerOf: (b?: string) => string;
  urgencyOf: (i: Issue) => string;
  groupOf: (i: Issue) => string;
  DEFAULT_HEADER: string;
  INDEX: number;
};

const NOW = "2026-11-25T12:00:00Z";
const q = (n: number, labels: string[], extra: Partial<Issue> = {}): Issue => ({
  number: n, title: `Вопрос ${n}`, labels: ["вопрос", ...labels], state: "open", createdAt: "2026-11-10T08:00:00Z", ...extra,
});
const CURRENT = "# Вопросы основателю — оглавление\n\n**Что это.** Шапка руководителя.\n\n## Открыто: 3\n\n### Старое\n- [ ] **#1** старый список\n";

describe("render: the body of the index", () => {
  it("keeps the director's header and drops the old list", () => {
    const b = render({ issues: [q(10, ["gutters"])], currentBody: CURRENT, now: NOW });
    expect(b.startsWith("# Вопросы основателю — оглавление\n\n**Что это.** Шапка руководителя.")).toBe(true);
    expect(b).not.toContain("старый список");
    expect(b).toContain("## Открыто: 1");
  });

  it("an empty or foreign body gets the default header", () => {
    expect(headerOf("")).toBe(DEFAULT_HEADER);
    expect(headerOf("какой-то текст без списка").length).toBeGreaterThan(0);
    expect(render({ issues: [], currentBody: "", now: NOW })).toContain(DEFAULT_HEADER);
  });

  it("open questions go by direction, in the fixed order, oldest first inside a group", () => {
    const b = render({
      issues: [
        q(30, ["ядро"], { createdAt: "2026-11-20T00:00:00Z" }),
        q(31, ["сметы"]),
        q(32, ["gutters"], { createdAt: "2026-11-25T00:00:00Z" }),
        q(33, ["gutters"], { createdAt: "2026-11-18T00:00:00Z" }),
        q(34, []),
      ],
      now: NOW,
    });
    const at = (s: string) => b.indexOf(s);
    expect(at("### Gutters")).toBeLessThan(at("### Сметы"));
    expect(at("### Сметы")).toBeLessThan(at("### Ядро"));
    expect(at("### Ядро")).toBeLessThan(at("### Остальное"));
    expect(at("**#33**")).toBeLessThan(at("**#32**"));
    expect(b).not.toContain("### Деньги"); // an empty group is not drawn
  });

  it("the line is «**#N** title — urgency — since dd.mm»", () => {
    const b = render({ issues: [q(2517, ["gutters"], { title: "Gutters: первый экран", createdAt: "2026-11-25T06:55:37Z", body: "**Срочность.** Да: держит экран Gutters. Подробнее ниже." })], now: NOW });
    expect(b).toContain("- [ ] **#2517** Gutters: первый экран — Да: держит экран Gutters — с 25.11");
  });

  it("answered in the last 14 days are listed with a link, newest first; older ones are not", () => {
    const b = render({
      issues: [
        q(40, ["сметы"], { state: "closed", closedAt: "2026-11-24T10:00:00Z" }),
        q(41, ["сметы"], { state: "closed", closedAt: "2026-11-20T10:00:00Z", stateReason: "not_planned" }),
        q(42, ["сметы"], { state: "closed", closedAt: "2026-11-01T10:00:00Z" }),
      ],
      now: NOW,
    });
    expect(b).toContain("## Отвечено за 14 дней: 2");
    expect(b).toContain("- [x] [#40](https://github.com/iBonpoc/OCTODEX/issues/40) Вопрос 40 — отвечен 24.11");
    expect(b).toContain("[#41](https://github.com/iBonpoc/OCTODEX/issues/41) Вопрос 41 — снят 20.11");
    expect(b.indexOf("#40")).toBeLessThan(b.indexOf("#41"));
    expect(b).not.toContain("#42");
    expect(b).toContain("## Открыто: 0");
  });

  it("the index itself, pull requests and issues without the label are left out", () => {
    const b = render({
      issues: [q(INDEX, []), q(50, [], { isPullRequest: true }), { ...q(51, []), labels: ["ошибка"] }, q(52, [])],
      now: NOW,
    });
    expect(b).not.toContain(`**#${INDEX}**`);
    expect(b).not.toContain("#50");
    expect(b).not.toContain("#51");
    expect(b).toContain("**#52**");
  });

  it("a title cannot break the list", () => {
    const b = render({ issues: [q(60, [], { title: "Две\nстроки *жирно* [ссылка]" })], now: NOW });
    expect(b).toContain("**#60** Две строки \\*жирно\\* \\[ссылка\\] —");
  });

  it("the same input gives the same body (no needless edits)", () => {
    const x = { issues: [q(70, ["деньги"]), q(71, ["бренд"])], currentBody: CURRENT, now: NOW };
    const once = render(x);
    expect(render({ ...x, currentBody: once })).toBe(once);
  });
});

describe("urgencyOf and groupOf", () => {
  it("the last «Срочность» line wins (the rewrite comes after the body)", () => {
    expect(urgencyOf(q(1, [], { body: "**Срочность.** Да, держит всё.", comments: ["**Срочность:** Нет. Ждёт выпуска."] }))).toBe("Нет");
  });
  it("without the line: the labels say it", () => {
    expect(urgencyOf(q(1, ["после-1.0"]))).toBe("после выпуска");
    expect(urgencyOf(q(1, ["срочно"]))).toBe("срочно");
    expect(urgencyOf(q(1, []))).toBe("срочность не указана");
  });
  it("a long line is cut", () => {
    expect(urgencyOf(q(1, [], { body: `**Срочность.** ${"а".repeat(200)}` })).length).toBeLessThanOrEqual(90);
  });
  it("the first matching direction wins; право goes with бренд", () => {
    expect(groupOf(q(1, ["ядро", "сметы"]))).toBe("Сметы");
    expect(groupOf(q(1, ["право"]))).toBe("Бренд, домен, право");
    expect(groupOf(q(1, ["основатель"]))).toBe("Остальное");
  });
});

describe("questions-index.yml", () => {
  const yml = readFileSync(join(__dirname, "../../../.github/workflows/questions-index.yml"), "utf8");
  it("runs on a question's changes and once a day", () => {
    expect(yml).toMatch(/issues:\n\s+types: \[opened, closed, reopened, labeled, unlabeled, edited\]/);
    expect(yml).toMatch(/schedule:\n\s+- cron:/);
    expect(yml).toContain("node scripts/questionsIndex.cjs");
  });
  it("holds no key and may only write issues", () => {
    expect(yml).not.toMatch(/secrets\./);
    expect(yml).toMatch(/permissions:\n\s+contents: read\n\s+issues: write\n(?!\s+\w+: (write|read))/);
    expect(yml).not.toMatch(/contents: write|git push|git commit/);
  });
});
