/** The back swipe of a tab screen (founder 08.11: «с вкладки Лиды я не могу смахнуть назад»; nav/backSwipe.ts). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { space } from "@octo/design-tokens";
import { navInsets } from "../src/nav/shell";
import { BACK_SWIPE_DISTANCE, backSwipeEdge, swipeGoesBack, tabBackSwipe } from "../src/nav/backSwipe";
import { isTabScreen } from "../src/nav/roles";
import { popsToTab, type NavState } from "../src/nav/tabBarRule";

const phone = { tabScreen: true, wide: false, os: "ios", back: true };

describe("when a screen swipes back itself", () => {
  it("a tab screen on the phone with a header «back» (Leads from «Ещё», another role's home)", () => {
    expect(tabBackSwipe(phone)).toBe(true);
    expect(tabBackSwipe({ ...phone, os: "web" })).toBe(true);
    expect(isTabScreen("leads") && isTabScreen("triage")).toBe(true);
  });
  it("a bottom-bar tab root, the sales home: no «back» — no swipe", () => {
    expect(tabBackSwipe({ ...phone, back: false })).toBe(false);
  });
  it("a root-Stack screen: the native swipe is there — not a second one", () => {
    expect(tabBackSwipe({ ...phone, tabScreen: false })).toBe(false);
    expect(isTabScreen("jobs")).toBe(false);
  });
  it("820/1280: the side menu; Android: the system back already walks the tabs", () => {
    expect(tabBackSwipe({ ...phone, wide: true })).toBe(false);
    expect(tabBackSwipe({ ...phone, os: "android" })).toBe(false);
  });
  it("the keyboard is up: no swipe", () => {
    expect(tabBackSwipe({ ...phone, keyboard: true })).toBe(false);
  });
});

describe("letting go", () => {
  it("far or fast enough — back; short and slow, or leftward — springs back", () => {
    expect(swipeGoesBack(390 * BACK_SWIPE_DISTANCE + 1, 0, 390)).toBe(true);
    expect(swipeGoesBack(40, 900, 390)).toBe(true);
    expect(swipeGoesBack(40, 100, 390)).toBe(false);
    expect(swipeGoesBack(-200, 900, 390)).toBe(false);
    expect(swipeGoesBack(0, 900, 390)).toBe(false);
  });
  it("it starts only in the screen's left margin, where nothing of the screen lies (the filter lane is at 16)", () => {
    const left = navInsets({ top: 0, bottom: 0, left: 0, right: 0 }, false, false).left;
    expect(backSwipeEdge(left)).toBe(space[4]);
  });
});

describe("the Screen uses the header's own handler", () => {
  const src = readFileSync(join(__dirname, "../src/ui/surfaces.tsx"), "utf8");
  it("the swipe and the button do the same", () => {
    expect(src).toMatch(/<BackSwipe enabled=\{swipeBack\} edge=\{navInsets\.left\} onBack=\{hasUp \? goUp : toMore\}>/);
    expect(src).toMatch(/testID="back-more"\s+onPress=\{toMore\}/);
    expect(src).toMatch(/onPress=\{goUp\}/);
  });
});

describe("«‹ Лиды» from a lead card keeps the tab's params (popsToTab)", () => {
  const st = (tab: { name: string; params?: object }, above: string[]): NavState => ({
    routeNames: ["(tabs)", "lead/[id]"],
    index: above.length,
    routes: [{ name: "(tabs)", state: { index: 0, routes: [tab] } }, ...above.map((name) => ({ name }))],
  });
  const leads = { name: "leads", params: { tab: "leads", from: "more" } };
  it("the tab under the cards is that screen: pop them", () => {
    expect(popsToTab(st(leads, ["lead/[id]"]), "/leads?tab=leads")).toBe(1);
    expect(popsToTab(st(leads, ["lead/[id]", "estimate/[id]"]), "/leads?tab=leads")).toBe(2);
    // under expo-router's «__root»
    expect(popsToTab({ routeNames: ["__root"], index: 0, routes: [{ name: "__root", state: st(leads, ["lead/[id]"]) }] }, "/leads?tab=leads")).toBe(1);
  });
  it("another tab, other params, a deeper address, nothing above the tabs: not this case", () => {
    expect(popsToTab(st({ name: "today" }, ["lead/[id]"]), "/leads?tab=leads")).toBe(0);
    expect(popsToTab(st(leads, ["lead/[id]"]), "/leads?tab=estimates")).toBe(0);
    expect(popsToTab(st(leads, ["lead/[id]"]), "/lead/l1")).toBe(0);
    expect(popsToTab(st(leads, []), "/leads?tab=leads")).toBe(0);
    expect(popsToTab(undefined, "/leads")).toBe(0);
  });
});
