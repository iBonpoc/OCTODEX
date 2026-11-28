/**
 * A new push to a PR takes off «принято» (#3117 В, #3121): scripts/acceptedReset.cjs writes the line «принято снято: новый пуш
 * <SHA>» into a marked block of the PR description; accepted-reset.yml runs it on «synchronize», from main, without a key.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const A = require("../../../scripts/acceptedReset.cjs") as { LABEL: string; START: string; END: string; withLine: (body: string | null, sha: string, at: string) => string };
const sha = (c: string) => c.repeat(40);

describe("acceptedReset.withLine", () => {
  it("the label is «принято»", () => expect(A.LABEL).toBe("принято"));
  it("adds the block with the line at the end of the description, the description kept", () => {
    const b = A.withLine("## Что сделано\nтекст", sha("a"), "2026-11-27 23:00 UTC");
    expect(b.startsWith("## Что сделано\nтекст\n\n" + A.START)).toBe(true);
    expect(b).toContain("- принято снято: новый пуш `aaaaaaa` (2026-11-27 23:00 UTC)");
    expect(b.endsWith(A.END)).toBe(true);
  });
  it("an empty description: only the block", () => {
    expect(A.withLine(null, sha("b"), "t").startsWith(A.START)).toBe(true);
  });
  it("a second push: the same block gets a second line (one block, the preview block untouched)", () => {
    const preview = "<!-- octodex-preview -->\nсайт\n<!-- /octodex-preview -->";
    const once = A.withLine(`текст\n\n${preview}`, sha("a"), "t1");
    const twice = A.withLine(once, sha("c"), "t2");
    expect(twice.split(A.START)).toHaveLength(2);
    expect(twice).toContain(preview);
    expect(twice).toMatch(/новый пуш `aaaaaaa` \(t1\)\n- принято снято: новый пуш `ccccccc` \(t2\)/);
  });
  it("the same push twice (a re-run): no second line", () => {
    const once = A.withLine("x", sha("a"), "t1");
    expect(A.withLine(once, sha("a"), "t1")).toBe(once);
  });
  it("keeps the last 10 lines only", () => {
    let b = "x";
    for (let i = 0; i < 12; i++) b = A.withLine(b, sha("d"), `t${i}`);
    expect(b.match(/^- принято снято/gm)).toHaveLength(10);
    expect(b).not.toContain("(t0)");
    expect(b).toContain("(t11)");
  });
});

describe("accepted-reset.yml", () => {
  const s = readFileSync(join(__dirname, "../../../.github/workflows/accepted-reset.yml"), "utf8");
  it("on a new push only (synchronize), only for a PR of this repository that has «принято»", () => {
    expect(s).toMatch(/pull_request:\n\s+types: \[synchronize\]/);
    expect(s).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(s).toContain("contains(github.event.pull_request.labels.*.name, 'принято')");
  });
  it("the script of main, no code of the PR, no key; may edit labels and the description only", () => {
    expect(s).toContain("ref: main");
    expect(s).toContain("run: node scripts/acceptedReset.cjs");
    expect(s).not.toMatch(/secrets\.|npm |setup-node/);
    expect(s).toMatch(/^permissions: \{\}$/m);
    expect(s).toMatch(/contents: read\n\s+issues: write\n\s+pull-requests: write/);
    expect(s).toContain("HEAD_SHA: ${{ github.event.pull_request.head.sha }}");
  });
});
