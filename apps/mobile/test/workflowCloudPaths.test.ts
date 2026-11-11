/** #802 (audit D-02): the cloud scenarios start on a PR that changes the code which talks to the server — not only src/cloud. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const yml = readFileSync(join(__dirname, "../../../.github/workflows/cloud.yml"), "utf8");
const prPaths = (yml.match(/pull_request:\n\s+paths:\n((?:\s+(?:- '.*'|#.*)\n)+)/)?.[1] ?? "").split("\n").map((l) => l.trim().match(/^- '(.*)'$/)?.[1]).filter(Boolean) as string[];

describe("cloud.yml: which PRs start the cloud scenarios", () => {
  it("reads the path list", () => expect(prPaths.length).toBeGreaterThan(4));
  it.each(["supabase/**", "apps/mobile/src/cloud/**", "apps/mobile/src/data/**", "apps/mobile/src/features/**", "apps/mobile/e2e/cloud/**", ".github/workflows/cloud.yml"])("%s starts it", (p) => {
    expect(prPaths).toContain(p);
  });
});
