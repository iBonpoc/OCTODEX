/**
 * Store debt (docs/specs/19 §6.12, BOARD «Записи руководителя №3»): the persistent state after sign-out and after
 * the account is deleted. Each case failed before the fix.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
import { MAX_CORRUPT_COPY, applyUpdate, corruptKey, createWriter, deviceGeneration, flushAllWriters, forgetDeviceState, liveWriters, loadStored, onDeviceForgotten, recoverHeld, storageProblems } from "../src/data/persist";
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


describe("unit:persist — what the phone could not keep (#756, audit A-01/A-02)", () => {
  it("a failed write is not swallowed: reported, tried again with the same value, cleared once written", async () => {
    let full = true;
    const tries: string[] = [];
    const w = createWriter(async (k, v) => {
      tries.push(v);
      if (full) throw new Error("QuotaExceededError");
      written.push([k, v]);
    }, 0);
    w.schedule("octo.outbox.v1", "[op]");
    await vi.advanceTimersByTimeAsync(0);
    expect(storageProblems().get("octo.outbox.v1")).toBe("write");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(tries).toEqual(["[op]", "[op]"]); // tried again, not dropped
    full = false;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(written).toEqual([["octo.outbox.v1", "[op]"]]);
    expect(storageProblems().has("octo.outbox.v1")).toBe(false);
  });
  it("a newer change waiting replaces the failed one: the old value is not tried again over it", async () => {
    let full = true;
    const w = createWriter(async (k, v) => {
      if (full) throw new Error("full");
      written.push([k, v]);
    }, 250);
    w.schedule("k", "1");
    await vi.advanceTimersByTimeAsync(250);
    w.schedule("k", "2");
    full = false;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(written).toEqual([["k", "2"]]);
  });
  it("a write that throws at once (web localStorage) is caught the same way", async () => {
    const w = createWriter(() => {
      throw new Error("QuotaExceededError");
    }, 0);
    expect(() => w.schedule("octo.queue.v1", "[]")).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(storageProblems().get("octo.queue.v1")).toBe("write");
    w.forget();
  });
  it("loadStored: a failed read is not «empty» — it says not read", async () => {
    const kv = { getItem: async () => Promise.reject(new Error("CursorWindow")), setItem: setItem };
    expect(await loadStored(kv, "octo.outbox.v1")).toEqual({ ok: false });
  });
  it("loadStored: broken JSON is copied aside first; a copy that fails is «not read»", async () => {
    const kv = { getItem: async () => "{broken", setItem };
    expect(await loadStored(kv, "octo.outbox.v1")).toEqual({ ok: true, value: undefined });
    expect(written).toEqual([[corruptKey("octo.outbox.v1"), "{broken"]]);
    const full = { getItem: async () => "{broken", setItem: async () => Promise.reject(new Error("full")) };
    expect(await loadStored(full, "octo.outbox.v1")).toEqual({ ok: false });
  });
  it("loadStored: missing → undefined, valid → the value, invalid (another day's demo) → undefined", async () => {
    const kv = (raw: string | null) => ({ getItem: async () => raw, setItem });
    expect(await loadStored(kv(null), "k")).toEqual({ ok: true, value: undefined });
    expect(await loadStored(kv("[1]"), "k")).toEqual({ ok: true, value: [1] });
    expect(await loadStored<number[]>(kv("[1]"), "k", (v) => v.length > 1)).toEqual({ ok: true, value: undefined });
  });
  it("recoverHeld: untouched → stored; lists → stored + new by id; anything else → the latest in memory", () => {
    expect(recoverHeld([{ id: "a" }], [], false)).toEqual([{ id: "a" }]);
    expect(recoverHeld([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }], true)).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(recoverHeld<string>("dark", "light", true)).toBe("light");
    expect(recoverHeld<string>(undefined, "light", true)).toBe("light");
  });
  it("a held state is never written; a change while held marks it", () => {
    const s = applyUpdate({ key: "k", value: [1], loaded: true, held: true }, [1, 2]);
    expect(s).toEqual({ key: "k", value: [1, 2], loaded: true, held: true, dirty: true });
  });
  it("the raw copies are wiped with the account (they may hold the outbox)", () => {
    expect(isDeviceKey(corruptKey("octo.outbox.v1"))).toBe(true);
  });
});

describe("unit:persist — review of #763: the writer never writes an older value back (№1, №4, №5)", () => {
  /** a storage whose writes the test settles by hand */
  const manual = () => {
    const calls: { k: string; v: string; ok: () => void; no: () => void }[] = [];
    const set = (k: string, v: string) => new Promise<void>((ok, no) => calls.push({ k, v, ok, no: () => no(new Error("full")) }));
    return { calls, set };
  };
  it("№1: the outbox [A,B] fails after [] landed — [A,B] is never retried (A would go to the server twice)", async () => {
    const m = manual();
    const w = createWriter(m.set, 0);
    w.schedule("octo.outbox.v1", "[A,B]");
    w.schedule("octo.outbox.v1", "[]"); // A confirmed, the outbox is empty — both writes in flight
    m.calls[1]!.ok();
    await vi.advanceTimersByTimeAsync(0);
    m.calls[0]!.no();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(m.calls.map((c) => c.v)).toEqual(["[A,B]", "[]"]); // before the fix: a third call «[A,B]» a second later
    expect(storageProblems().has("octo.outbox.v1")).toBe(false);
  });
  it("№1: the older fails first, the newer then lands — still no retry of the older", async () => {
    const m = manual();
    const w = createWriter(m.set, 0);
    w.schedule("k1", "v1");
    w.schedule("k1", "v2");
    m.calls[0]!.no();
    await vi.advanceTimersByTimeAsync(0);
    m.calls[1]!.ok();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(m.calls.map((c) => c.v)).toEqual(["v1", "v2"]);
  });
  it("№1: both fail — only the newer is tried again (before: the older took its place and v2 was lost)", async () => {
    const m = manual();
    const w = createWriter(m.set, 0);
    w.schedule("k2", "v1");
    w.schedule("k2", "v2");
    m.calls[0]!.no();
    m.calls[1]!.no();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(m.calls.map((c) => c.v)).toEqual(["v1", "v2", "v2"]);
    m.calls[2]!.ok();
    await vi.advanceTimersByTimeAsync(0);
    expect(storageProblems().has("k2")).toBe(false);
  });
  it("№4: the key changes while the old key's write waits to be retried — the old one is still written, its mark goes", async () => {
    const m = manual();
    const w = createWriter(m.set, 0);
    w.schedule("octo.cloud.v1.c1", "A");
    m.calls[0]!.no();
    await vi.advanceTimersByTimeAsync(0);
    expect(storageProblems().get("octo.cloud.v1.c1")).toBe("write");
    w.keyChanged("octo.db.v5");
    w.schedule("octo.db.v5", "B");
    m.calls[1]!.ok();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(m.calls.map((c) => [c.k, c.v])).toEqual([["octo.cloud.v1.c1", "A"], ["octo.db.v5", "B"], ["octo.cloud.v1.c1", "A"]]);
    m.calls[2]!.ok();
    await vi.advanceTimersByTimeAsync(0);
    expect(storageProblems().has("octo.cloud.v1.c1")).toBe(false); // before: the retry was dropped, the badge stayed for ever
  });
  it("№5: a wipe drops the retry and its mark; a write in flight that fails after the wipe leaves no mark", async () => {
    const m = manual();
    const w = createWriter(m.set, 0);
    w.schedule("octo.queue.v1", "q");
    m.calls[0]!.no();
    await vi.advanceTimersByTimeAsync(0);
    expect(storageProblems().get("octo.queue.v1")).toBe("write");
    w.forget();
    expect(storageProblems().has("octo.queue.v1")).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(m.calls).toHaveLength(1);
    w.schedule("octo.queue.v1", "q2");
    forgetDeviceState(() => false); // the generation moves while the write is in flight
    m.calls[1]!.no();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(storageProblems().has("octo.queue.v1")).toBe(false);
    expect(m.calls).toHaveLength(2);
  });
});

describe("unit:persist — review of #763: held changes and broken values (№6, №8)", () => {
  it("№6: the same value set again while held is not a change (the role checked on start never wins over the stored)", () => {
    const s = applyUpdate({ key: "octo.role.v1", value: "director", loaded: true, held: true }, "director");
    expect(s.dirty).toBe(false);
    expect(applyUpdate({ key: "k", value: [1], loaded: true, held: true }, [1]).dirty).toBe(false);
    expect(applyUpdate(s, "tech").dirty).toBe(true);
    expect(applyUpdate({ ...s, dirty: true }, "director").dirty).toBe(true); // once changed, stays changed
  });
  it("№8: a cache's broken value is not copied aside; a too big one is held, not written over", async () => {
    const kv = { getItem: async () => "{broken", setItem };
    expect(await loadStored(kv, "octo.cloud.v1.c1", undefined, false)).toEqual({ ok: true, value: undefined });
    expect(written).toEqual([]);
    const big = { getItem: async () => "{" + "x".repeat(MAX_CORRUPT_COPY), setItem };
    expect(await loadStored(big, "octo.outbox.v1")).toEqual({ ok: false });
    expect(written).toEqual([]);
  });
});

describe("unit:persist — Writer.cancel (fourth review of #763 №2)", () => {
  const manual = () => {
    const calls: { k: string; v: string; ok: () => void; no: () => void }[] = [];
    const set = (k: string, v: string) => new Promise<void>((ok, no) => calls.push({ k, v, ok, no: () => no(new Error("full")) }));
    return { calls, set };
  };
  it("cancelled while a write is in flight, then it fails: no retry and no mark", async () => {
    const m = manual();
    const w = createWriter(m.set, 0);
    w.schedule("octo.held.v1.k", "[n]");
    w.cancel("octo.held.v1.k");
    m.calls[0]!.no();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(m.calls).toHaveLength(1);
    expect(storageProblems().has("octo.held.v1.k")).toBe(false);
  });
  it("cancelled while a write is in flight, then it lands: onWritten is not called (the copy is not taken as current)", async () => {
    const m = manual();
    const heard: string[] = [];
    const w = createWriter(m.set, 0, deviceGeneration, (k) => heard.push(k));
    w.schedule("k", "v");
    w.cancel("k");
    m.calls[0]!.ok();
    await vi.advanceTimersByTimeAsync(0);
    expect(heard).toEqual([]);
  });
  it("a waiting write and a waiting retry are dropped; a later schedule of the key is written as usual", async () => {
    const m = manual();
    const w = createWriter(m.set, 250);
    w.schedule("k", "1");
    w.cancel("k");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(m.calls).toHaveLength(0);
    w.schedule("k", "2");
    await vi.advanceTimersByTimeAsync(250);
    m.calls[0]!.no();
    await vi.advanceTimersByTimeAsync(0);
    expect(storageProblems().get("k")).toBe("write");
    w.cancel("k"); // the retry waits: dropped, and its mark
    expect(storageProblems().has("k")).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(m.calls).toHaveLength(1);
  });
});
