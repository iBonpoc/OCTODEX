/** Side menu geometry (docs/specs/13 §2.5, 13а §8). */
import { describe, expect, it } from "vitest";
import { component, layout, size, space } from "@octo/design-tokens";
import { contentWidth, isAppPath, navInsets, sideNavWidth } from "../src/nav/shell";

describe("side menu on 820/1280", () => {
  it("phone: none; tablet: the rail even when opened (the menu goes over it); desktop: rail or the open menu", () => {
    expect(sideNavWidth("phone", true)).toBe(0);
    expect(sideNavWidth("tablet", false)).toBe(component.navRail);
    expect(sideNavWidth("tablet", true)).toBe(component.navRail);
    expect(sideNavWidth("desktop", false)).toBe(component.navRail);
    expect(sideNavWidth("desktop", true)).toBe(component.navMenu);
  });
  it("1280 with the rail leaves rows ≈ 800 next to a 360 panel (13 §2.5)", () => {
    const rows = contentWidth(1280, "desktop", false) - component.panelW - 2 * 16;
    expect(rows).toBeGreaterThanOrEqual(800);
  });
  it("the content column still fits: 1280 − rail ≥ the content max width", () => {
    expect(contentWidth(1280, "desktop", false)).toBeGreaterThanOrEqual(layout.contentMax);
    expect(contentWidth(390, "phone", false)).toBe(390);
  });
});

describe("safe areas (docs/specs/32)", () => {
  const portrait = { top: 59, bottom: 34, left: 0, right: 0 };
  const landscape = { top: 0, bottom: 21, left: 59, right: 59 };
  it("sides: max(inset, 16) — the rule of the prototypes", () => {
    expect(navInsets(portrait, false, false)).toMatchObject({ left: space[4], right: space[4], edgeLeft: space[4] });
    expect(navInsets(landscape, false, false)).toMatchObject({ left: 59, right: 59, edgeLeft: 59 });
    expect(navInsets({ top: 0, bottom: 0, left: 8, right: 0 }, false, false).left).toBe(space[4]);
  });
  it("the side menu already keeps clear of the notch: the screen keeps 16 on the left, the right takes the notch", () => {
    const n = navInsets(landscape, true, true);
    expect(n.left).toBe(space[4]);
    expect(n.right).toBe(59);
    expect(n.edgeLeft).toBe(59);
  });
  it("top and bottom as before (header under the island, the tab bar above the home indicator)", () => {
    const n = navInsets(portrait, false, false);
    expect(n.top).toBe(59 + space[2]);
    expect(n.tabBottom).toBe(34);
    expect(n.bottom).toBe(34 + size.tabbarH + space[2] + space[6]);
    expect(navInsets({ top: 0, bottom: 0, left: 0, right: 0 }, false, false).tabBottom).toBe(space[3]);
    const w = navInsets(landscape, true, true);
    expect(w.top).toBe(space[3]);
    expect(w.bottom).toBe(21 + space[6]);
  });
  it("the side menu grows by the notch, the content loses it", () => {
    expect(sideNavWidth("tablet", false, 59)).toBe(component.navRail + 59);
    expect(sideNavWidth("phone", false, 59)).toBe(0);
    expect(contentWidth(844, "tablet", false, 59)).toBe(844 - component.navRail - 59);
  });
  it("the staff menu lives inside the app only", () => {
    expect(isAppPath("/clients")).toBe(true);
    expect(isAppPath("/p/abc")).toBe(false);
    expect(isAppPath("/auth")).toBe(false);
  });
});
