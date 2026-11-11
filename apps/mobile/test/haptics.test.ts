import { describe, expect, it } from "vitest";
import { createHaptics, HAPTICS_KEY, parseHapticsPref, type HapticBackend } from "../src/ui/hapticsCore";

function spy() {
  const calls: string[] = [];
  const ok = async () => {};
  const backend: HapticBackend = {
    selection: () => (calls.push("selection"), ok()),
    impact: (s) => (calls.push(`impact:${s}`), ok()),
    notify: (t) => (calls.push(`notify:${t}`), ok()),
  };
  return { calls, backend };
}

describe("haptics — one module, one switch (DS §15.6, В-20)", () => {
  it("on: every kind goes to the matching feedback of the map", () => {
    const { calls, backend } = spy();
    const h = createHaptics(backend, () => true);
    h.selection(); h.light(); h.medium(); h.success(); h.warning(); h.error();
    expect(calls).toEqual(["selection", "impact:light", "impact:medium", "notify:success", "notify:warning", "notify:error"]);
  });
  it("off: not a single call reaches the device", () => {
    const { calls, backend } = spy();
    const h = createHaptics(backend, () => false);
    h.selection(); h.light(); h.medium(); h.success(); h.warning(); h.error();
    expect(calls).toEqual([]);
  });
  it("the switch is read at every call, not once", () => {
    const { calls, backend } = spy();
    let on = true;
    const h = createHaptics(backend, () => on);
    h.success(); on = false; h.success(); on = true; h.success();
    expect(calls).toEqual(["notify:success", "notify:success"]);
  });
  it("a failing or throwing engine never breaks the action", () => {
    const h = createHaptics({ selection: () => Promise.reject(new Error("x")), impact: () => { throw new Error("y"); }, notify: () => Promise.reject(1) }, () => true);
    expect(() => { h.selection(); h.light(); h.error(); }).not.toThrow();
  });
  it("default is on; only a stored false switches it off", () => {
    expect(parseHapticsPref(null)).toBe(true);
    expect(parseHapticsPref(undefined)).toBe(true);
    expect(parseHapticsPref("true")).toBe(true);
    expect(parseHapticsPref("garbage")).toBe(true);
    expect(parseHapticsPref("false")).toBe(false);
  });
  it("the setting is a device key — not wiped with the account, like the theme and the language", async () => {
    const { isDeviceKey } = await import("../src/features/deleteAccount");
    expect(isDeviceKey(HAPTICS_KEY)).toBe(false);
    expect(isDeviceKey("octo.theme.v1")).toBe(false);
  });
});
