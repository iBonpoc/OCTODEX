import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #1642: a person never reads the raw text of an exception (a stack word, «Network request failed», a server code) in a toast:
 * the toast says what failed and what to do («PDF не сохранился. Попробуйте ещё раз.»). The guard: no `e.message` / `String(e…)`
 * handed to `t(…)` as a parameter.
 */
const ROOT = join(__dirname, "..", "src");
// files still waiting for their own PR (none now: the Gutters PDF toasts went in #1642, Gutters)
const PENDING = new Set<string>([]);

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });

describe("no raw exception text in what a person reads (#1642)", () => {
  it("no `{ msg: String(e?.message …) }` handed to a string", () => {
    const bad = files(ROOT)
      .map((p) => relative(ROOT, p).split("\\").join("/"))
      .filter((r) => !r.startsWith("i18n/") && !PENDING.has(r))
      .filter((r) => /t\([^)]*\{\s*msg:\s*String\(\s*\(?(e|err|error)\b/.test(readFileSync(join(ROOT, r), "utf8")));
    expect(bad, "say what failed and what to do with a string of its own (err.pdfSave, err.logo, err.linkSend…)").toEqual([]);
  });
  it("the pending list only names files that still need it", () => {
    for (const r of PENDING) expect(readFileSync(join(ROOT, r), "utf8")).toMatch(/msg:\s*String\(/);
  });
});
