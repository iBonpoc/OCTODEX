/** #906 п.6 (audit variant C, 11.11): which e2e views checks.yml runs per event. Release gate (release.yml) is not touched. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const yml = readFileSync(join(__dirname, "../../../.github/workflows/checks.yml"), "utf8");
const step = yml.match(/name: Which views\n\s+run: \|\n([\s\S]*?)echo "views=\$v"/)?.[1] ?? "";
const views = (s: string) => [...s.matchAll(/"(\d+-(?:dark|light))"/g)].map((m) => m[1]);
/** the views the step picks for an event (first branch whose condition names the event, else the else-branch) */
function pick(event: string): string[] {
  const branches = [...step.matchAll(/(?:if|elif) ([^\n]*?); then\n\s+v='(\[.*?\])'/g)];
  for (const [, cond, list] of branches) if (cond.includes(`"${event}"`)) return views(list);
  return views(step.match(/else\n\s+v='(\[.*?\])'/)?.[1] ?? "");
}

describe("checks.yml: e2e views per event", () => {
  it("push to main runs only 390-dark (it carries 08-layouts, all 6 views by itself)", () => expect(pick("push")).toEqual(["390-dark"]));
  it("the nightly run and a manual dispatch run all 6 views", () => {
    const all = ["390-dark", "390-light", "820-dark", "820-light", "1280-dark", "1280-light"];
    expect(pick("schedule")).toEqual(all);
    expect(pick("workflow_dispatch")).toEqual(all);
  });
  it("a PR keeps 3 views covering every width and both themes", () => {
    const v = pick("pull_request");
    expect(v).toEqual(["390-dark", "820-light", "1280-dark"]);
  });
  it("08-layouts (all 6 views by itself) still runs on the one push view: other views set E2E_OWN_LAYOUTS=0 except 390-dark", () => {
    expect(yml).toMatch(/\[ "\$view" = "390-dark" \] \|\| export E2E_OWN_LAYOUTS=0/);
    expect(pick("push")).toContain("390-dark");
  });
  it("release.yml still waits for a successful Checks run of that commit", () => {
    const rel = readFileSync(join(__dirname, "../../../.github/workflows/release.yml"), "utf8");
    expect(rel).toMatch(/workflows: \[Checks\]/);
    expect(rel).toContain('[ "$res" = "success" ] || no "checks $res"');
  });
});
