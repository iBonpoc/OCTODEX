import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (...p: string[]) => readFileSync(join(__dirname, "..", "src", ...p), "utf8");

/** #1163, #743: how a sheet leaves, by platform — the wiring (the behaviour is e2e 272, run both ways by a flag) */
describe("how a sheet leaves", () => {
  const sheet = src("ui", "overlays.tsx");
  it("iOS: the Modal is only the owner's `visible` — nothing keeps it after the owner closes it", () => {
    expect(sheet).toMatch(/const open = before \? visible : visible \|\| present;/);
  });
  it("iOS: the person's close goes out first, then asks the owner; elsewhere the owner is asked first", () => {
    expect(sheet).toMatch(/if \(before\) \{[\s\S]*?animateOut\(exitSpeed\.current, ask\);[\s\S]*?\} else \{[\s\S]*?ask\(\);/);
  });
  it("the owner's own close is led out only where the Modal may stay (not on iOS)", () => {
    expect(sheet).toMatch(/if \(before \|\| visible \|\| !present\) return;/);
  });
  it("the platform choice is one place, and a test can force either way", () => {
    const l = src("ui", "sheetLeave.ts");
    expect(l).toMatch(/Platform\.OS === "ios"/);
    expect(l).toMatch(/__octoSheetLeave/);
  });
  it("an owner that will not let it close says so: no going out and coming back", () => {
    expect(sheet).toMatch(/canClose === false/);
    for (const f of [["features", "payments", "RefundSheet.tsx"], ["features", "payments", "AdvanceSheet.tsx"], ["app", "company", "intake.tsx"]]) expect(src(...f)).toMatch(/canClose=\{/);
  });
});
