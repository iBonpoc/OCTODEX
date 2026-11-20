/**
 * #2192: the Checks queue held 26 full push runs of main. A new push to main cancels the older push run of main; a PR
 * cancels its own older run; the nightly and a manual run are never cancelled. Nothing is lost: release.yml releases
 * only the newest green commit of main (a cancelled run is «no release»), and that commit carries every change before it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WF = join(__dirname, "..", "..", "..", ".github", "workflows");
const checks = readFileSync(join(WF, "checks.yml"), "utf8");
const release = readFileSync(join(WF, "release.yml"), "utf8");
const top = checks.slice(checks.indexOf("\nconcurrency:"), checks.indexOf("\njobs:"));
const group = /group:\s*(.+)/.exec(top)?.[1] ?? "";
const cancel = /cancel-in-progress:\s*(.+)/.exec(top)?.[1] ?? "";

describe("Checks: which runs cancel which (#2192)", () => {
  it("a PR has its own group by number and cancels its older run", () => {
    expect(group).toMatch(/github\.event_name == 'pull_request' && format\('pr-\{0\}', github\.event\.pull_request\.number\)/);
    expect(cancel).toMatch(/github\.event_name == 'pull_request'/);
  });
  it("a push to main shares one group (checks-main) and cancels the older push run", () => {
    expect(group).toMatch(/github\.event_name == 'push' && 'main'/);
    expect(cancel).toMatch(/github\.event_name == 'push'/);
  });
  it("the nightly (schedule) and a manual run keep their own group and are never cancelled", () => {
    expect(group).toMatch(/\|\| github\.run_id \}\}$/);
    expect(cancel).not.toMatch(/schedule|workflow_dispatch/);
  });
  it("the release waits for green Checks of that commit: a cancelled run is no release, a newer app commit releases itself", () => {
    expect(release).toMatch(/workflow_run:\s*\n\s*workflows: \[Checks\]/);
    expect(release).toMatch(/\[ "\$res" = "success" \] \|\| no "checks \$res"/);
    expect(release).toMatch(/a newer app commit on main releases itself/);
    // the release numbers nothing by the Checks runs: skipping some of them changes no build number
    expect(release).not.toMatch(/workflow_run\.run_number|github\.run_number/);
  });
  it("the nightly release safety net stays: a schedule run may release", () => {
    expect(release).toMatch(/\[ "\$ev" = "push" \] \|\| \[ "\$ev" = "schedule" \]/);
    expect(checks).toMatch(/schedule:\s*\n\s*- cron:/);
  });
});
