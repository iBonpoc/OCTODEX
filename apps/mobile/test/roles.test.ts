/** Who may plan (docs/specs/03 §8.1; server: cancel_visit, assign_visit — owner / admin / office). Sales does not plan. */
import { describe, expect, it, vi } from "vitest";
vi.mock("../src/cloud/client", () => ({ supabase: {} }));
import { appRoles } from "../src/cloud/repo";
import { canPlan } from "../src/features/schedule";
import { roleHome } from "../src/nav/roles";
import { menuGroups, tabs } from "../src/nav/sections";

describe("roles: the app follows the server", () => {
  it("database roles become app roles; sales is its own role", () => {
    expect(appRoles("owner")).toEqual(["director", "dispatcher", "tech"]);
    expect(appRoles("admin")).toEqual(["director", "dispatcher", "tech"]);
    expect(appRoles("office")).toEqual(["dispatcher"]);
    expect(appRoles("sales")).toEqual(["sales"]);
    expect(appRoles("tech")).toEqual(["tech"]);
  });
  it("planning (move, assign, cancel) — exactly the roles the server lets in", () => {
    for (const r of ["owner", "admin", "office"] as const) expect(canPlan(appRoles(r))).toBe(true);
    for (const r of ["sales", "tech", "subcontractor"] as const) expect(canPlan(appRoles(r))).toBe(false);
  });
  it("sales lands on the Sales lists (/leads) and has the same 5 tabs, Plan to look at", () => {
    expect(roleHome.sales).toBe("leads");
    expect(tabs("sales").map((i) => i.id)).toEqual(["home", "plan", "messages", "clients", "more"]);
    expect(menuGroups("sales").flatMap((g) => g.items.map((i) => i.id))).toContain("leads");
  });
});
