/** Side menu geometry (docs/specs/13 §2.5, 13а §8). */
import { describe, expect, it } from "vitest";
import { component, layout } from "@octo/design-tokens";
import { contentWidth, sideNavWidth } from "../src/nav/shell";

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
