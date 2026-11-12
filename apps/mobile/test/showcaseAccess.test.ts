import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canSeeShowcase } from "../src/features/showcase/access";

describe("who sees the design showcase (#1093)", () => {
  it("the demo: everyone; the cloud: the director only", () => {
    for (const r of ["tech", "dispatcher", "director", "sales"] as const) expect(canSeeShowcase("demo", r), `demo ${r}`).toBe(true);
    expect(canSeeShowcase("cloud", "director")).toBe(true);
    for (const r of ["tech", "dispatcher", "sales"] as const) expect(canSeeShowcase("cloud", r), `cloud ${r}`).toBe(false);
  });
  it("the route itself sends a person who may not see it back to Settings (not only the hidden row)", () => {
    const src = readFileSync(join(__dirname, "..", "src", "app", "settings", "design-system.tsx"), "utf8");
    expect(src).toMatch(/canSeeShowcase\(mode, role\)[\s\S]*<Redirect href="\/settings"/);
    const row = readFileSync(join(__dirname, "..", "src", "app", "settings", "index.tsx"), "utf8");
    expect(row).toContain("canSeeShowcase(mode, role)");
  });
});
