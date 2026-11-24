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
  it("every screen's header carries it in its smallest line (visual-v2): a root by the date, an object by the parent, an editor in its state", () => {
    const h = readFileSync(join(__dirname, "..", "src", "ui", "templates", "screenHeader.tsx"), "utf8");
    // the root's 13 line and the object's parent word each hold the plate; the editor's state line says the word; folded — the dot
    expect(h.match(/<DemoPlate \/>/g)?.length).toBe(2);
    expect(h).toMatch(/demo\.shown \? demo\.word : null/);
    expect(h).toMatch(/<DemoDot \/>/);
    // every Screen draws the one header
    const s = readFileSync(join(__dirname, "..", "src", "ui", "surfaces.tsx"), "utf8");
    expect(s).toMatch(/<HeaderBar\b/);
    expect(s).toMatch(/<HeaderBig\b/);
  });
  it("no version line over the headers any more: it is at the bottom of «Ещё» and in «Настройки → О приложении»", () => {
    const s = readFileSync(join(__dirname, "..", "src", "ui", "surfaces.tsx"), "utf8");
    expect(s).not.toMatch(/VersionBadge|VersionLine/);
    for (const f of [["app", "(tabs)", "more.tsx"], ["app", "settings", "index.tsx"]]) expect(readFileSync(join(__dirname, "..", "src", ...f), "utf8"), f.join("/")).toMatch(/<VersionLine\b/);
  });
});
