/**
 * The phone's bottom bar (docs/specs/28): every screen of src/app is put in «with the bar» or «without» — a new screen
 * that is in neither fails here, so nobody forgets it (the founder's complaint 07.11: Jobs, Tasks, Invoices… had none).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NO_TAB_BAR, WITH_TAB_BAR, appStackRoutes, formsAbove, goAction, tabLeave, tabRouteKey, showsTabBar } from "../src/nav/tabBarRule";

const APP = path.resolve(__dirname, "../src/app");
function routes(dir = APP, base = ""): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return routes(path.join(dir, e.name), e.name.startsWith("(") ? base : `${base}${e.name}/`);
    if (!e.name.endsWith(".tsx") || e.name.startsWith("_")) return [];
    return [tabRouteKey(`${base}${e.name.replace(/\.tsx$/, "")}`)];
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
    for (const r of ["lead/new", "estimate/signature", "client/edit", "p/[token]", "auth/sign-in", "catalog/[id]"]) expect(showsTabBar(r), r).toBe(false);
  });
  it("route names and segments are read the same", () => {
    expect(tabRouteKey("(tabs)/clients")).toBe("clients");
    expect(tabRouteKey("company/index")).toBe("company");
    expect(tabRouteKey("")).toBe("index");
    expect(tabRouteKey("(tabs)")).toBe("index");
    expect(showsTabBar("(tabs)/plan")).toBe(true);
  });
  it("a tab asks first when a form lies under the card (review #274: a new lead → its client → «Главная»)", () => {
    expect(formsAbove(["(tabs)", "lead/new", "client/[id]"])).toEqual(["lead/new"]);
    expect(formsAbove(["(tabs)", "client/[id]", "job/[id]"])).toEqual([]);
    // a deep link with no tabs under it: every form counts
    expect(formsAbove(["estimate/new", "client/[id]"])).toEqual(["estimate/new"]);
    // only above the last copy of the tabs
    expect(formsAbove(["lead/new", "(tabs)", "client/[id]"])).toEqual([]);
  });
  it("a tab on the tabs switches the tab, over a card closes it (e2e 134: role change from settings, TestFlight 288)", () => {
    expect(tabLeave(["(tabs)"])).toBe("navigate");
    expect(tabLeave(["(tabs)", "client/[id]"])).toBe("dismissTo");
    // navigate from /settings pushed a second copy of the tabs: on top already — dismissTo was a no-op, the tab did nothing
    expect(tabLeave(["(tabs)", "settings/index", "(tabs)"])).toBe("navigate");
    // a deep link to /settings, then its role change: [settings, (tabs)]
    expect(tabLeave(["settings/index", "(tabs)"])).toBe("navigate");
    // a card opened by a link (a push), then a tab: [card, (tabs)] — the next tab was a no-op too (e2e 134)
    expect(tabLeave(["client/[id]", "(tabs)"])).toBe("navigate");
    // no tabs in the stack (a deep link to a card) or no state yet
    expect(tabLeave(["client/[id]", "job/[id]"])).toBe("navigate");
    expect(tabLeave([])).toBe("navigate");
  });
  it("goTo (the screen's «‹ up», the role change): navigate when the tabs are on top over a card (e2e 134)", () => {
    // a card opened by a link → «Ещё» → «Лиды» → «‹ Ещё»: dismissTo did nothing, the button was dead
    expect(goAction(["client/[id]", "(tabs)"], true)).toBe("navigate");
    // as before: a card over the tabs → down to them; alone → replace
    expect(goAction(["(tabs)", "settings/profile"], true)).toBe("dismissTo");
    expect(goAction(["(tabs)", "client/[id]", "job/[id]"], true)).toBe("dismissTo");
    expect(goAction(["client/[id]"], false)).toBe("replace");
    expect(goAction(["(tabs)"], false)).toBe("replace");
    expect(goAction([], false)).toBe("replace");
    expect(goAction(["settings/index", "client/[id]"], true)).toBe("dismissTo");
  });
  it("the app's stack is found under expo-router's «__root»", () => {
    const st = { routeNames: ["__root"], index: 0, routes: [{ name: "__root", state: { routeNames: ["(tabs)", "client/[id]"], index: 1, routes: [{ name: "client/[id]" }, { name: "(tabs)" }] } }] };
    expect(appStackRoutes(st)).toEqual(["client/[id]", "(tabs)"]);
    expect(appStackRoutes(undefined)).toEqual([]);
  });
});
