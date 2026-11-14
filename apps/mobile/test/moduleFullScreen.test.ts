/**
 * #1426 group D (design audit 14.11; DS Б11, §12.10): a module's full-screen screens (ModuleDef.fullScreen) hide the app's bottom
 * tabs and side menu — the route asks useHideTabBar for them; its lists and cards keep the chrome. Gutters: the canvas and its
 * speed check are full-screen; «Замеры», the review, the settings and the prices are not.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/cloud/client", () => ({ supabase: {} }));
import { moduleFullScreen, registerModule } from "../src/modules/registry";
import gutters from "../src/modules/gutters/module";

registerModule(gutters);

describe("moduleFullScreen", () => {
  it("Gutters: the canvas and the speed check take the whole screen", () => {
    expect(moduleFullScreen("gutters", "draw")).toBe(true);
    expect(moduleFullScreen("gutters", "bench")).toBe(true);
  });
  it("its lists, cards, settings and prices keep the bottom tabs and the side menu", () => {
    for (const s of ["list", "view", "start", "settings", "prices"]) expect(moduleFullScreen("gutters", s)).toBe(false);
  });
  it("an unknown module or screen, or nothing: not full-screen (the «no such screen» page keeps the chrome)", () => {
    expect(moduleFullScreen("roofing", "draw")).toBe(false);
    expect(moduleFullScreen("gutters", "nope")).toBe(false);
    expect(moduleFullScreen(undefined, "draw")).toBe(false);
    expect(moduleFullScreen("gutters", undefined)).toBe(false);
  });
  it("every full-screen name is a screen of the module (no typo hides nothing)", () => {
    for (const s of gutters.fullScreen ?? []) expect(Object.keys(gutters.screens ?? {})).toContain(s);
  });
});
