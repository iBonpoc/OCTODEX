/**
 * Permission texts (7а-1; App Store 5.1.1 / 5.1.5, docs/specs/14-app-store.md §4): every iOS usage description has an
 * English base text (no Cyrillic) in app.json, and the same keys in every locale file listed under expo.locales; the
 * image-picker plugin shows the same English base texts.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const app = JSON.parse(readFileSync(join(ROOT, "app.json"), "utf8")).expo;
const plist: Record<string, unknown> = app.ios.infoPlist;
const usage = Object.keys(plist).filter((k) => /^NS\w+UsageDescription$/.test(k));
const CYR = /[А-Яа-яЁё]/;

describe("app.json: permission texts", () => {
  it("there are usage descriptions (camera, photos)", () => {
    expect(usage).toEqual(expect.arrayContaining(["NSCameraUsageDescription", "NSPhotoLibraryUsageDescription"]));
  });
  it("the base text is English and says why", () => {
    for (const k of usage) {
      const v = String(plist[k]);
      expect(v.length, k).toBeGreaterThan(10);
      expect(CYR.test(v), `${k}: ${v}`).toBe(false);
    }
  });
  it("localized texts are switched on and every locale has every key", () => {
    expect(plist.CFBundleAllowMixedLocalizations).toBe(true);
    const locales: Record<string, string> = app.locales;
    expect(Object.keys(locales).sort()).toEqual(["en", "es", "ru"]);
    for (const [lang, file] of Object.entries(locales)) {
      const p = join(ROOT, file);
      expect(existsSync(p), p).toBe(true);
      const ios = JSON.parse(readFileSync(p, "utf8")).ios ?? {};
      for (const k of usage) expect(String(ios[k] ?? "").length, `${lang} ${k}`).toBeGreaterThan(10);
      if (lang === "ru") for (const k of usage) expect(CYR.test(ios[k]), `ru ${k}`).toBe(true);
      if (lang === "en") for (const k of usage) expect(ios[k], `en ${k}`).toBe(plist[k]);
    }
  });
  it("the image-picker plugin uses the same English base texts", () => {
    const picker = (app.plugins as unknown[]).find((p) => Array.isArray(p) && p[0] === "expo-image-picker") as [string, Record<string, string>];
    expect(picker[1].cameraPermission).toBe(plist.NSCameraUsageDescription);
    expect(picker[1].photosPermission).toBe(plist.NSPhotoLibraryUsageDescription);
  });
});
