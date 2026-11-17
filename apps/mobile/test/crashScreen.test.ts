/**
 * #1555: the root layout must export the router's ErrorBoundary, and it must stand outside the providers (a failure may be in them).
 * Source checks — the screen itself is drawn in the showcase (e2e 455); a real crash on the phone is checked by hand (rule 27).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ru } from "../src/i18n/ru";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";

const SRC = path.resolve(__dirname, "../src");
const read = (f: string) => fs.readFileSync(path.join(SRC, f), "utf8");

describe("unit:crashScreen — the root's ErrorBoundary (#1555)", () => {
  it("app/_layout.tsx exports ErrorBoundary that draws CrashScreen", () => {
    const layout = read("app/_layout.tsx");
    expect(layout).toMatch(/export function ErrorBoundary\(props: ErrorBoundaryProps\)/);
    expect(layout).toMatch(/<CrashScreen \{\.\.\.props\} \/>/);
  });
  it("CrashScreen needs no provider: the system's theme, the device's language, the splash released, no raw error on the screen", () => {
    const src = read("features/CrashScreen.tsx");
    expect(src).toContain("StaticThemeProvider");
    expect(src).toContain("deviceDocLang()");
    expect(src).toContain("releaseSplash()");
    expect(src).not.toMatch(/useI18n|useStore|useAuth/);
    expect(src).not.toMatch(/\{error\.message\}|\{String\(error\)\}/); // the error goes to the console, not to the screen
  });
  it("the words exist in all three languages", () => {
    for (const k of ["crash.title", "crash.body", "crash.retry", "crash.restart"] as const) {
      for (const d of [ru, en, es]) expect(String(d[k]).length, k).toBeGreaterThan(3);
    }
  });
});
