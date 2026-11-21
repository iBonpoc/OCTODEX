/**
 * #2312 п.1 (PR 2): the picture job of checks.yml is REPORT ONLY (director 20.11, rule 26) — it is not in `needs` of «checks»,
 * it runs only where the full matrix runs, it never builds the web app itself, and the base pictures come from the last green
 * run of main (artifact), not from the repository.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const yml = readFileSync(join(__dirname, "../../../.github/workflows/checks.yml"), "utf8");
const job = (name: string) => {
  const m = yml.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z0-9-]+:\\n|(?![\\s\\S]))`, "m"));
  if (!m) throw new Error(`job ${name} not found in checks.yml`);
  return m[1]!;
};

describe("checks.yml: the picture job is a report, not a gate", () => {
  const visual = job("visual");
  it("С1 «checks» does not wait for it (it blocks no merge until the base has stood green)", () => {
    expect(job("checks")).not.toMatch(/needs:[^\n]*visual/);
  });
  it("С2 it runs only where the full matrix runs, and uses the one web build", () => {
    expect(visual).toMatch(/needs\.changes\.outputs\.e2e == 'full'/);
    expect(visual).toMatch(/needs:\s*\[changes, build-web\]/);
    expect(visual).toMatch(/download-artifact@v4[\s\S]*name: web-dist/);
    expect(visual).not.toMatch(/expo export/);
  });
  it("С3 main writes the base as an artifact; a PR downloads the last green main run's one and its comparison never fails the job", () => {
    expect(visual).toMatch(/--update-snapshots/);
    expect(visual).toMatch(/upload-artifact@v4[\s\S]*name: visual-base-\$\{\{ matrix\.view \}\}/);
    expect(visual).toMatch(/run-id: \$\{\{ steps\.last\.outputs\.run \}\}/);
    expect(visual).toMatch(/name: Compare with the base[\s\S]*continue-on-error: true/);
  });
  it("С4 only a run on main writes the base", () => {
    for (const step of visual.split(/\n {6}- /).filter((x) => /--update-snapshots|Write the base|upload-artifact@v4\n[\s\S]*visual-base/.test(x))) expect(step).toMatch(/github\.ref == 'refs\/heads\/main'/);
  });
});
