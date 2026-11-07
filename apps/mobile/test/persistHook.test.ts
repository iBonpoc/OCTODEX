/**
 * usePersistentState itself, with its effects (review #231 №2: the writer's unit tests did not catch a hook without
 * keyChanged / forget). React's hooks are run by test/support/miniReact.ts; AsyncStorage is a map with reads the test
 * answers by hand.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", () => import("./support/miniReact"));
const storage = new Map<string, string>();
const reads: { key: string; answer: (raw: string | null) => void }[] = [];
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (key: string) => new Promise<string | null>((answer) => reads.push({ key, answer })),
    setItem: async (k: string, v: string) => void storage.set(k, v),
  },
}));
import { render, settle } from "./support/miniReact";
import { forgetDeviceState, usePersistentState } from "../src/data/persist";

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
