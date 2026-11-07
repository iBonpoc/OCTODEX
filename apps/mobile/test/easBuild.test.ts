/**
 * The phone build by hand (.github/workflows/eas-build.yml, docs/specs/27-push.md §2). Static checks of what must never
 * change silently: least rights, secrets only from ${{ secrets.* }} and never printed, the pinned eas-cli, and the builds
 * taking updates from the same channel as Expo Go (release.yml publishes to `preview`).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/eas-build.yml"), "utf8");
const code = wf.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
const eas = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/mobile/eas.json"), "utf8"));

describe("eas-build workflow", () => {
  it("runs only by hand, with read-only rights", () => {
    expect(code).toMatch(/on:\s*\n\s*workflow_dispatch:/);
    expect(code).not.toMatch(/^\s*(push|pull_request|pull_request_target|schedule):/m);
    expect(code).toMatch(/^permissions:\s*\n\s*contents: read\s*$/m);
    expect(code).not.toMatch(/:\s*write\b/);
  });
  it("takes secrets only from the secret store and never prints them", () => {
    for (const s of ["EXPO_TOKEN", "EXPO_ASC_API_KEY_P8", "EXPO_ASC_KEY_ID", "EXPO_ASC_ISSUER_ID", "EXPO_APPLE_TEAM_ID"]) {
      expect(code).toContain(`\${{ secrets.${s} }}`);
    }
    // no echo / cat / printf to the log of a secret value or of the key file
    expect(code).not.toMatch(/(echo|cat)\s+[^\n]*\$(P8|EXPO_ASC_API_KEY_PATH|EXPO_TOKEN)\b/);
    expect(code).toMatch(/printf '%s\\n' "\$P8" > "\$EXPO_ASC_API_KEY_PATH"/);
    expect(code).toMatch(/umask 077/);
    expect(code).not.toMatch(/set -x/);
  });
  it("uses the eas-cli pinned in release.yml", () => {
    const pins = [...code.matchAll(/eas-cli@([\w.]+)/g)].map((m) => m[1]);
    expect(pins.length).toBeGreaterThan(0);
    const release = fs.readFileSync(path.join(ROOT, ".github/workflows/release.yml"), "utf8");
    const pin = /eas-cli@([\d.]+)/.exec(release)?.[1];
    expect(new Set(pins)).toEqual(new Set([pin]));
  });
  it("both phone builds take updates from the channel release.yml publishes to", () => {
    expect(eas.build.preview.channel).toBe("preview");
    expect(eas.build.testflight.channel).toBe("preview");
    expect(eas.build.testflight.extends).toBe("production");
    // the Apple key comes from the job's environment, never written into eas.json
    expect(JSON.stringify(eas.submit.testflight)).not.toMatch(/BEGIN PRIVATE KEY|\.p8"/);
    expect(eas.submit.testflight.ios.ascApiKeyPath).toBe("$EXPO_ASC_API_KEY_PATH");
  });
});
