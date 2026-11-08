// The tab bar's surface (src/nav/tabGlass.ts): liquid glass only where iOS has it, else the old blur panel
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

import { deviceTabSurface, tabSurface } from "@/nav/tabGlass";

const mod = (api: boolean, liquid: boolean) => () => ({ isGlassEffectAPIAvailable: () => api, isLiquidGlassAvailable: () => liquid });

describe("tabSurface", () => {
  it("iOS 26 with the API: liquid glass (GlassView)", () => {
    expect(tabSurface({ os: "ios", load: mod(true, true) })).toBe("liquid");
  });
  it("iOS without Liquid Glass (iOS 18 and older): the old panel", () => {
    expect(tabSurface({ os: "ios", load: mod(true, false) })).toBe("blur");
  });
  it("an iOS 26 beta without the API: the old panel, GlassView would crash", () => {
    expect(tabSurface({ os: "ios", load: mod(false, true) })).toBe("blur");
  });
  it("require(\"expo-glass-effect\") throws — a build without the native module (old TestFlight + a JS update): the old panel, no crash", () => {
    const load = () => {
      throw new Error("Cannot find native module 'ExpoGlassEffect'");
    };
    expect(tabSurface({ os: "ios", load })).toBe("blur");
  });
  it("Android and the web: the old panel, the module is not even loaded", () => {
    const load = vi.fn(mod(true, true));
    expect(tabSurface({ os: "android", load })).toBe("blur");
    expect(tabSurface({ os: "web", load })).toBe("blur");
    expect(load).not.toHaveBeenCalled();
  });
  it("this device (web in tests): the old panel", () => {
    expect(deviceTabSurface()).toBe("blur");
  });
});
