/** Screenshot names never hold characters that actions/upload-artifact refuses (#659: "?" in e2e 133 broke the nightly upload). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { shotFileName } = require("../e2e/shotName.cjs") as { shotFileName: (name: string, n: string) => string };

describe("e2e screenshot file name", () => {
  it("replaces every character the artifact upload refuses", () => {
    const f = shotFileName("133-list-filters-390-dark", `invoice?f=all-chosen`);
    expect(f).toBe("133-list-filters-390-dark-invoice_f=all-chosen.png");
    expect(shotFileName('a"b:c<d>e|f*g?h', "i\nj")).not.toMatch(/["':<>|*?\r\n]|[\r\n]/);
  });
  it("keeps ordinary names as they were", () => {
    expect(shotFileName("08-layouts", "home-390")).toBe("08-layouts-home-390.png");
  });
  it("the spec helper builds every screenshot path through it", () => {
    const h = readFileSync(join(__dirname, "../e2e/h.cjs"), "utf8");
    expect(h).toContain("shotFileName(name, n)");
    expect(h).not.toMatch(/OUT, `\$\{name\}-\$\{n\}\.png`/);
  });
});
