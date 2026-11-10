/**
 * The build number is written by the build, not by a PR (#733): every PR that bumped BUILD in src/config/version.ts made
 * every open PR conflict after each merge and run its checks again (~10 extra runs on 10.11). Here:
 * - version.ts keeps `BUILD = 0` — a PR that sets a number by hand is red;
 * - release.yml, preview.yml and eas-build.yml write the number (scripts/setBuild.cjs) before every build in a job;
 * - the number of a commit of main is its PR's: a merge commit or the last «(#N)» of a squash subject.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildFromMessage, pickBuild } = require("../scripts/setBuild.cjs") as {
  buildFromMessage: (s: string) => number | null;
  pickBuild: (given: string | undefined, subject: string | null) => number | null;
};

const app = join(__dirname, "..");
const workflows = join(app, "../../.github/workflows");

/** Lines that build the app, each with whether a setBuild step comes before it in the same job. */
export function buildsWithoutNumber(yml: string): string[] {
  const lines = yml.split("\n");
  const out: string[] = [];
  let numbered = false;
  for (const [i, l] of lines.entries()) {
    if (/^ {2}[\w-]+:\s*$/.test(l)) numbered = false; // a new job
    if (/^\s*#/.test(l)) continue;
    if (/scripts\/setBuild\.cjs/.test(l)) numbered = true;
    if (/expo export|eas-cli@[\d.]+ (update|build)\b|\beas (update|build)\b/.test(l) && !numbered) out.push(`${i + 1}: ${l.trim()}`);
  }
  return out;
}

describe("the build number (#733)", () => {
  it("version.ts keeps BUILD = 0 — the number is the build's, never a PR's", () => {
    const src = readFileSync(join(app, "src/config/version.ts"), "utf8");
    expect(src.match(/^export const BUILD = (\d+);$/m)?.[1], "set BUILD back to 0: release.yml writes the merged PR's number").toBe("0");
  });

  it.each(["release.yml", "preview.yml", "eas-build.yml"])("%s writes the number before it builds", (f) => {
    const yml = readFileSync(join(workflows, f), "utf8");
    expect(yml).toMatch(/scripts\/setBuild\.cjs/);
    expect(buildsWithoutNumber(yml)).toEqual([]);
  });
  it("the workflow guard is red on a build with no number before it", () => {
    const yml = "jobs:\n  a:\n    steps:\n      - run: node scripts/setBuild.cjs 5\n      - run: npx expo export --platform web\n  b:\n    steps:\n      - run: npx eas-cli@27.4.1 update --channel preview\n";
    expect(buildsWithoutNumber(yml)).toEqual(["8: - run: npx eas-cli@27.4.1 update --channel preview"]);
  });

  it.each([
    ["Проверки: помощники шторки и сторож Esc/ожиданий в e2e (#617, часть A) (#724)", 724],
    ["Чек-лист: правка из карточки работы (#606) (#725)", 725],
    ["Gutters P3a: «Просмотр замера» (#698 #699 #700 #707) (#716)", 716],
    ["Merge pull request #713 from iBonpoc/claude/gutters-canvas-bugs", 713],
    ["Шторка на iPhone: смахивание за середину закрывает (#714) (#715)", 715],
  ])("%s → %i", (subject, n) => expect(buildFromMessage(subject)).toBe(n));
  it.each(["Merge branch 'main' into x", "fix tests", ""])("no PR in %j → none", (subject) => expect(buildFromMessage(subject)).toBeNull());

  it("the PR number from the API wins; the subject is the fallback; nothing → none (the release stops)", () => {
    expect(pickBuild("730", "Something (#724)")).toBe(730);
    expect(pickBuild("", "Something (#724)")).toBe(724);
    expect(pickBuild(undefined, "fix tests")).toBeNull();
    expect(pickBuild("0", null)).toBeNull();
  });
});
