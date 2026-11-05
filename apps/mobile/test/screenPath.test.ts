import { describe, expect, it } from "vitest";
import { screenPath } from "../src/ui/screenPath";

describe("screenPath — a screen's own address", () => {
  it("a tab list is its tab, never the card above it", () => {
    expect(screenPath("clients")).toBe("/clients");
    expect(screenPath("(tabs)/clients")).toBe("/clients");
  });
  it("a card fills in its id", () => {
    expect(screenPath("client/[id]", { id: "c1" })).toBe("/client/c1");
  });
  it("index and groups drop out", () => {
    expect(screenPath("index")).toBe("/");
    expect(screenPath("settings/index")).toBe("/settings");
    expect(screenPath("(tabs)")).toBe("/");
  });
  it("catch-all segments join", () => {
    expect(screenPath("p/[...rest]", { rest: ["a", "b"] })).toBe("/p/a/b");
  });
});

describe("the screen header reads its own route", () => {
  it("not the app's address — that one still points at the card while «back» slides it away", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(__dirname, "../src/ui/surfaces.tsx"), "utf8");
    expect(src).not.toMatch(/\busePathname\s*\(/);
    expect(src).not.toMatch(/\buseGlobalSearchParams\s*\(/);
    expect(src).toMatch(/screenPath\(useRoute\(\)\.name/);
  });
});
