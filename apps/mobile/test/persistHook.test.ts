/**
 * usePersistentState itself, with its effects (review #231 №2: the writer's unit tests did not catch a hook without
 * keyChanged / forget). React's hooks are run by test/support/miniReact.ts; AsyncStorage is a map with reads the test
 * answers by hand.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", () => import("./support/miniReact"));
const storage = new Map<string, string>();
const reads: { key: string; answer: (raw: string | null) => void; fail: (e: Error) => void }[] = [];
/** keys whose writes the device refuses (A-02: full storage) */
const refused = new Set<string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (key: string) => new Promise<string | null>((answer, fail) => reads.push({ key, answer, fail })),
    setItem: async (k: string, v: string) => {
      if (refused.has(k)) throw new Error("QuotaExceededError");
      storage.set(k, v);
    },
  },
}));
import { render, settle } from "./support/miniReact";
import { CACHE_READ_TRIES, flushAllWriters, forgetDeviceState, usePersistentState } from "../src/data/persist";

type Out = ReturnType<typeof usePersistentState<string>>;
const Comp = ({ k }: { k: string }) => usePersistentState<string>(k, "init");
const answerAll = () => {
  while (reads.length) {
    const r = reads.shift()!;
    r.answer(storage.get(r.key) ?? null);
  }
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  storage.clear();
  reads.length = 0;
  refused.clear();
});

describe("unit:persistHook — the key changes while a write waits", () => {
  it("the last change of the old key is written at once, never lost; the new key is read", async () => {
    storage.set("octo.cloud.v1.c1", JSON.stringify("server copy"));
    const root = render(Comp, { k: "octo.cloud.v1.c1" });
    answerAll();
    await settle();
    expect((root.out as Out)[0]).toBe("server copy");
    (root.out as Out)[1]("my last edit");
    await settle();
    root.rerender({ k: "octo.db.v5" }); // memberships went empty without the network: the store fell back to the demo
    await settle();
    expect(storage.get("octo.cloud.v1.c1")).toBe(JSON.stringify("my last edit")); // at once, not 250 ms later
    expect(reads.map((r) => r.key)).toEqual(["octo.db.v5"]);
    answerAll();
    await settle();
    expect((root.out as Out)[0]).toBe("init");
    expect((root.out as Out)[2]).toBe(true);
    root.unmount();
  });
});

describe("unit:persistHook — the device is wiped (account deletion)", () => {
  it("the waiting write is dropped, the value goes back to the initial one and is not written; a real change is", async () => {
    const root = render(Comp, { k: "octo.outbox.v1" });
    answerAll();
    await settle();
    (root.out as Out)[1]("op of the deleted person");
    await settle();
    forgetDeviceState((k) => k === "octo.outbox.v1");
    await settle();
    expect((root.out as Out)[0]).toBe("init");
    await wait(300);
    expect(storage.has("octo.outbox.v1")).toBe(false); // neither the old op nor the reset
    (root.out as Out)[1]("new op");
    await settle();
    await wait(300);
    expect(storage.get("octo.outbox.v1")).toBe(JSON.stringify("new op"));
    root.unmount();
  });
  it("a read still running when the device is wiped does not bring the wiped value back", async () => {
    storage.set("octo.role.v1", JSON.stringify("tech"));
    const root = render(Comp, { k: "octo.role.v1" });
    expect(reads).toHaveLength(1);
    forgetDeviceState((k) => k === "octo.role.v1");
    await settle();
    answerAll(); // the late answer: the stored value from before the wipe
    await settle();
    expect((root.out as Out)[0]).toBe("init");
    expect((root.out as Out)[2]).toBe(true);
    root.unmount();
  });
  it("a state whose key is not wiped is left alone", async () => {
    storage.set("octo.theme.v1", JSON.stringify("dark"));
    const root = render(Comp, { k: "octo.theme.v1" });
    answerAll();
    await settle();
    forgetDeviceState((k) => k.startsWith("octo.cloud.v1."));
    await settle();
    expect((root.out as Out)[0]).toBe("dark");
    root.unmount();
  });
});

describe("unit:persistHook — a change in the last 250 ms is not lost (rule 6, review #263)", () => {
  const Now = ({ k }: { k: string }) => usePersistentState<string>(k, "init", { immediate: true });
  it("immediate: written in the same turn as the change (the outbox)", async () => {
    const root = render(Now, { k: "octo.outbox.v1" });
    answerAll();
    await settle();
    (root.out as Out)[1]("op");
    await settle();
    expect(storage.get("octo.outbox.v1")).toBe(JSON.stringify("op")); // not 250 ms later
    root.unmount();
  });
  it("the app is leaving: a waiting change is written at once", async () => {
    const root = render(Comp, { k: "octo.db.v5" });
    answerAll();
    await settle();
    (root.out as Out)[1]("edit");
    await settle();
    expect(storage.get("octo.db.v5")).toBeUndefined(); // still waiting its 250 ms
    flushAllWriters();
    await settle();
    expect(storage.get("octo.db.v5")).toBe(JSON.stringify("edit"));
    root.unmount();
  });
  it("unmounted with a waiting change: written then, not lost", async () => {
    const root = render(Comp, { k: "octo.theme.v1" });
    answerAll();
    await settle();
    (root.out as Out)[1]("dark");
    await settle();
    root.unmount();
    await settle();
    expect(storage.get("octo.theme.v1")).toBe(JSON.stringify("dark"));
  });
});


/* ---------- A-01 / A-02 (#756): the device storage fails ---------- */
type Ops = { id: string }[];
type OutOps = ReturnType<typeof usePersistentState<Ops>>;
const Outbox = ({ k }: { k: string }) => usePersistentState<Ops>(k, [], { immediate: true, strict: true });
const Cache = ({ k }: { k: string }) => usePersistentState<Ops>(k, []);
const TWO = JSON.stringify([{ id: "op1" }, { id: "op2" }]);
/** every read the hook makes fails, through all its tries (with their pauses) */
const failReads = async (tries = 3) => {
  for (let i = 0; i < tries; i++) {
    for (let n = 0; n < 50 && !reads.length; n++) await wait(50);
    while (reads.length) reads.shift()!.fail(new Error("SQLITE_BUSY"));
    await settle();
  }
};

describe("unit:persistHook — a read fails (A-01)", () => {
  it("the outbox with 2 ops stays on the device: not loaded, nothing written, «Повторить» reads again", async () => {
    storage.set("octo.outbox.v1", TWO);
    const root = render(Outbox, { k: "octo.outbox.v1" });
    await failReads();
    await wait(50);
    await settle();
    const out = root.out as OutOps;
    expect(storage.get("octo.outbox.v1")).toBe(TWO); // before: [] written over the two ops
    expect(out[2]).toBe(false);
    expect(out[3].readError).toBe("read");
    out[3].retry();
    await settle();
    answerAll();
    await settle();
    const after = root.out as OutOps;
    expect(after[0]).toEqual([{ id: "op1" }, { id: "op2" }]);
    expect(after[2]).toBe(true);
    expect(after[3].readError).toBeNull();
    expect(storage.get("octo.outbox.v1")).toBe(TWO);
    root.unmount();
  }, 10_000);

  it("one failed try is tried again: the value comes on the second try", async () => {
    storage.set("octo.outbox.v1", TWO);
    const root = render(Outbox, { k: "octo.outbox.v1" });
    reads.shift()!.fail(new Error("SQLITE_BUSY"));
    for (let n = 0; n < 50 && !reads.length; n++) await wait(50);
    answerAll();
    await settle();
    expect((root.out as OutOps)[0]).toEqual([{ id: "op1" }, { id: "op2" }]);
    expect((root.out as OutOps)[3].readError).toBeNull();
    root.unmount();
  });
});

describe("unit:persistHook — a broken record (A-01)", () => {
  it("the outbox key that is not JSON is never overwritten, even after a change; the error is shown", async () => {
    storage.set("octo.outbox.v1", "[{\"id\":\"op1\"},");
    const root = render(Outbox, { k: "octo.outbox.v1" });
    answerAll();
    await settle();
    expect((root.out as OutOps)[3].readError).toBe("corrupt");
    expect((root.out as OutOps)[2]).toBe(false);
    (root.out as OutOps)[1]([{ id: "new" }]);
    await settle();
    expect(storage.get("octo.outbox.v1")).toBe("[{\"id\":\"op1\"},");
    root.unmount();
  });

  it("the cache that is not JSON starts fresh, as before", async () => {
    storage.set("octo.cloud.v1.c1", "{broken");
    const root = render(Cache, { k: "octo.cloud.v1.c1" });
    answerAll();
    await settle();
    expect((root.out as OutOps)[0]).toEqual([]);
    expect((root.out as OutOps)[2]).toBe(true);
    expect((root.out as OutOps)[3].readError).toBeNull();
    root.unmount();
  });
});

describe("unit:persistHook — a write is refused (A-02)", () => {
  it("«не сохранено на устройстве» while the device refuses; the next write that lands clears it", async () => {
    const root = render(Outbox, { k: "octo.outbox.v1" });
    answerAll();
    await settle();
    refused.add("octo.outbox.v1");
    (root.out as OutOps)[1]([{ id: "op1" }]);
    await settle();
    expect((root.out as OutOps)[3].writeFailed).toBe(true); // before: swallowed
    refused.clear();
    (root.out as OutOps)[1]([{ id: "op1" }, { id: "op2" }]);
    await settle();
    expect((root.out as OutOps)[3].writeFailed).toBe(false);
    expect(storage.get("octo.outbox.v1")).toBe(TWO);
    root.unmount();
  });

  it("the big cache refused does not stop the outbox: its own key, its own write", async () => {
    const cache = render(Cache, { k: "octo.cloud.v1.c1" });
    const outbox = render(Outbox, { k: "octo.outbox.v1" });
    answerAll();
    await settle();
    refused.add("octo.cloud.v1.c1");
    (cache.out as OutOps)[1]([{ id: "big" }]);
    (outbox.out as OutOps)[1]([{ id: "op1" }]);
    await wait(300);
    await settle();
    expect((cache.out as OutOps)[3].writeFailed).toBe(true);
    expect((outbox.out as OutOps)[3].writeFailed).toBe(false);
    expect(storage.get("octo.outbox.v1")).toBe(JSON.stringify([{ id: "op1" }]));
    expect(storage.has("octo.cloud.v1.c1")).toBe(false);
    cache.unmount();
    outbox.unmount();
  });
});

describe("unit:persistHook — a read error, then «Повторить» or a wipe (A-01, review of #756)", () => {
  it("«Повторить» keeps the error on screen while it reads again (no blank screen)", async () => {
    storage.set("octo.outbox.v1", TWO);
    const root = render(Outbox, { k: "octo.outbox.v1" });
    await failReads();
    await wait(50);
    await settle();
    (root.out as OutOps)[3].retry();
    await settle();
    expect((root.out as OutOps)[3].readError).toBe("read");
    expect((root.out as OutOps)[2]).toBe(false);
    answerAll();
    await settle();
    expect((root.out as OutOps)[3].readError).toBeNull();
    root.unmount();
  }, 10_000);

  it("a wipe while the outbox could not be read: still not loaded, nothing written over the device", async () => {
    storage.set("octo.outbox.v1", TWO);
    const root = render(Outbox, { k: "octo.outbox.v1" });
    await failReads();
    await wait(50);
    await settle();
    forgetDeviceState((k) => k === "octo.outbox.v1");
    await settle();
    expect((root.out as OutOps)[2]).toBe(false);
    expect((root.out as OutOps)[3].readError).toBe("read");
    (root.out as OutOps)[1]((prev) => prev.filter((x) => x.id !== "op1")); // the store drops the deleted person's ops
    await settle();
    expect(storage.get("octo.outbox.v1")).toBe(TWO);
    root.unmount();
  }, 10_000);

  it("the key changes during the pause between tries: the old read is dropped, the new key is read", async () => {
    const root = render(Outbox, { k: "octo.outbox.v1" });
    reads.shift()!.fail(new Error("SQLITE_BUSY"));
    await settle();
    root.rerender({ k: "octo.queue.v1" });
    await settle();
    storage.set("octo.queue.v1", TWO);
    answerAll();
    await settle();
    await wait(400); // the old key's pause ends: its next read never lands in the new key's state
    while (reads.length) reads.shift()!.fail(new Error("late"));
    await settle();
    expect((root.out as OutOps)[0]).toEqual([{ id: "op1" }, { id: "op2" }]);
    expect((root.out as OutOps)[3].readError).toBeNull();
    root.unmount();
  });
});

describe("unit:persistHook — a broken outbox: keep its copy and go on (review of #910 №1)", () => {
  const RAW = '[{"id":"op1"},';
  it("«Сохранить копию и продолжить»: the raw record is copied first, then the outbox starts empty and is written", async () => {
    storage.set("octo.outbox.v1", RAW);
    const root = render(Outbox, { k: "octo.outbox.v1" });
    answerAll();
    await settle();
    expect((root.out as OutOps)[3].salvage).not.toBeNull();
    (root.out as OutOps)[3].salvage!();
    await settle();
    const copies = [...storage.entries()].filter(([k]) => k.startsWith("octo.broken.octo.outbox.v1."));
    expect(copies.map(([, v]) => v)).toEqual([RAW]);
    expect((root.out as OutOps)[2]).toBe(true);
    expect((root.out as OutOps)[3].readError).toBeNull();
    expect(storage.get("octo.outbox.v1")).toBe("[]");
    root.unmount();
  });
  it("the copy is refused by the device: the broken record is not overwritten, the error stays", async () => {
    storage.set("octo.outbox.v1", RAW);
    const root = render(Outbox, { k: "octo.outbox.v1" });
    answerAll();
    await settle();
    const realHas = refused.has.bind(refused);
    refused.has = (k: string) => k.startsWith("octo.broken.") || realHas(k);
    (root.out as OutOps)[3].salvage!();
    await settle();
    refused.has = realHas;
    expect(storage.get("octo.outbox.v1")).toBe(RAW);
    expect((root.out as OutOps)[3].readError).toBe("corrupt");
    expect((root.out as OutOps)[3].writeFailed).toBe(true);
    root.unmount();
  });
  it("a failed read has no «copy and go on» (only «Повторить»)", async () => {
    const root = render(Outbox, { k: "octo.outbox.v1" });
    await failReads();
    await wait(50);
    await settle();
    expect((root.out as OutOps)[3].readError).toBe("read");
    expect((root.out as OutOps)[3].salvage).toBeNull();
    root.unmount();
  }, 10_000);
});

describe("unit:persistHook — a cache the device cannot read (review of #910, round 2 №2; #926)", () => {
  const K = "octo.cloud.v1.c1";
  /** the next read the hook makes (one of its tries) */
  const nextRead = async () => {
    for (let n = 0; n < 100 && !reads.length; n++) await wait(50);
    return reads.shift()!;
  };
  const started = async () => {
    await failReads(CACHE_READ_TRIES);
    await wait(50);
    await settle();
  };

  it("after every try fails, a cache starts fresh and is loaded — it never locks the app", async () => {
    storage.set(K, TWO);
    const root = render(Cache, { k: K });
    await started();
    expect((root.out as OutOps)[2]).toBe(true);
    expect((root.out as OutOps)[3].readError).toBeNull();
    expect((root.out as OutOps)[0]).toEqual([]);
    root.unmount();
  }, 15_000);

  it("#926: while it is tried the cache is not loaded (nothing can be changed on an empty base); a later try gives the copy", async () => {
    storage.set(K, TWO);
    const root = render(Cache, { k: K });
    await failReads(3); // what a strict key gives up after
    await wait(50);
    await settle();
    expect((root.out as OutOps)[2]).toBe(false); // before: loaded empty — the store showed an empty company
    (await nextRead()).answer(TWO);
    await settle();
    expect((root.out as OutOps)[2]).toBe(true);
    expect((root.out as OutOps)[0]).toEqual([{ id: "op1" }, { id: "op2" }]);
    root.unmount();
  }, 15_000);

  it("#926: the empty start is never written over the copy; the next real change (the server's data) is", async () => {
    storage.set(K, TWO);
    const root = render(Cache, { k: K });
    await started();
    await wait(300); // the 250-ms writer has had its time
    expect(storage.get(K)).toBe(TWO); // before: «[]» — the company's data gone until the network
    (root.out as OutOps)[1]([{ id: "server" }]);
    await settle();
    await wait(300);
    expect(JSON.parse(storage.get(K)!)).toEqual([{ id: "server" }]);
    root.unmount();
  }, 15_000);

  it("#926: the app leaves right after the empty start: nothing waits to be written", async () => {
    storage.set(K, TWO);
    const root = render(Cache, { k: K });
    await started();
    root.unmount();
    flushAllWriters();
    await wait(50);
    expect(storage.get(K)).toBe(TWO);
  }, 15_000);

  it("#926: the device is wiped while it is tried — the old copy a late try gives lands neither in the state nor on the disk", async () => {
    storage.set(K, TWO);
    const root = render(Cache, { k: K });
    await failReads(2);
    const r = await nextRead();
    storage.delete(K); // the account deletion wipes the device
    forgetDeviceState((k) => k === K);
    await settle();
    r.answer(TWO); // the try started before the wipe answers with the old copy
    await settle();
    await wait(300);
    expect((root.out as OutOps)[0]).toEqual([]);
    expect(storage.has(K)).toBe(false);
    root.unmount();
    expect(storage.has(K)).toBe(false);
  }, 15_000);

  it("#926: the key changes while it is tried — the old key's copy lands neither in the new state nor on its key", async () => {
    storage.set(K, TWO);
    const root = render(Cache, { k: K });
    await failReads(2);
    const r = await nextRead();
    root.rerender({ k: "octo.cloud.v1.c2" }); // another company
    await settle();
    answerAll(); // the new key: nothing stored
    await settle();
    r.answer(TWO); // the old key's try answers late, after the new key is read
    await settle();
    await wait(300);
    expect((root.out as OutOps)[0]).toEqual([]);
    expect(storage.get("octo.cloud.v1.c2") ?? "[]").toBe("[]");
    expect(storage.get(K)).toBe(TWO);
    root.unmount();
  }, 15_000);
});
