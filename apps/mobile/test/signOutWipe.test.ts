/**
 * unit:signOutWipe (#1633) — a sign-out leaves no copy of the person's company on the phone; nothing unsent goes.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));

import { SIGNOUT_WIPE_KEY, signOutKeys, signOutThenWipe, wipeAfterSignOut, wipeSignOutIfPending, type WipeStore } from "../src/cloud/signOutWipe";
import { createWriter, forgetPendingWrites, liveWriters } from "../src/data/persist";

const me = "u1";
const cache = (who: string) => JSON.stringify({ day: "cloud", db: { me: who } });

function mem(init: Record<string, string>) {
  const m = new Map(Object.entries(init));
  const s: WipeStore = {
    getAllKeys: async () => [...m.keys()],
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => void m.set(k, v),
    removeItem: async (k) => void m.delete(k),
    multiRemove: async (ks) => ks.forEach((k) => m.delete(k)),
  };
  return { m, s };
}

describe("unit:signOutWipe — which keys a sign-out removes (#1633)", () => {
  it("my caches (every company) and their kept copies go; the outbox, refused changes, drafts, other people's and other keys stay", () => {
    const keys = [
      "octo.cloud.v1.c1.u1",
      "octo.cloud.v1.c2.u1",
      "octo.cloud.v1.c1.u2",
      "octo.cloud.v1.c1",
      "octo.cloud.v1.rejected",
      "octo.outbox.v1",
      "octo.drafts.v1.c1.u1",
      "octo.broken.octo.cloud.v1.c1.u1.1700000000000",
      "octo.broken.octo.cloud.v1.c1.u2.1700000000000",
      "octo.broken.octo.outbox.v1.1700000000000",
      "octo.db.v5",
    ];
    const { mine, legacy } = signOutKeys(keys, me);
    expect(mine.sort()).toEqual(["octo.broken.octo.cloud.v1.c1.u1.1700000000000", "octo.cloud.v1.c1.u1", "octo.cloud.v1.c2.u1"]);
    expect(legacy).toEqual(["octo.cloud.v1.c1"]);
  });
});

describe("unit:signOutWipe — the wipe (#1633)", () => {
  it("removes my caches and my older person-less one; the outbox and the refused changes stay byte for byte", async () => {
    const outbox = JSON.stringify([{ id: "op1", owner: { userId: me, companyId: "c1" } }]);
    const rejected = JSON.stringify([{ id: "op2", owner: { userId: me, companyId: "c1" } }]);
    const { m, s } = mem({
      "octo.cloud.v1.c1.u1": cache(me),
      "octo.cloud.v1.c9": cache(me),
      "octo.cloud.v1.c8": cache("u2"),
      "octo.cloud.v1.c1.u2": cache("u2"),
      "octo.outbox.v1": outbox,
      "octo.cloud.v1.rejected": rejected,
      "octo.drafts.v1.c1.u1": "{}",
    });
    await wipeAfterSignOut(me, s, 0);
    expect([...m.keys()].sort()).toEqual(["octo.cloud.v1.c1.u2", "octo.cloud.v1.c8", "octo.cloud.v1.rejected", "octo.drafts.v1.c1.u1", "octo.outbox.v1"]);
    expect(m.get("octo.outbox.v1")).toBe(outbox);
    expect(m.get("octo.cloud.v1.rejected")).toBe(rejected);
    expect(m.has(SIGNOUT_WIPE_KEY)).toBe(false);
  });

  it("a write of the cache already under way when the session went is removed by the second pass", async () => {
    const { m, s } = mem({ "octo.cloud.v1.c1.u1": cache(me) });
    const p = wipeAfterSignOut(me, s, 20);
    await new Promise((r) => setTimeout(r, 5));
    m.set("octo.cloud.v1.c1.u1", cache(me)); // the store's late write of the old key (persist keyChanged)
    await p;
    expect(m.has("octo.cloud.v1.c1.u1")).toBe(false);
  });

  it("a pending (not yet written) write of my cache is dropped, another key's is written", async () => {
    const put = vi.fn(async () => {});
    const w1 = createWriter(put, 50, () => 0);
    const w2 = createWriter(put, 50, () => 0);
    (liveWriters() as Set<typeof w1>).add(w1);
    (liveWriters() as Set<typeof w2>).add(w2);
    try {
      w1.schedule("octo.cloud.v1.c1.u1", "x");
      w2.schedule("octo.outbox.v1", "y");
      forgetPendingWrites((k) => k === "octo.cloud.v1.c1.u1");
      w1.flush();
      w2.flush();
      expect(put).toHaveBeenCalledTimes(1);
      expect(put).toHaveBeenCalledWith("octo.outbox.v1", "y");
    } finally {
      (liveWriters() as Set<typeof w1>).delete(w1);
      (liveWriters() as Set<typeof w2>).delete(w2);
    }
  });

  it("a wipe that failed is repeated on the next start — never for the person signed in again", async () => {
    const { m, s } = mem({ "octo.cloud.v1.c1.u1": cache(me), [SIGNOUT_WIPE_KEY]: me });
    await wipeSignOutIfPending(me, s);
    expect(m.has("octo.cloud.v1.c1.u1")).toBe(true);
    expect(m.has(SIGNOUT_WIPE_KEY)).toBe(false);
    m.set(SIGNOUT_WIPE_KEY, me);
    await wipeSignOutIfPending(null, s);
    expect(m.has("octo.cloud.v1.c1.u1")).toBe(false);
    expect(m.has(SIGNOUT_WIPE_KEY)).toBe(false);
  });

  it("a device that refuses never throws: the mark stays for the next start", async () => {
    const { m, s } = mem({ "octo.cloud.v1.c1.u1": cache(me) });
    s.multiRemove = async () => {
      throw new Error("SQLITE_BUSY");
    };
    await expect(wipeAfterSignOut(me, s, 0)).resolves.toBeUndefined();
    expect(m.get(SIGNOUT_WIPE_KEY)).toBe(me);
  });
});

describe("unit:signOutWipe — the sign-out itself (#1633)", () => {
  const authOf = (opts: { globalFails?: boolean; localKeeps?: boolean }) => {
    let session: { user: { id: string } } | null = { user: { id: me } };
    const calls: string[] = [];
    return {
      calls,
      auth: {
        getSession: async () => ({ data: { session } }),
        signOut: async (o?: { scope: "local" }) => {
          calls.push(o?.scope ?? "global");
          if (!o && opts.globalFails) return { error: new Error("Failed to fetch") };
          if (!opts.localKeeps) session = null;
          return { error: null };
        },
      },
    };
  };
  it("online: signed out, the memberships forgotten, then my caches wiped", async () => {
    const { auth, calls } = authOf({});
    const wipe = vi.fn(async () => {});
    const between = vi.fn();
    await signOutThenWipe(auth, between, wipe);
    expect(calls).toEqual(["global"]);
    expect(between).toHaveBeenCalledTimes(1);
    expect(wipe).toHaveBeenCalledWith(me);
  });
  it("offline: the global sign-out fails, the phone forgets the session locally, then wipes", async () => {
    const { auth, calls } = authOf({ globalFails: true });
    const wipe = vi.fn(async () => {});
    await signOutThenWipe(auth, () => {}, wipe);
    expect(calls).toEqual(["global", "local"]);
    expect(wipe).toHaveBeenCalledWith(me);
  });
  it("the session is still on the phone: nothing is wiped (the person stays signed in with their cache)", async () => {
    const { auth } = authOf({ globalFails: true, localKeeps: true });
    const wipe = vi.fn(async () => {});
    await signOutThenWipe(auth, () => {}, wipe);
    expect(wipe).not.toHaveBeenCalled();
  });
});
