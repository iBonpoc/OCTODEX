import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoBadgeTarget, showsDemoBadge } from "../src/features/demoBadge";

/** #1183 п.1: the demo says so on every screen; the cloud never */
describe("the «Демо» strip", () => {
  it("in the demo — on the app's screens", () => {
    for (const path of ["/today", "/clients", "/settings", "/estimates", "/job/j1", "/client/c1", "/payments", "/purchase-orders", "/property/x", "/photos"]) expect(showsDemoBadge("demo", path), path).toBe(true);
  });
  it("in the cloud — nowhere", () => {
    for (const path of ["/today", "/clients", "/settings", "/auth/sign-in", "/p/abc"]) expect(showsDemoBadge("cloud", path), path).toBe(false);
  });
  it("not on the client's pages and not on the sign-in pages", () => {
    for (const path of ["/p/abc", "/f/xyz", "/auth/sign-in", "/auth/company", "/auth/invite"]) expect(showsDemoBadge("demo", path), path).toBe(false);
  });
  it("where a tap leads: signed in without a company → create one; not signed in → sign-in", () => {
    expect(demoBadgeTarget(true)).toBe("/auth/company");
    expect(demoBadgeTarget(false)).toBe("/auth/sign-in");
  });
  it("every screen's header carries it, under the version line", () => {
    const s = readFileSync(join(__dirname, "..", "src", "ui", "surfaces.tsx"), "utf8");
    expect(s).toMatch(/<VersionBadge \/>\s*<DemoBadge \/>/);
  });
});
