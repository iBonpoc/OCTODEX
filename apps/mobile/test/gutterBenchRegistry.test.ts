/**
 * The speed check is a developer's screen: the module registers its route only where it is offered (Expo Go, a development build).
 * The shared route module/[key]/[screen] opens whatever a module registers — so the store build and the web must not register it.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("../src/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));

const env = { offered: false };
vi.mock("../src/modules/gutters/bench/visible", () => ({ benchOffered: () => env.offered, benchOfferedHere: () => env.offered }));

const load = async () => {
  vi.resetModules();
  return (await import("../src/modules/gutters/module")).default;
};

describe("the speed check's route", () => {
  it("the store build and the web (not offered): no «bench» screen, no action to it", async () => {
    env.offered = false;
    const g = await load();
    expect(Object.keys(g.screens ?? {})).not.toContain("bench");
    expect(Object.keys(g.screens ?? {})).toEqual(expect.arrayContaining(["draw", "view", "list", "settings", "prices"]));
    expect(g.fullScreen).not.toContain("bench");
  });
  it("Expo Go / a development build (offered): the screen is there", async () => {
    env.offered = true;
    const g = await load();
    expect(Object.keys(g.screens ?? {})).toContain("bench");
    expect(g.fullScreen).toContain("bench");
  });
});
