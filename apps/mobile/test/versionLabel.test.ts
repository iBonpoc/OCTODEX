import { describe, expect, it } from "vitest";
import { versionLabel, versionMoment } from "../src/features/versionLabel";

/** #1506: the header says which update is running — on the web, in a native build before its first update, and after one. */
const fmt = { day: (iso: string) => iso.slice(0, 10), time: (iso: string) => iso.slice(11, 16) };
const base = { app: "GoRix", version: "1.0.0", build: 1448, updatedAt: null, builtAt: "" };

describe("version label (#1506)", () => {
  it("web: the build's moment, not a bare number", () => {
    expect(versionLabel({ ...base, builtAt: "2026-11-15T07:20:00Z" }, fmt)).toBe("GoRix v1.0.0 · 1448 · 2026-11-15 07:20");
  });
  it("native without an update: the date of the native build", () => {
    expect(versionLabel({ ...base, builtAt: "2026-11-10T18:00:00Z" }, fmt)).toBe("GoRix v1.0.0 · 1448 · 2026-11-10 18:00");
    expect(versionMoment({ updatedAt: null, builtAt: "2026-11-10T18:00:00Z" })?.from).toBe("build");
  });
  it("native with an update: the update's moment wins over the build's", () => {
    const p = { ...base, updatedAt: "2026-11-15T09:05:00Z", builtAt: "2026-11-10T18:00:00Z" };
    expect(versionLabel(p, fmt)).toBe("GoRix v1.0.0 · 1448 · 2026-11-15 09:05");
    expect(versionMoment(p)?.from).toBe("update");
  });
  it("a local build: «dev», no date", () => {
    expect(versionLabel({ ...base, build: 0 }, fmt)).toBe("GoRix v1.0.0 · dev");
  });
});
