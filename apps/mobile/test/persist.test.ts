/**
 * Store debt (docs/specs/19 §6.12, BOARD «Записи руководителя №3»): the persistent state after sign-out and after
 * the account is deleted. Each case failed before the fix.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
import { applyUpdate, createWriter, deviceGeneration, flushAllWriters, forgetDeviceState, liveWriters, onDeviceForgotten } from "../src/data/persist";
import { isDeviceKey } from "../src/features/deleteAccount";

const written: [string, string][] = [];
const setItem = async (k: string, v: string) => void written.push([k, v]);
beforeEach(() => {
  written.length = 0;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("unit:persist — the writer: the old key, the wipe (review #231)", () => {
  it("a key change writes the pending change of the old key at once — the last change is never lost", () => {
    const w = createWriter(setItem);
    w.schedule("octo.cloud.v1.c1", '{"db":"last edit"}');
    w.keyChanged("octo.db.v5"); // the memberships went empty without the network: the store fell back to the demo
    expect(written).toEqual([["octo.cloud.v1.c1", '{"db":"last edit"}']]);
    vi.advanceTimersByTime(300);
    expect(written).toHaveLength(1); // once
  });
  it("the same key: the pending write stays; a newer one replaces it", () => {
    const w = createWriter(setItem);
    w.schedule("k", "1");
    w.keyChanged("k");
    w.schedule("k", "2");
    vi.advanceTimersByTime(300);
    expect(written).toEqual([["k", "2"]]);
  });
  it("forget drops the pending write; later changes are written again", () => {
    const w = createWriter(setItem);
    w.schedule("octo.outbox.v1", '[{"op":"of the deleted person"}]');
    w.forget();
    vi.advanceTimersByTime(300);
    expect(written).toEqual([]);
    w.schedule("octo.outbox.v1", '[{"op":"new"}]');
    vi.advanceTimersByTime(300);
    expect(written).toEqual([["octo.outbox.v1", '[{"op":"new"}]']]);
  });
  it("a write scheduled before a wipe never lands after it (the generation moved) — also on a key change", () => {
    const w = createWriter(setItem);
    w.schedule("octo.cloud.v1.c1", "company");
    forgetDeviceState(() => false); // the generation grows even when no state here was wiped
    vi.advanceTimersByTime(300);
    w.schedule("octo.role.v1", '"tech"');
    forgetDeviceState(() => false);
    w.keyChanged("octo.db.v5");
    expect(written).toEqual([]);
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
    const g = deviceGeneration();
    forgetDeviceState(isDeviceKey);
    expect(heard).toEqual(["outbox", "cache"]);
    expect(deviceGeneration()).toBe(g + 1);
    offA();
    offB();
    offC();
    forgetDeviceState(isDeviceKey);
    expect(heard).toEqual(["outbox", "cache"]);
  });
});

describe("unit:persist — a change in the last 250 ms is not lost (rule 6, review #263)", () => {
  it("the app is leaving: flush writes the pending change now, once", () => {
    const w = createWriter(setItem);
    w.schedule("octo.cloud.v1.c1", '{"db":"edit 100 ms ago"}');
    w.flush();
    expect(written).toEqual([["octo.cloud.v1.c1", '{"db":"edit 100 ms ago"}']]);
    vi.advanceTimersByTime(300);
    expect(written).toHaveLength(1);
    w.flush(); // nothing waits: nothing more
    expect(written).toHaveLength(1);
  });
  it("after a wipe, flush writes nothing of the old person", () => {
    const w = createWriter(setItem);
    w.schedule("octo.outbox.v1", "[old]");
    forgetDeviceState(() => true);
    w.flush();
    expect(written).toEqual([]);
  });
  it("immediate (0 ms): written in the same turn, no timer — a crash right after a change keeps it", () => {
    const w = createWriter(setItem, 0);
    w.schedule("octo.outbox.v1", "[op]");
    expect(written).toEqual([["octo.outbox.v1", "[op]"]]);
    w.schedule("octo.outbox.v1", "[op,op2]");
    expect(written).toEqual([["octo.outbox.v1", "[op]"], ["octo.outbox.v1", "[op,op2]"]]);
  });
  it("flushAllWriters: every mounted state's pending write", () => {
    const a = createWriter(setItem);
    const b = createWriter(setItem);
    const reg = liveWriters() as Set<typeof a>;
    reg.add(a);
    reg.add(b);
    a.schedule("octo.theme.v1", '"dark"');
    b.schedule("octo.db.v5", '{"demo":1}');
    flushAllWriters();
    expect(written.map((x) => x[0]).sort()).toEqual(["octo.db.v5", "octo.theme.v1"]);
    reg.delete(a);
    reg.delete(b);
  });
});

