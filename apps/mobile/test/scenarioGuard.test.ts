/** Scenario guard (#2068; rule #2001, story-map §7 п.9): a new spec or a new section of a spec has «С<n>. ДАНО … КОГДА … ТОГДА …». */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type F = { path: string; status: string; text: string | null; added: number[] };
const { decide, scenarios, addedLines } = require("../../../scripts/scenarioGuard.cjs") as {
  decide: (f: F[]) => { ok: boolean; problems: string[]; found: number[]; skipped: string[] };
  scenarios: (t: string) => number[];
  addedLines: (d: string) => number[];
};

const OLD = ["# 33. Spec", "", "## 1. Old", "old text without scenarios", ""].join("\n");
const SC = "- **С1.** ДАНО новый замер. КОГДА мастер рисует линию. ТОГДА поля пустые.";
/** an old spec with lines appended; `added` — the new line numbers */
const grown = (extra: string[]) => {
  const text = [OLD, ...extra].join("\n");
  const from = OLD.split("\n").length + 1;
  return { path: "docs/specs/33-x.md", status: "M", text, added: extra.map((_, i) => from + i) };
};

describe("scenarios", () => {
  it("a list item, a quote and a paragraph over two lines count; a word without all three parts does not", () => {
    expect(scenarios(SC)).toEqual([1]);
    expect(scenarios("> **С3.** ДАНО продажник. КОГДА меняет цену. ТОГДА прежняя цена.")).toEqual([3]);
    expect(scenarios("С12. ДАНО а.\nКОГДА б. ТОГДА в.")).toEqual([12]);
    expect(scenarios("- С2. ДАНО а. КОГДА б.")).toEqual([]); // no ТОГДА
    expect(scenarios("- АС1 ДАНО КОГДА ТОГДА")).toEqual([]); // С inside a word
  });
});

describe("decide", () => {
  it("С1: a new spec without scenarios is red, with one — green", () => {
    expect(decide([{ path: "docs/specs/60-new.md", status: "A", text: "# 60\n\nтекст", added: [1, 2, 3] }]).ok).toBe(false);
    expect(decide([{ path: "docs/14-leads-v2.md", status: "A", text: `# 14\n\n${SC}`, added: [1, 2, 3] }]).ok).toBe(true);
  });

  it("С2: a new section of an old spec needs a scenario; its subsections count", () => {
    const red = decide([grown(["## 2. Новое", "только текст"])]);
    expect(red.ok).toBe(false);
    expect(red.problems[0]).toMatch(/33-x\.md:6 «## 2\. Новое»/);
    expect(decide([grown(["## 2. Новое", "текст", "### 2.1. Приёмка", SC])]).ok).toBe(true);
  });

  it("С3: an edit inside an old section without a new heading is not checked (old specs are not rewritten)", () => {
    const text = OLD.replace("old text", "edited text");
    expect(decide([{ path: "docs/specs/33-x.md", status: "M", text, added: [4] }]).ok).toBe(true);
  });

  it("С4: a new subsection inside an old section needs its own scenario", () => {
    expect(decide([grown(["### 1.1. Добавка", "текст"])]).ok).toBe(false);
  });

  it("С5: the opt-out comment with a reason lets a section through; without a reason it does not", () => {
    const opt = decide([grown(["## 2. Ресёрч", "<!-- без сценариев: сравнение образцов, правил нет -->"])]);
    expect(opt.ok).toBe(true);
    expect(opt.skipped).toEqual(["docs/specs/33-x.md:6 «## 2. Ресёрч»: <!-- без сценариев: сравнение образцов, правил нет -->"]); // printed in the PR's log
    expect(decide([grown(["## 2. Ресёрч", "<!-- без сценариев: -->"])]).ok).toBe(false);
  });

  it("С6: other files (not docs/specs, not docs/14-*) are not checked", () => {
    expect(decide([{ path: "docs/ai/BOARD.md", status: "A", text: "# board", added: [1] }, { path: "docs/specs/prototypes/a.html", status: "A", text: "x", added: [1] }]).ok).toBe(true);
  });

  it("С7: scenarios added with new tests — a test must name С<n>", () => {
    const spec = grown(["## 2. Новое", SC]);
    const noRef = decide([spec, { path: "apps/mobile/test/foo.test.ts", status: "A", text: "it('works', () => {})", added: [1] }]);
    expect(noRef.ok).toBe(false);
    expect(noRef.problems[0]).toMatch(/foo\.test\.ts/);
    expect(decide([spec, { path: "apps/mobile/e2e/specs/481-x.cjs", status: "A", text: "// С1: поля пустые", added: [1] }]).ok).toBe(true);
    expect(decide([spec, { path: "apps/mobile/test/foo.test.ts", status: "A", text: "it('C1: works')", added: [1] }]).ok).toBe(true); // Latin C too
    // a test changed (not added) is not asked
    expect(decide([spec, { path: "apps/mobile/test/foo.test.ts", status: "M", text: "it('works')", added: [1] }]).ok).toBe(true);
  });

  it("С9: a docs-only PR (no new test files) with scenarios is not asked for a test", () => {
    expect(decide([grown(["## 2. Новое", SC]), { path: "docs/ai/BOARD.md", status: "M", text: "x", added: [1] }]).ok).toBe(true);
  });

  it("С8: a deleted spec is not checked", () => {
    expect(decide([{ path: "docs/specs/60-old.md", status: "D", text: null, added: [] }]).ok).toBe(true);
  });
});

describe("addedLines", () => {
  it("reads the new-side line numbers of `git diff -U0` hunks", () => {
    expect(addedLines("@@ -3,0 +4,2 @@\n+a\n+b\n@@ -9 +11 @@\n-x\n+y\n@@ -20,2 +22,0 @@\n-z\n-w")).toEqual([4, 5, 11]);
  });
});
