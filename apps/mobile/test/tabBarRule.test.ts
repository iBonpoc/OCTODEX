/**
 * The phone's bottom bar (docs/specs/28): every screen of src/app is put in «with the bar» or «without» — a new screen
 * that is in neither fails here, so nobody forgets it (the founder's complaint 07.11: Jobs, Tasks, Invoices… had none).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NO_TAB_BAR, WITH_TAB_BAR, routeKey, showsTabBar } from "../src/nav/tabBarRule";

const APP = path.resolve(__dirname, "../src/app");
function routes(dir = APP, base = ""): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return routes(path.join(dir, e.name), e.name.startsWith("(") ? base : `${base}${e.name}/`);
    if (!e.name.endsWith(".tsx") || e.name.startsWith("_")) return [];
    return [routeKey(`${base}${e.name.replace(/\.tsx$/, "")}`)];
  });
}

describe("unit:tabBarRule — the bottom bar on the phone", () => {
  const all = routes();
  for (const r of all) {
    it(r, () => {
      const inNo = (NO_TAB_BAR as readonly string[]).includes(r);
      const inWith = (WITH_TAB_BAR as readonly string[]).includes(r);
      expect(inNo !== inWith, `put "${r}" in exactly one list of src/nav/tabBarRule.ts`).toBe(true);
    });
  }
  it("the lists name only real screens", () => {
    for (const r of [...NO_TAB_BAR, ...WITH_TAB_BAR]) expect(all, `no screen "${r}"`).toContain(r);
  });
  it("the founder's screens (07.11) have it; forms and the signature do not", () => {
    for (const r of ["jobs", "tasks", "invoice", "catalog", "team", "company", "settings", "calls", "client/[id]", "job/[id]", "lead/[id]"])
      expect(showsTabBar(r), r).toBe(true);
    for (const r of ["lead/new", "estimate/signature", "client/edit", "p/[token]", "auth/sign-in"]) expect(showsTabBar(r), r).toBe(false);
  });
  it("route names and segments are read the same", () => {
    expect(routeKey("(tabs)/clients")).toBe("clients");
    expect(routeKey("company/index")).toBe("company");
    expect(routeKey("")).toBe("index");
    expect(routeKey("(tabs)")).toBe("index");
    expect(showsTabBar("(tabs)/plan")).toBe(true);
  });
});
