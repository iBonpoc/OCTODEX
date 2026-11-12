/**
 * No silent skips in e2e specs (#800, audit D-10/D-22). `if (await x.count()) { …checks… }` passes when `x` is missing: the
 * check is gone and nobody sees it (found in #800: the tech's filter check of e2e 127 and the landscape signature of e2e 126
 * had never run at some widths). In e2e/specs such an `if` needs an `else` (assert or throw there) or the comment
 * `// optional: <why the element may be absent>` on the line above. Swallowed waits (`.catch(() => {})`) are held by
 * e2eSheetGuard.test.ts; `expect(true)` / `expect(false).toBe(true)` in the engine tests are held below.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const specs = join(__dirname, "../e2e/specs");

/** the `if (await <locator>.count())` statements of a spec text that have neither an `else` nor an `// optional:` line above */
export function silentSkips(src: string): string[] {
  const out: string[] = [];
  const lines = src.split("\n");
  const re = /\bif \(await [\w.$]+\.count\(\)\)\s*\{/g; // a bare count — not `> 0`, `=== 1`: those are assertions of their own
  for (const m of src.matchAll(re)) {
    const at = m.index ?? 0;
    // the matching close brace of the block
    let depth = 0;
    let end = at + m[0].length - 1;
    for (let i = end; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) { end = i; break; }
    }
    const hasElse = /^\s*else\b/.test(src.slice(end + 1));
    const lineNo = src.slice(0, at).split("\n").length;
    const above = lines.slice(Math.max(0, lineNo - 3), lineNo - 1).join("\n");
    if (!hasElse && !/\/\/ optional:/.test(above)) out.push(`line ${lineNo}: ${lines[lineNo - 1].trim().slice(0, 90)}`);
  }
  return out;
}

describe("e2e specs: no silent skips", () => {
  it("the detector sees a bare skip and accepts `else` and `// optional:`", () => {
    expect(silentSkips("if (await x.count()) {\n  await x.click();\n}\n")).toHaveLength(1);
    expect(silentSkips("if (await x.count()) {\n  await x.click();\n} else {\n  h.expect(false, 'x');\n}\n")).toEqual([]);
    expect(silentSkips("// optional: the hint shows once\nif (await x.count()) { await x.click(); }\n")).toEqual([]);
    expect(silentSkips("if ((await x.count()) === 0) { throw new Error('no'); }\n")).toEqual([]);
  });
  it("no spec skips a check silently", () => {
    const bad: string[] = [];
    for (const f of readdirSync(specs).filter((x) => x.endsWith(".cjs"))) {
      for (const s of silentSkips(readFileSync(join(specs, f), "utf8"))) bad.push(`${f} ${s}`);
    }
    expect(bad, `an \`if (await x.count())\` that skips its checks when x is missing — add an else that fails, or the comment "// optional: <why>":\n${bad.join("\n")}`).toEqual([]);
  });
});

describe("engine tests: no placeholder assertions", () => {
  it("scenarios.test.ts has no expect(true) / expect(false).toBe(true)", () => {
    const src = readFileSync(join(__dirname, "../../../packages/estimating-engine/test/scenarios.test.ts"), "utf8");
    expect(src).not.toMatch(/expect\((true|false)\)\.toBe\((true|false)\)/);
  });
});
