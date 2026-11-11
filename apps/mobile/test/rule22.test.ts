/** Rule 22 guard (#902): a PR must refer to a «до-1.0» task inside an epic #769–#775 (directly or through a sub-task). */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Issue = { labels: string[] } | null;
const { decide, referencedIssues, docsOnly } = require("../../../scripts/rule22.cjs") as {
  decide: (a: { body: string; prLabels: string[]; files: string[]; getIssue: (n: number) => Promise<Issue>; getParent: (n: number) => Promise<number | null> }) => Promise<{ ok: boolean; skip?: string; message?: string }>;
  referencedIssues: (b: string) => number[];
  docsOnly: (f: string[]) => boolean;
};

const issues: Record<number, { labels: string[]; parent?: number }> = {
  451: { labels: ["до-1.0"], parent: 772 }, // a task in epic Э3
  902: { labels: ["до-1.0"], parent: 772 },
  900: { labels: ["до-1.0"], parent: 901 }, // a sub-task of a task
  901: { labels: ["до-1.0"], parent: 773 },
  800: { labels: ["до-1.0"], parent: 11 }, // 11 is not an epic
  11: { labels: [], parent: 12 },
  12: { labels: [], parent: 773 }, // 3 levels: too deep
  776: { labels: ["после-1.0"], parent: 777 },
  50: { labels: ["до-1.0"] }, // no epic
  4510: { labels: ["после-1.0"] },
};
const getIssue = async (n: number) => (issues[n] ? { labels: issues[n].labels } : null);
const getParent = async (n: number) => issues[n]?.parent ?? null;
const run = (body: string, o: { prLabels?: string[]; files?: string[] } = {}) => decide({ body, prLabels: o.prLabels ?? [], files: o.files ?? ["apps/mobile/src/x.ts"], getIssue, getParent });

describe("rule 22 guard", () => {
  it("a PR with no reference is red, with the plain text", async () => {
    const r = await run("Просто правка");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("PR не ссылается на задачу до-1.0 в эпике (правило 22)");
  });
  it("Closes on a task of epic Э3 is green", async () => expect((await run("Closes #451")).ok).toBe(true));
  it("Refs works too, case and colon do not matter", async () => {
    expect((await run("refs: #902")).ok).toBe(true);
    expect((await run("CLOSES #451.")).ok).toBe(true);
  });
  it("a sub-task of an epic's task (2 levels) is green; 3 levels is red", async () => {
    expect((await run("Closes #900")).ok).toBe(true);
    expect((await run("Closes #800")).ok).toBe(false);
  });
  it("a «после-1.0» task, a task without an epic, an epic itself, an unknown number are red", async () => {
    for (const n of [776, 50, 772, 99999]) expect((await run(`Closes #${n}`)).ok, `#${n}`).toBe(false);
  });
  it("several references: one good is enough; the list form 'Closes #1, #2' names both", async () => {
    expect((await run("Closes #50, closes #451")).ok).toBe(true);
    expect(referencedIssues("Closes #50, #451 and #902")).toEqual([50, 451, 902]);
  });
  it("number boundaries: #4510 is not #451", async () => {
    expect(referencedIssues("Closes #4510")).toEqual([4510]);
    expect((await run("Closes #4510")).ok).toBe(false);
  });
  it("a reference without a keyword, or to another repository, does not count", async () => {
    expect(referencedIssues("see #451, related to #902")).toEqual([]);
    expect(referencedIssues("Closes other/repo#451")).toEqual([]);
  });
  it("Fixes/Resolves, 'and' lists and a link to this repository's issue count", async () => {
    expect(referencedIssues("Fixes #1 and resolves #2 & #3")).toEqual([1, 2, 3]);
    process.env.GITHUB_REPOSITORY = "iBonpoc/OCTODEX";
    expect(referencedIssues("Closes https://github.com/iBonpoc/OCTODEX/issues/451")).toEqual([451]);
    expect(referencedIssues("Closes https://github.com/other/repo/issues/451")).toEqual([]);
  });
  it("documents-only PR is skipped; one app file makes it count", async () => {
    expect(docsOnly(["docs/ai/BOARD.md", "README.md"])).toBe(true);
    expect((await run("без ссылки", { files: ["docs/10-build-plan.md", "CLAUDE.md"] })).skip).toBe("documents only");
    expect((await run("без ссылки", { files: ["docs/x.md", "apps/mobile/a.ts"] })).ok).toBe(false);
    expect(docsOnly([])).toBe(false);
  });
  it("the label «починка-main» skips the check", async () => expect((await run("", { prLabels: ["починка-main"] })).skip).toContain("починка-main"));
});
