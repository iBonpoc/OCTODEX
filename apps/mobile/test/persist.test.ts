/**
 * Store debt (docs/specs/19 §6.12, BOARD «Записи руководителя №3»): the persistent state after sign-out and after
 * the account is deleted. Each case failed before the fix.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
import { applyUpdate, createWriter, forgetDeviceState, onDeviceForgotten } from "../src/data/persist";
import { isDeviceKey } from "../src/features/deleteAccount";

const written: [string, string][] = [];
const setItem = async (k: string, v: string) => void written.push([k, v]);
beforeEach(() => {
  written.length = 0;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("unit:persist — the 250 ms write of the old key", () => {
  it("a key change drops the pending write of the old key (a wipe in between is not undone)", () => {
    const w = createWriter(setItem);
    w.schedule("octo.cloud.v1.c1", '{"db":"company"}');
    w.keyChanged("octo.db.v5"); // signed out within 250 ms
    vi.advanceTimersByTime(300);
    expect(written).toEqual([]);
    w.schedule("octo.db.v5", '{"db":"demo"}');
    vi.advanceTimersByTime(300);
    expect(written).toEqual([["octo.db.v5", '{"db":"demo"}']]);
  });
  it("the same key: the pending write stays; a newer one replaces it", () => {
    const w = createWriter(setItem);
    w.schedule("k", "1");
    w.keyChanged("k");
    w.schedule("k", "2");
    vi.advanceTimersByTime(300);
    expect(written).toEqual([["k", "2"]]);
  });
  it("forget (the device was wiped): neither the pending write nor the reset to the initial value is stored", () => {
    const w = createWriter(setItem);
    w.schedule("octo.outbox.v1", '[{"op":"of the deleted person"}]');
    w.forget();
    w.schedule("octo.outbox.v1", "[]"); // the reset itself
    vi.advanceTimersByTime(300);
    expect(written).toEqual([]);
    w.schedule("octo.outbox.v1", '[{"op":"new"}]'); // later changes are stored again
    vi.advanceTimersByTime(300);
    expect(written).toEqual([["octo.outbox.v1", '[{"op":"new"}]']]);
  });
});

describe("unit:persist — a late refresh after sign-out", () => {
  it("an update bound to the company's cache is dropped once the state holds the demo key", () => {
    const demo = { key: "octo.db.v5", value: "demo", loaded: true };
    expect(applyUpdate(demo, "company data", "octo.cloud.v1.c1")).toBe(demo);
    expect(applyUpdate(demo, "demo 2", "octo.db.v5").value).toBe("demo 2");
    expect(applyUpdate(demo, (p: string) => p + "!").value).toBe("demo!"); // unbound: as before
  });
});

describe("unit:persist — the store in memory after the account is deleted", () => {
  it("every subscriber hears the wipe with the device-key rule; unsubscribed ones do not", () => {
    const heard: string[] = [];
    const offA = onDeviceForgotten((wiped) => wiped("octo.outbox.v1") && heard.push("outbox"));
    const offB = onDeviceForgotten((wiped) => wiped("octo.cloud.v1.c1") && heard.push("cache"));
    const offC = onDeviceForgotten((wiped) => wiped("octo.theme.v1") && heard.push("theme")); // not a person's key
    forgetDeviceState(isDeviceKey);
    expect(heard).toEqual(["outbox", "cache"]);
    offA();
    offB();
    offC();
    forgetDeviceState(isDeviceKey);
    expect(heard).toEqual(["outbox", "cache"]);
  });
});
