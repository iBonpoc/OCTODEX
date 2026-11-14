/**
 * The phone build (.github/workflows/eas-build.yml, docs/specs/27-push.md §2, docs/specs/30-ios-testflight.md). Static checks
 * of what must never change silently: least rights, no Apple key in GitHub or in the repository, the pinned eas-cli, the
 * builds taking updates from the channel Expo Go uses, and what Apple checks on upload (encryption, privacy manifest,
 * microphone text, icon).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const MOBILE = path.join(ROOT, "apps/mobile");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const noComments = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

const wf = noComments(read(".github/workflows/eas-build.yml"));
const first = noComments(read("apps/mobile/scripts/ios-first-build.sh"));
const easText = read("apps/mobile/eas.json");
const eas = JSON.parse(easText);
const app = JSON.parse(read("apps/mobile/app.json")).expo;
const pkg = JSON.parse(read("apps/mobile/package.json"));
const releasePin = /eas-cli@([\d.]+)/.exec(read(".github/workflows/release.yml"))?.[1];

describe("eas-build workflow", () => {
  it("runs only by hand, with read-only rights", () => {
    expect(wf).toMatch(/on:\s*\n\s*workflow_dispatch:/);
    expect(wf).not.toMatch(/^\s*(push|pull_request|pull_request_target|schedule):/m);
    expect(wf).toMatch(/^permissions:\s*\n\s*contents: read\s*$/m);
    expect(wf).not.toMatch(/:\s*write\b/);
    expect(wf).not.toMatch(/set -x/);
  });
  it("the only secret is EXPO_TOKEN: no Apple key in GitHub (spec 30, п.4)", () => {
    const secrets = new Set([...wf.matchAll(/\$\{\{\s*secrets\.(\w+)\s*\}\}/g)].map((m) => m[1]));
    expect(secrets).toEqual(new Set(["EXPO_TOKEN"]));
    expect(wf).not.toMatch(/EXPO_ASC_|EXPO_APPLE_|\.p8\b|PRIVATE KEY/);
    expect(wf).not.toMatch(/(echo|cat|printf)\s+[^\n]*\$\{?EXPO_TOKEN\b/);
  });
  it("uses the eas-cli pinned in release.yml", () => {
    const pins = [...wf.matchAll(/eas-cli@([\w.]+)/g)].map((m) => m[1]);
    expect(pins.length).toBeGreaterThan(0);
    expect(new Set(pins)).toEqual(new Set([releasePin]));
  });
  it("ios builds start on EAS without waiting, and never prompt", () => {
    const ios = wf.match(/eas-cli@[\d.]+ build --platform ios[^\n]*/g) ?? [];
    expect(ios.length).toBe(2);
    for (const l of ios) {
      expect(l).toContain("--profile testflight");
      expect(l).toContain("--non-interactive");
      expect(l).toContain("--no-wait");
    }
    expect(ios.filter((l) => l.includes("--auto-submit-with-profile=testflight")).length).toBe(1);
  });
  it("TestFlight submit stops early without the app id, and a failed ios run points to ios:first", () => {
    expect(wf).toMatch(/inputs\.ios_submit[\s\S]*?ascAppId[\s\S]*?exit 1/);
    expect(wf).toMatch(/if: failure\(\) && inputs\.platform == 'ios'[\s\S]*?ios:first/);
  });
});

describe("the one-time first iPhone build (npm run ios:first)", () => {
  it("is a script of the app, run interactively with the same eas-cli", () => {
    expect(pkg.scripts["ios:first"]).toBe("bash scripts/ios-first-build.sh");
    const build = first.match(/build --platform ios[^\n]*/g) ?? [];
    expect(build).toEqual(["build --platform ios --profile testflight --auto-submit-with-profile=testflight"]);
    expect(first).not.toContain("--non-interactive");
    expect(first).toContain(`eas-cli@${releasePin}`);
    expect(first).toMatch(/^set -euo pipefail$/m);
    expect(first).not.toMatch(/^\s*set -x/m);
  });
  it("signs in with the Apple ID, never with a key from the environment, and needs the push module", () => {
    expect(first).toMatch(/unset EXPO_ASC_API_KEY_PATH EXPO_ASC_KEY_ID EXPO_ASC_ISSUER_ID/);
    expect(first).toContain('"expo-notifications"');
  });
});

describe("eas.json", () => {
  it("holds no Apple key; ascAppId is absent or just digits (not a secret)", () => {
    expect(easText).not.toMatch(/EXPO_ASC_|ascApiKey|appleTeamId|\.p8|PRIVATE KEY/);
    const id = eas.submit.testflight.ios.ascAppId;
    if (id !== undefined) expect(String(id)).toMatch(/^\d+$/);
  });
  it("both phone builds take updates from the channel release.yml publishes to", () => {
    expect(eas.build.preview.channel).toBe("preview");
    expect(eas.build.testflight.channel).toBe("preview");
    expect(eas.build.testflight.extends).toBe("production");
    expect(read(".github/workflows/release.yml")).toMatch(/update --channel preview --platform all/);
    expect(eas.cli.appVersionSource).toBe("remote");
    expect(eas.build.production.autoIncrement).toBe(true);
  });
});

describe("app.json: what the build and Expo Go share (spec 30, п.8–9)", () => {
  it("one runtime for Expo Go and the build, updates from our project", () => {
    expect(app.runtimeVersion).toEqual({ policy: "sdkVersion" });
    expect(app.updates.url).toBe(`https://u.expo.dev/${app.extra.eas.projectId}`);
    expect(pkg.dependencies["expo-updates"]).toBeTruthy();
    expect(app.ios.bundleIdentifier).toBe("com.gorix.app");
    expect(app.android.package).toBe("com.gorix.app");
  });
  // #656 слой 2: the app is GoRix — its own scheme only (nothing ever linked to octodex://; sign-in goes over https)
  it("the link scheme is gorix:// only", () => {
    expect(app.scheme).toBe("gorix");
  });
  it("#656: the new App Store record; Android stops at once until Firebase has com.gorix.app (#1444)", () => {
    expect(eas.submit.testflight.ios.ascAppId).toBe("6834689554");
    expect(wf).toMatch(/Android paused[\s\S]*?inputs\.platform == 'android'[\s\S]*?exit 1/);
    // while Android is paused, a build started without a choice is iOS (review #1448)
    expect(wf).toMatch(/options: \[android, ios\]\s*default: ios/);
    for (const f of [JSON.stringify(app), JSON.stringify(eas)]) expect(f).not.toMatch(/com\.octodex\.app|6831904411/);
  });
  // A JS update reaches a build made before a new native module was added: the update must load such a module lazily
  // (like src/features/pushNative.ts) and a new TestFlight build is needed. Update this list in the same PR.
  it("the native modules are the known ones", () => {
    const NATIVE = [
      "@react-native-async-storage/async-storage", "expo", "expo-blur", "expo-clipboard", "expo-constants", "expo-crypto",
      "expo-document-picker", "expo-file-system", "expo-font", "expo-glass-effect", "expo-haptics", "expo-image-manipulator", "expo-image-picker",
      "expo-linking", "expo-localization", "expo-location", "expo-notifications", "expo-print", "expo-router", "expo-sharing",
      "expo-splash-screen", "expo-status-bar", "expo-updates", "react-native", "react-native-gesture-handler", "react-native-reanimated",
      "react-native-safe-area-context", "react-native-screens", "react-native-svg", "react-native-worklets",
    ];
    // native = the package ships iOS code (an Expo module, an ios/ folder or a podspec); without node_modules — by name
    const nm = path.join(ROOT, "node_modules");
    const isNative = (d: string) => {
      const dir = path.join(nm, d);
      if (!fs.existsSync(dir)) return /^(expo$|expo-|react-native-(?!web$|url-polyfill$)|react-native$|@react-native)/.test(d);
      const f = fs.readdirSync(dir);
      return f.includes("expo-module.config.json") || f.includes("ios") || f.some((x) => x.endsWith(".podspec"));
    };
    const native = Object.keys(pkg.dependencies).filter(isNative);
    const unknown = native.filter((d) => !NATIVE.includes(d));
    expect(unknown, "a new native module: lazy-load it and make a new TestFlight build (spec 30 п.9), then add it here").toEqual([]);
  });
});

describe("app.json: what Apple checks on upload", () => {
  it("no export-compliance question (standard encryption only)", () => {
    expect(app.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
    expect(app.ios.config.usesNonExemptEncryption).toBe(false);
  });
  it("no microphone text: we take photos, not video", () => {
    expect(app.ios.infoPlist.NSMicrophoneUsageDescription).toBeUndefined();
    const picker = (app.plugins as unknown[]).find((p) => Array.isArray(p) && p[0] === "expo-image-picker") as [string, Record<string, unknown>];
    expect(picker[1].microphonePermission).toBe(false);
  });
  // Plugins write their own "Allow $(PRODUCT_NAME)…" texts unless told otherwise (seen with `expo config --type introspect`).
  it("location: honest texts for the Always keys Apple scans for, no motion and no temporary full accuracy", () => {
    const loc = (app.plugins as unknown[]).find((p) => Array.isArray(p) && p[0] === "expo-location") as [string, Record<string, unknown>];
    for (const k of ["locationAlwaysAndWhenInUsePermission", "locationAlwaysPermission"]) {
      expect(String(loc[1][k]), k).toMatch(/never uses your location in the background/);
    }
    expect(loc[1].motionUsagePermission).toBe(false);
    expect(loc[1].locationFullAccuracyPermission).toBe(false);
    expect(loc[1].isIosBackgroundLocationEnabled).toBe(false);
    for (const lang of ["en", "ru", "es"]) {
      const ios = JSON.parse(read(`apps/mobile/locales/${lang}.json`)).ios;
      for (const k of ["NSLocationAlwaysAndWhenInUseUsageDescription", "NSLocationAlwaysUsageDescription"]) {
        expect(String(ios[k] ?? "").length, `${lang} ${k}`).toBeGreaterThan(20);
      }
    }
    expect(JSON.stringify(app)).not.toContain("$(PRODUCT_NAME)");
  });
  it("the icon is 1024×1024 without an alpha channel", () => {
    const png = fs.readFileSync(path.join(MOBILE, app.icon));
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
    expect([2, 3]).toContain(png[25]); // PNG colour type: 2 RGB, 3 palette (4 and 6 carry alpha)
    if (png[25] === 3) expect(png.includes(Buffer.from("tRNS"))).toBe(false);
  });

  const manifest = app.ios.privacyManifests;
  const declared = new Map<string, string[]>(
    manifest.NSPrivacyAccessedAPITypes.map((t: { NSPrivacyAccessedAPIType: string; NSPrivacyAccessedAPITypeReasons: string[] }) => [
      t.NSPrivacyAccessedAPIType, t.NSPrivacyAccessedAPITypeReasons,
    ]),
  );
  it("privacy manifest: no tracking, every declared API has a reason", () => {
    expect(manifest.NSPrivacyTracking).toBe(false);
    expect(manifest.NSPrivacyTrackingDomains).toEqual([]);
    expect(declared.size).toBeGreaterThan(0);
    for (const [api, reasons] of declared) {
      expect(api).toMatch(/^NSPrivacyAccessedAPICategory\w+$/);
      expect(reasons.length, api).toBeGreaterThan(0);
      for (const r of reasons) expect(r).toMatch(/^[0-9A-F]{4}\.\d$/);
    }
  });

  // Apple does not always read PrivacyInfo of static CocoaPods (docs.expo.dev/guides/apple-privacy), so the app repeats them.
  const nm = path.join(ROOT, "node_modules");
  const files: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) {
        if (e.name === "PrivacyInfo.xcprivacy") files.push(path.join(dir, e.name));
        continue;
      }
      if (/^(example|examples|fixtures|template|templates|apps|\.bin|test|__tests__)$/.test(e.name)) continue;
      walk(path.join(dir, e.name), depth + 1);
    }
  };
  if (fs.existsSync(nm)) {
    const roots = Object.keys(pkg.dependencies).concat("expo-eas-client", "expo-constants", "expo-file-system");
    for (const d of new Set(roots)) if (fs.existsSync(path.join(nm, d))) walk(path.join(nm, d), 0);
  }
  it.skipIf(files.length === 0)("privacy manifest covers every PrivacyInfo.xcprivacy of the installed packages", () => {
    for (const f of files) {
      const xml = fs.readFileSync(f, "utf8");
      for (const block of xml.split("<key>NSPrivacyAccessedAPIType</key>").slice(1)) {
        const api = /<string>([^<]+)<\/string>/.exec(block)?.[1] ?? "";
        const reasonsXml = block.split("<key>NSPrivacyAccessedAPITypeReasons</key>")[1]?.split("</array>")[0] ?? "";
        const reasons = [...reasonsXml.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]);
        const have = declared.get(api) ?? [];
        for (const r of reasons) expect(have, `${path.relative(ROOT, f)}: ${api} ${r}`).toContain(r);
      }
    }
  });
});
