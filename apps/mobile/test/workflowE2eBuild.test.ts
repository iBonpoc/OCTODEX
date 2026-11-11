/** #906 п.3 (D-13): the web site is built ONCE per checks run; the e2e jobs download it and never build again. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const yml = readFileSync(join(__dirname, "../../../.github/workflows/checks.yml"), "utf8");
const job = (name: string) => {
  const m = yml.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z0-9-]+:\\n|(?![\\s\\S]))`, "m"));
  if (!m) throw new Error(`job ${name} not found in checks.yml`);
  return m[1];
};

describe("checks.yml builds the web app once", () => {
  it("exactly one web `expo export` command in the workflow, in the build-web job (the iOS/Android bundle job is another export)", () => {
    expect((yml.match(/^\s+run: npx expo export --platform web\b/gm) ?? []).length).toBe(1);
    expect(job("build-web")).toContain("expo export --platform web");
    expect(job("build-web")).toMatch(/upload-artifact@v4[\s\S]*name: web-dist/);
  });
  it("the e2e job waits for build-web, downloads web-dist and runs with --no-build", () => {
    const e2e = job("e2e");
    expect(e2e).toMatch(/needs:\s*\[[^\]]*build-web[^\]]*\]/);
    expect(e2e).toMatch(/download-artifact@v4[\s\S]*name: web-dist[\s\S]*path: apps\/mobile\/dist/);
    expect(e2e).toMatch(/node e2e\/run\.cjs --no-build /);
  });
  it("the Playwright browser download is cached by version", () => {
    expect(job("e2e")).toMatch(/actions\/cache@v4[\s\S]*ms-playwright[\s\S]*key: playwright-/);
  });
  it("the final `checks` job needs build-web, so a failed build is red, not skipped-green", () => {
    expect(job("checks")).toMatch(/needs:\s*\[[^\]]*build-web[^\]]*\]/);
  });
});
