import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { themes } from "@octo/design-tokens";

// Bug: the Home Screen icon opened the site as a Safari tab (address bar + toolbar).
// The web template must declare the app as standalone, otherwise iOS/Android show browser chrome.
const pub = join(__dirname, "..", "public");
const html = readFileSync(join(pub, "index.html"), "utf8");
const manifest = JSON.parse(readFileSync(join(pub, "manifest.webmanifest"), "utf8"));

describe("PWA: Home Screen icon opens as an app", () => {
  it("index.html declares standalone mode for iOS and links the manifest", () => {
    expect(html).toMatch(/<meta name="apple-mobile-web-app-capable" content="yes"/);
    expect(html).toMatch(/<meta name="mobile-web-app-capable" content="yes"/);
    expect(html).toMatch(/<link rel="manifest" href="\/manifest.webmanifest"/);
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/apple-touch-icon.png"/);
  });

  it("viewport covers the notch so safe-area insets are real", () => {
    expect(html).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
  });

  it("status bar is drawn by iOS, so the clock is readable in both themes", () => {
    // black-translucent = white clock over the light theme bg (EFEBE5): unreadable
    expect(html).toMatch(/apple-mobile-web-app-status-bar-style" content="default"/);
  });

  it("manifest is standalone and its icons exist", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.id).toBe("/");
    for (const i of manifest.icons) expect(existsSync(join(pub, i.src))).toBe(true);
  });

  it("Android: 192 and 512 icons plus a maskable one (else the icon sits in a white circle)", () => {
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    const mask = manifest.icons.find((i: { purpose?: string }) => i.purpose === "maskable");
    expect(mask?.sizes).toBe("512x512");
  });

  it("colors are the theme bg tokens", () => {
    expect(html).toContain(`content="${themes.dark.bg}" media="(prefers-color-scheme: dark)"`);
    expect(html).toContain(`content="${themes.light.bg}" media="(prefers-color-scheme: light)"`);
    expect(manifest.background_color).toBe(themes.dark.bg);
    expect(manifest.theme_color).toBe(themes.dark.bg);
  });
});
