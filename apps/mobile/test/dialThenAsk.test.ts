/**
 * «Позвонить» → system dialer, and «Чем кончился?» only after the call (spec 20 §3: «при возврате в приложение»).
 * Founder 07.11: on the phone the call sheet slid up under the iOS «Позвонить с номера» dialog at the same time.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  os: "ios" as string,
  opened: [] as string[],
  listeners: [] as ((s: string) => void)[],
  removed: 0,
}));
vi.mock("react-native", () => ({
  Platform: { get OS() { return env.os; } },
  Linking: { openURL: async (u: string) => void env.opened.push(u) },
  AppState: {
    addEventListener: (_: string, f: (s: string) => void) => {
      env.listeners.push(f);
      return { remove: () => { env.removed++; env.listeners = env.listeners.filter((x) => x !== f); } };
    },
  },
}));

import { dialThenAsk } from "../src/features/comms/dial";

const emit = (s: string) => [...env.listeners].forEach((f) => f(s));

describe("dialThenAsk", () => {
  beforeEach(() => { env.os = "ios"; env.opened = []; env.listeners = []; env.removed = 0; });

  it("phone: opens the dialer, the sheet waits until the app comes back from the call", () => {
    const ask = vi.fn();
    dialThenAsk("(818) 555-0187", ask);
    expect(env.opened).toEqual(["tel:8185550187"]);
    expect(ask).not.toHaveBeenCalled();
    emit("inactive"); // the iOS «Позвонить с номера» dialog
    emit("background"); // the call is on
    expect(ask).not.toHaveBeenCalled();
    emit("active");
    expect(ask).toHaveBeenCalledTimes(1);
    expect(env.listeners).toHaveLength(0);
    emit("background"); emit("active");
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("phone: «Отменить» in the system dialog (inactive → active) asks nothing", () => {
    const ask = vi.fn();
    dialThenAsk("+18185550187", ask);
    emit("inactive");
    emit("active");
    expect(ask).not.toHaveBeenCalled();
    expect(env.opened).toEqual(["tel:+18185550187"]);
  });

  it("android works the same way", () => {
    env.os = "android";
    const ask = vi.fn();
    dialThenAsk("8185550187", ask);
    expect(ask).not.toHaveBeenCalled();
    emit("background"); emit("active");
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("web: no system dialog over the app — the sheet opens right away", () => {
    env.os = "web";
    const ask = vi.fn();
    dialThenAsk("8185550187", ask);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(env.listeners).toHaveLength(0);
  });

  it("the returned cancel drops the wait (screen left)", () => {
    const ask = vi.fn();
    const cancel = dialThenAsk("1", ask);
    cancel();
    emit("background"); emit("active");
    expect(ask).not.toHaveBeenCalled();
    expect(env.listeners).toHaveLength(0);
  });

  it("a new call drops the previous wait", () => {
    const a = vi.fn(), b = vi.fn();
    dialThenAsk("1", a);
    dialThenAsk("2", b);
    emit("background"); emit("active");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe("call buttons go through dialThenAsk (no sheet under the dialer)", () => {
  const files = ["src/features/client/ClientCard.tsx", "src/features/client/ClientSections.tsx", "src/features/lead/LeadParts.tsx"];
  it.each(files)("%s", (f) => {
    const src = readFileSync(join(__dirname, "..", f), "utf8");
    expect(src).not.toMatch(/openURL\(`tel:/);
    expect(src).toMatch(/(useDialThenAsk|dial)\(/);
    expect(src).toMatch(/useDialThenAsk/);
  });
});
