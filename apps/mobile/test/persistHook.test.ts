/**
 * usePersistentState itself, with its effects (review #231 №2: the writer's unit tests did not catch a hook without
 * keyChanged / forget). React's hooks are run by test/support/miniReact.ts; AsyncStorage is a map with reads the test
 * answers by hand.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", () => import("./support/miniReact"));
const storage = new Map<string, string>();
const reads: { key: string; answer: (raw: string | null) => void }[] = [];
/** #756: the next reads fail (of the values; a held copy reads — or fails with failHeld); `auto` — reads are answered
 *  at once from the map */
const io = { failReads: 0, failWrites: false, auto: false };
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (key: string) => {
      if (io.failReads > 0 && !key.startsWith("octo.held.v1.")) {
        io.failReads -= 1;
        return Promise.reject(new Error("Row too big to fit into CursorWindow"));
      }
      if (io.auto) return Promise.resolve(storage.get(key) ?? null);
      return new Promise<string | null>((answer) => reads.push({ key, answer }));
    },
    setItem: async (k: string, v: string) => {
      if (io.failWrites) throw new Error("QuotaExceededError");
      storage.set(k, v);
    },
    removeItem: async (k: string) => void storage.delete(k),
  },
}));
import { render, settle } from "./support/miniReact";
import { flushAllWriters, forgetDeviceState, persistTiming, storageProblems, usePersistentState } from "../src/data/persist";

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
  Object.assign(io, { failReads: 0, failWrites: false, auto: false });
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
    expect(reads.map((r) => r.key)).toEqual(["octo.db.v5", "octo.held.v1.octo.db.v5"]); // the value and its held copy
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
    expect(reads.map((r) => r.key)).toEqual(["octo.role.v1", "octo.held.v1.octo.role.v1"]);
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


describe("unit:persistHook — the phone could not read or write (#756, audit A-01/A-02)", () => {
  type Op = { id: string };
  type OutOps = ReturnType<typeof usePersistentState<Op[]>>;
  const Outbox = ({ k }: { k: string }) => usePersistentState<Op[]>(k, [], { immediate: true });
  const Cache = ({ k }: { k: string }) => usePersistentState<string>(k, "empty", { overwriteOnReadError: true });
  const timing = { ...persistTiming };
  beforeEach(() => {
    io.auto = true;
    Object.assign(persistTiming, { read: [60, 60, 60], held: () => 300, write: () => 5 });
  });
  afterEach(() => Object.assign(persistTiming, timing));

  it("a read that keeps failing never writes over the stored outbox; read later, the ops made meanwhile are added", async () => {
    storage.set("octo.outbox.v1", JSON.stringify([{ id: "a" }, { id: "b" }]));
    io.failReads = 5; // the first read, three retries, one held retry
    const root = render(Outbox, { k: "octo.outbox.v1" });
    await settle();
    await wait(250); // the three retries failed: held (the held retry is at ~480 ms)
    await settle();
    expect((root.out as OutOps)[2]).toBe(true); // the app works on
    expect(storageProblems().get("octo.outbox.v1")).toBe("read"); // the badge says «Не сохранено на устройстве»
    (root.out as OutOps)[1]((ops) => [...ops, { id: "c" }]); // a change made while held
    await settle();
    expect(JSON.parse(storage.get("octo.outbox.v1")!)).toEqual([{ id: "a" }, { id: "b" }]); // before the fix: [] then [c]
    await wait(650); // the held retries: the second one (~780 ms) reads
    await settle();
    expect((root.out as OutOps)[0]).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(JSON.parse(storage.get("octo.outbox.v1")!)).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(storageProblems().has("octo.outbox.v1")).toBe(false);
    root.unmount();
  });
  it("held: an op made and sent meanwhile (gone from memory) does not come back; the stored ones keep their order", async () => {
    storage.set("octo.outbox.v1", JSON.stringify([{ id: "a" }, { id: "b" }]));
    io.failReads = 5;
    const root = render(Outbox, { k: "octo.outbox.v1" });
    await settle();
    await wait(250);
    await settle();
    (root.out as OutOps)[1]((ops) => [...ops, { id: "c" }, { id: "d" }]);
    await settle();
    (root.out as OutOps)[1]((ops) => ops.filter((o) => o.id !== "c")); // «c» was sent: the store took it out
    await settle();
    await wait(650);
    await settle();
    expect((root.out as OutOps)[0]).toEqual([{ id: "a" }, { id: "b" }, { id: "d" }]); // no «c», no duplicates, a → b → d
    root.unmount();
  });
  it("one failed read is retried: the stored value comes, nothing is lost and nothing is reported", async () => {
    storage.set("octo.queue.v1", JSON.stringify([{ id: "q1" }]));
    io.failReads = 1;
    const root = render(Outbox, { k: "octo.queue.v1" });
    await settle();
    await wait(100);
    await settle();
    expect((root.out as OutOps)[0]).toEqual([{ id: "q1" }]); // before the fix: [] — and [] written over the queue
    expect(storage.get("octo.queue.v1")).toBe(JSON.stringify([{ id: "q1" }]));
    expect(storageProblems().size).toBe(0);
    root.unmount();
  });
  it("a broken value is kept aside (octo.corrupt.v1.<key>) before the state starts fresh", async () => {
    storage.set("octo.outbox.v1", '[{"id":"a"},{"id":');
    const root = render(Outbox, { k: "octo.outbox.v1" });
    await settle();
    expect(storage.get("octo.corrupt.v1.octo.outbox.v1")).toBe('[{"id":"a"},{"id":');
    expect((root.out as OutOps)[0]).toEqual([]);
    expect((root.out as OutOps)[2]).toBe(true);
    root.unmount();
  });
  it("a broken value that cannot be kept aside (full storage) is held, not written over", async () => {
    storage.set("octo.outbox.v1", "{broken");
    io.failWrites = true;
    const root = render(Outbox, { k: "octo.outbox.v1" });
    await settle();
    await wait(250);
    await settle();
    expect(storage.get("octo.outbox.v1")).toBe("{broken");
    expect(storageProblems().get("octo.outbox.v1")).toBe("read");
    root.unmount();
    expect(storageProblems().has("octo.outbox.v1")).toBe(false); // unmounted: no badge for it any more
  });
  it("a cache the server fills again (overwriteOnReadError) is written anew after the retries", async () => {
    storage.set("octo.cloud.v1.c1", JSON.stringify("too big to read"));
    io.failReads = 4;
    const root = render(Cache, { k: "octo.cloud.v1.c1" });
    await settle();
    await wait(250);
    await settle();
    expect((root.out as Out)[0]).toBe("empty");
    await wait(300);
    expect(storage.get("octo.cloud.v1.c1")).toBe(JSON.stringify("empty"));
    expect(storageProblems().has("octo.cloud.v1.c1")).toBe(false); // the good write cleared it
    root.unmount();
  });
  it("a failed write is reported and tried again; written, the report goes", async () => {
    const root = render(Outbox, { k: "octo.outbox.v1" });
    await settle();
    io.failWrites = true;
    (root.out as OutOps)[1]([{ id: "op" }]);
    await settle();
    expect(storageProblems().get("octo.outbox.v1")).toBe("write"); // before the fix: swallowed
    io.failWrites = false;
    await wait(10);
    await settle();
    expect(storage.get("octo.outbox.v1")).toBe(JSON.stringify([{ id: "op" }]));
    expect(storageProblems().has("octo.outbox.v1")).toBe(false);
    root.unmount();
  });
  it("review №2: held → a new op → the app closed → opened again (still unreadable): the op is there; read at last — merged, the held copy goes", async () => {
    storage.set("octo.outbox.v1", JSON.stringify([{ id: "a" }]));
    io.failReads = 100;
    const first = render(Outbox, { k: "octo.outbox.v1" });
    await settle();
    await wait(250);
    await settle();
    (first.out as OutOps)[1]((ops) => [...ops, { id: "paid-offline" }]);
    await settle();
    expect(JSON.parse(storage.get("octo.held.v1.octo.outbox.v1")!)).toEqual([{ id: "paid-offline" }]); // kept aside at once
    expect(JSON.parse(storage.get("octo.outbox.v1")!)).toEqual([{ id: "a" }]); // the stored value untouched
    first.unmount();
    await settle();
    const again = render(Outbox, { k: "octo.outbox.v1" });
    await settle();
    await wait(250);
    await settle();
    expect((again.out as OutOps)[0]).toEqual([{ id: "paid-offline" }]); // before the fix: [] — the payment was lost
    io.failReads = 0;
    await wait(400);
    await settle();
    expect((again.out as OutOps)[0]).toEqual([{ id: "a" }, { id: "paid-offline" }]);
    expect(JSON.parse(storage.get("octo.outbox.v1")!)).toEqual([{ id: "a" }, { id: "paid-offline" }]);
    expect(storage.has("octo.held.v1.octo.outbox.v1")).toBe(false); // gone once the merged value landed
    expect((again.out as unknown as unknown[])[3]).toBe(1); // a load the store adopts legacy ops after (№7)
    again.unmount();
  });
  it("review №2: a held copy left by the last session is merged on a normal start and removed", async () => {
    storage.set("octo.outbox.v1", JSON.stringify([{ id: "a" }]));
    storage.set("octo.held.v1.octo.outbox.v1", JSON.stringify([{ id: "b" }]));
    const root = render(Outbox, { k: "octo.outbox.v1" });
    await settle();
    expect((root.out as OutOps)[0]).toEqual([{ id: "a" }, { id: "b" }]);
    expect(storage.has("octo.held.v1.octo.outbox.v1")).toBe(false);
    root.unmount();
  });
  it("review №6: the role set again to its start value while held does not overwrite the stored role", async () => {
    const Role = ({ k }: { k: string }) => usePersistentState<string>(k, "director");
    storage.set("octo.role.v1", JSON.stringify("tech"));
    io.failReads = 5;
    const root = render(Role, { k: "octo.role.v1" });
    await settle();
    await wait(250);
    await settle();
    (root.out as Out)[1]("director"); // effectiveRole on start
    await settle();
    await wait(650);
    await settle();
    expect((root.out as Out)[0]).toBe("tech");
    expect(storage.get("octo.role.v1")).toBe(JSON.stringify("tech"));
    root.unmount();
  });
});
