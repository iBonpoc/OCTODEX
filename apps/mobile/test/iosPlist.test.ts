/**
 * The guard of the FINAL iOS config (docs/16-appstore-readiness.md п. 22, 23; docs/specs/59 task 2): app.json is not what Apple sees —
 * the plugins add keys of their own. `expo config --type introspect` returns the config after every plugin ran (no ios/ folder, nothing
 * installed). It must hold exactly the usage texts we wrote, and no background location, microphone, tracking, motion or background modes.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const MOBILE = path.resolve(__dirname, "..");

function introspect(): { ios: { infoPlist: Record<string, unknown> } } {
  const out = execFileSync("npx", ["expo", "config", "--type", "introspect", "--json"], { cwd: MOBILE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 90_000 });
  return JSON.parse(out.slice(out.indexOf("{")));
}

// exactly these, each with the text we wrote (app.json plugin settings) — a new key is a decision, not an accident
const ALLOWED = ["NSCameraUsageDescription", "NSLocationWhenInUseUsageDescription", "NSPhotoLibraryUsageDescription"];

describe("final iOS config (after the plugins)", () => {
  const plist = introspect().ios.infoPlist;
  const keys = Object.keys(plist);

  it("the usage texts are exactly the allowed ones", () => {
    expect(keys.filter((k) => /^NS\w+UsageDescription$/.test(k)).sort()).toEqual(ALLOWED);
  });
  it("no background location, microphone, tracking, motion, Bluetooth or contacts keys", () => {
    expect(keys.filter((k) => /^(NSLocationAlways|NSMicrophone|NSUserTracking|NSMotion|NSContacts|NSBluetooth)/.test(k))).toEqual([]);
  });
  it("no background modes", () => {
    expect(plist.UIBackgroundModes).toBeUndefined();
  });
  it("no template text left by a plugin", () => {
    // the Xcode template variables of CFBundleName etc. are normal; the plugins' «Allow $(PRODUCT_NAME) to…» texts are not
    for (const k of ALLOWED) {
      expect(String(plist[k]), k).not.toContain("$(PRODUCT_NAME)");
      expect(String(plist[k]).length, k).toBeGreaterThan(20);
    }
  });
});
