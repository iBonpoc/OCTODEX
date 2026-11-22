/**
 * unit:signOutWipe (#1633) — a sign-out leaves no copy of the person's company on the phone; nothing only the phone
 * has goes (the outbox, refused changes, drafts, a refused photo or receipt).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));

import { countUnsentDrafts, holdsLocalOnly, SIGNOUT_DRAFTS_KEY, SIGNOUT_WIPE_KEY, signOutAndMark, signOutKeys, wipeAfterSignOut, wipeLeftCompanies, wipeSignOutIfPending, forgetSignOutMark, type WipeStore } from "../src/cloud/signOutWipe";
import { createWriter, liveWriters, type Writer } from "../src/data/persist";

const me = "u1";
const cache = (who: string, extra: object = {}) => JSON.stringify({ day: "cloud", db: { me: who, visits: [], expenses: [], ...extra } });
const nobody = { signedIn: () => null, pauseMs: 0 };

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

describe("unit:signOutWipe — which keys (#1633)", () => {
  it("my caches (every company), their copies and the person-less ones to check; my drafts only when asked to; the outbox, refused changes, the demo's drafts, others' stay", () => {
    const keys = [
      "octo.cloud.v1.c1.u1",
      "octo.cloud.v1.c2.u1",
      "octo.cloud.v1.c1.u2",
      "octo.cloud.v1.c1",
      "octo.cloud.v1.rejected",
      "octo.outbox.v1",
      "octo.drafts.v1.c1.u1",
      "octo.drafts.v1.c1.u2",
      "octo.drafts.v1.demo",
      "octo.broken.octo.drafts.v1.c2.u1.1700000000000",
      "octo.broken.octo.cloud.v1.c1.u1.1700000000000",
      "octo.broken.octo.cloud.v1.c1.u2.1700000000000",
      "octo.broken.octo.cloud.v1.c1.1700000000000",
      "octo.broken.octo.outbox.v1.1700000000000",
      "octo.db.v5",
    ];
    const { mine, legacy } = signOutKeys(keys, me);
    expect(mine.sort()).toEqual(["octo.broken.octo.cloud.v1.c1.u1.1700000000000", "octo.cloud.v1.c1.u1", "octo.cloud.v1.c2.u1"]);
    // #1662: «Выйти и стереть» — my drafts and their copies too, never the demo's or another person's
    expect(signOutKeys(keys, me, undefined, true).mine.sort()).toEqual([
      "octo.broken.octo.cloud.v1.c1.u1.1700000000000",
      "octo.broken.octo.drafts.v1.c2.u1.1700000000000",
      "octo.cloud.v1.c1.u1",
      "octo.cloud.v1.c2.u1",
      "octo.drafts.v1.c1.u1",
    ]);
    expect(legacy.sort()).toEqual(["octo.broken.octo.cloud.v1.c1.1700000000000", "octo.cloud.v1.c1"]);
  });
  it("a refused photo or receipt is what only the phone has", () => {
    expect(holdsLocalOnly({ db: { visits: [{ photos: [{}] }], expenses: [{}] } })).toBe(false);
    expect(holdsLocalOnly({ db: { visits: [{ photos: [{ upload: { failed: "big" } }] }] } })).toBe(true);
    expect(holdsLocalOnly({ db: { expenses: [{ receiptFailed: "type" }] } })).toBe(true);
  });
});

describe("unit:signOutWipe — the wipe (#1633)", () => {
  it("removes my caches, my person-less one and its copy; the outbox and the refused changes stay byte for byte", async () => {
    const outbox = JSON.stringify([{ id: "op1", owner: { userId: me, companyId: "c1" } }]);
    const rejected = JSON.stringify([{ id: "op2", owner: { userId: me, companyId: "c1" } }]);
    const { m, s } = mem({
      "octo.cloud.v1.c1.u1": cache(me),
      "octo.cloud.v1.c9": cache(me),
      "octo.broken.octo.cloud.v1.c9.1700000000000": cache(me),
      "octo.cloud.v1.c8": cache("u2"),
      "octo.cloud.v1.c1.u2": cache("u2"),
      "octo.outbox.v1": outbox,
      "octo.cloud.v1.rejected": rejected,
      "octo.drafts.v1.c1.u1": "{}",
    });
    await wipeAfterSignOut(me, { ...nobody, s });
    // #1662: nobody asked (another device, an expired session): my drafts stay
    expect([...m.keys()].sort()).toEqual(["octo.cloud.v1.c1.u2", "octo.cloud.v1.c8", "octo.cloud.v1.rejected", "octo.drafts.v1.c1.u1", "octo.outbox.v1"]);
    expect(m.get("octo.outbox.v1")).toBe(outbox);
    expect(m.get("octo.cloud.v1.rejected")).toBe(rejected);
    expect(m.has(SIGNOUT_WIPE_KEY)).toBe(false);
  });

  it("a cache holding a refused photo or receipt stays («Повторить» needs its file and reason)", async () => {
    const photo = cache(me, { visits: [{ photos: [{ id: "p1", uri: "file:///p1.jpg", upload: { failed: "big", at: "x" } }] }] });
    const receipt = cache(me, { expenses: [{ id: "x1", receiptUri: "file:///r.jpg", receiptFailed: "type" }] });
    const { m, s } = mem({ "octo.cloud.v1.c1.u1": photo, "octo.cloud.v1.c2.u1": receipt, "octo.cloud.v1.c3.u1": cache(me) });
    await wipeAfterSignOut(me, { ...nobody, s });
    expect([...m.keys()].sort()).toEqual(["octo.cloud.v1.c1.u1", "octo.cloud.v1.c2.u1"]);
  });

  it("a write of the cache under way when the session went is removed by a later pass", async () => {
    const { m, s } = mem({ "octo.cloud.v1.c1.u1": cache(me) });
    const p = wipeAfterSignOut(me, { signedIn: () => null, s, pauseMs: 20 });
    await new Promise((r) => setTimeout(r, 5));
    m.set("octo.cloud.v1.c1.u1", cache(me)); // the store's late write of the old key (persist keyChanged)
    await p;
    expect(m.has("octo.cloud.v1.c1.u1")).toBe(false);
  });

  it("the wipe drops a pending (not yet written) write of my cache; another key's is written", async () => {
    const put = vi.fn(async () => {});
    const w1: Writer = createWriter(put, 50, () => 0);
    const w2: Writer = createWriter(put, 50, () => 0);
    const live = liveWriters() as Set<Writer>;
    live.add(w1);
    live.add(w2);
    try {
      const { s } = mem({ "octo.cloud.v1.c1.u1": cache(me) });
      w1.schedule("octo.cloud.v1.c1.u1", "x");
      w2.schedule("octo.outbox.v1", "y");
      await wipeAfterSignOut(me, { ...nobody, s });
      w1.flush();
      w2.flush();
      expect(put).toHaveBeenCalledTimes(1);
      expect(put).toHaveBeenCalledWith("octo.outbox.v1", "y");
    } finally {
      live.delete(w1);
      live.delete(w2);
    }
  });

  it("the same person signed in again during the wipe: it stops, their cache stays, the mark goes", async () => {
    let who: string | null = null;
    const { m, s } = mem({ "octo.cloud.v1.c1.u1": cache(me) });
    const p = wipeAfterSignOut(me, { signedIn: () => who, s, pauseMs: 20 });
    await new Promise((r) => setTimeout(r, 5));
    who = me;
    m.set("octo.cloud.v1.c1.u1", cache(me)); // read again after the sign-in
    await p;
    expect(m.has("octo.cloud.v1.c1.u1")).toBe(true);
    expect(m.has(SIGNOUT_WIPE_KEY)).toBe(false);
  });

  it("a device that refuses never throws: the mark stays for the next start", async () => {
    const { m, s } = mem({ "octo.cloud.v1.c1.u1": cache(me) });
    s.multiRemove = async () => {
      throw new Error("SQLITE_BUSY");
    };
    await expect(wipeAfterSignOut(me, { ...nobody, s })).resolves.toBeUndefined();
    expect(m.get(SIGNOUT_WIPE_KEY)).toBe(me);
  });
});

describe("unit:signOutWipe — the mark on the next start (#1633)", () => {
  it("that person signed in: nothing wiped, the mark goes", async () => {
    const { m, s } = mem({ "octo.cloud.v1.c1.u1": cache(me), [SIGNOUT_WIPE_KEY]: me });
    await wipeSignOutIfPending(me, s);
    expect(m.has("octo.cloud.v1.c1.u1")).toBe(true);
    expect(m.has(SIGNOUT_WIPE_KEY)).toBe(false);
  });
  it("nobody signed in: wiped", async () => {
    const { m, s } = mem({ "octo.cloud.v1.c1.u1": cache(me), [SIGNOUT_WIPE_KEY]: me });
    await wipeSignOutIfPending(null, s);
    expect(m.has("octo.cloud.v1.c1.u1")).toBe(false);
    expect(m.has(SIGNOUT_WIPE_KEY)).toBe(false);
  });
  it("another person signed in: the marked person's caches go, the signed-in person's stay", async () => {
    const { m, s } = mem({ "octo.cloud.v1.c1.u1": cache(me), "octo.cloud.v1.c1.u2": cache("u2"), [SIGNOUT_WIPE_KEY]: me });
    await wipeSignOutIfPending("u2", s);
    expect([...m.keys()]).toEqual(["octo.cloud.v1.c1.u2"]);
  });
  it("the same person signs in again in the same run: their mark goes, another person's stays", async () => {
    const { m, s } = mem({ [SIGNOUT_WIPE_KEY]: me });
    await forgetSignOutMark("u2", s);
    expect(m.get(SIGNOUT_WIPE_KEY)).toBe(me);
    await forgetSignOutMark(me, s);
    expect(m.has(SIGNOUT_WIPE_KEY)).toBe(false);
  });
});

describe("unit:signOutWipe — the sign-out itself (#1633)", () => {
  const authOf = (opts: { globalFails?: boolean; rejects?: boolean }) => {
    const calls: string[] = [];
    return {
      calls,
      auth: {
        getSession: async () => ({ data: { session: null } }),
        signOut: async (o?: { scope: "global" | "local" | "others" }) => {
          calls.push(o?.scope ?? "global");
          if (!o && opts.rejects) throw new Error("boom");
          if (!o && opts.globalFails) return { error: new Error("Failed to fetch") };
          return { error: null };
        },
      },
    };
  };
  it("the mark is set before the sign-out; then the memberships are forgotten", async () => {
    const { m, s } = mem({});
    const order: string[] = [];
    const { auth } = authOf({});
    const signOut = auth.signOut;
    auth.signOut = async (o) => {
      order.push(m.get(SIGNOUT_WIPE_KEY) === me ? "marked" : "not marked");
      return signOut(o);
    };
    await signOutAndMark(auth, me, () => order.push("between"), s);
    expect(order).toEqual(["marked", "between"]);
  });
  it("offline the global sign-out fails, or throws: the phone forgets the session locally", async () => {
    for (const o of [{ globalFails: true }, { rejects: true }]) {
      const { auth, calls } = authOf(o);
      const between = vi.fn();
      await signOutAndMark(auth, me, between, mem({}).s);
      expect(calls).toEqual(["global", "local"]);
      expect(between).toHaveBeenCalledTimes(1);
    }
  });
  it("nobody signed in by the app: no mark", async () => {
    const { m, s } = mem({});
    await signOutAndMark(authOf({}).auth, null, () => {}, s);
    expect(m.has(SIGNOUT_WIPE_KEY)).toBe(false);
  });
});

describe("unit:signOutWipe — the companies the person is no longer in (#1633 A2)", () => {
  const signedMe = { signedIn: () => me, pauseMs: 0 };
  const active = (...ids: string[]) => () => new Set(ids);
  it("read from the device: a company left while the app was closed goes (cache, copy, my person-less one); the active ones stay", async () => {
    const { m, s } = mem({
      "octo.cloud.v1.c1.u1": cache(me), // still in
      "octo.cloud.v1.c2.u1": cache(me), // removed
      "octo.broken.octo.cloud.v1.c2.u1.1700000000000": cache(me),
      "octo.cloud.v1.c3": cache(me), // an older person-less one of a company left
      "octo.cloud.v1.c4": cache("u2"), // someone else's person-less one: whose is not mine
      "octo.cloud.v1.c2.u2": cache("u2"), // another person in that company
      "octo.cloud.v1.c1": cache(me), // my person-less one of a company I am still in: the store adopts it
      "octo.outbox.v1": "[]",
      "octo.cloud.v1.rejected": "[]",
    });
    await wipeLeftCompanies(me, { ...signedMe, active: active("c1"), s });
    expect([...m.keys()].sort()).toEqual(["octo.cloud.v1.c1", "octo.cloud.v1.c1.u1", "octo.cloud.v1.c2.u2", "octo.cloud.v1.c4", "octo.cloud.v1.rejected", "octo.outbox.v1"]);
  });
  it("a cache holding a refused photo or receipt stays", async () => {
    const { m, s } = mem({ "octo.cloud.v1.c2.u1": cache(me, { expenses: [{ receiptFailed: "x" }] }) });
    await wipeLeftCompanies(me, { ...signedMe, active: active(), s });
    expect(m.has("octo.cloud.v1.c2.u1")).toBe(true);
  });
  it("the store's last write of the company just left (after the first pass) goes too", async () => {
    const { m, s } = mem({});
    const getAllKeys = s.getAllKeys;
    let n = 0;
    s.getAllKeys = async () => {
      if (n++ === 1) m.set("octo.cloud.v1.c2.u1", cache(me)); // landed between the passes
      return getAllKeys();
    };
    await wipeLeftCompanies(me, { ...signedMe, active: active("c1"), s });
    expect(m.has("octo.cloud.v1.c2.u1")).toBe(false);
  });
  it("back in the company meanwhile, or another person signed in: nothing of it goes", async () => {
    const { m, s } = mem({ "octo.cloud.v1.c2.u1": cache(me) });
    const now = new Set<string>();
    const getAllKeys = s.getAllKeys;
    s.getAllKeys = async () => (now.add("c2"), getAllKeys()); // the newest answer has it again
    await wipeLeftCompanies(me, { ...signedMe, active: () => now, s });
    expect(m.has("octo.cloud.v1.c2.u1")).toBe(true);
    await wipeLeftCompanies(me, { signedIn: () => "u2", pauseMs: 0, active: active(), s });
    expect(m.has("octo.cloud.v1.c2.u1")).toBe(true);
  });
  it("a device that refuses never throws", async () => {
    const { s } = mem({});
    s.getAllKeys = async () => Promise.reject(new Error("SQLITE_BUSY"));
    await expect(wipeLeftCompanies(me, { ...signedMe, active: active(), s })).resolves.toBeUndefined();
  });
});

describe("unit:signOutWipe — drafts not saved, asked about before the sign-out (#1662)", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  const draft = (at: string, title = "Roof", lines = 0) => ({ ctx: `new|${at}`, at, estimateId: "e", title, doc: { options: [{ id: "o", name: "A", lines: Array.from({ length: lines }, (_, i) => ({ id: `l${i}`, name: "x", qty: 1, unitPriceCents: 100 })) }] }, checkPrice: [] });
  it("counts my fresh drafts with a title or a line, in every company; not old ones, empty ones, the demo's or another person's", async () => {
    const { s } = mem({
      "octo.drafts.v1.c1.u1": JSON.stringify([draft("2026-11-15T10:00:00Z"), draft("2026-11-14T10:00:00Z", "", 2), draft("2026-11-15T09:00:00Z", "  "), draft("2026-09-01T10:00:00Z")]),
      "octo.drafts.v1.c2.u1": JSON.stringify([draft("2026-11-15T11:00:00Z")]),
      "octo.drafts.v1.c1.u2": JSON.stringify([draft("2026-11-15T11:00:00Z")]),
      "octo.drafts.v1.demo": JSON.stringify([draft("2026-11-15T11:00:00Z")]),
    });
    expect(await countUnsentDrafts(me, s, now)).toBe(3);
  });
  it("a list that cannot be read counts as one (asked, never wiped silently); a device that refuses never throws", async () => {
    const { s } = mem({ "octo.drafts.v1.c1.u1": "not json", "octo.drafts.v1.c2.u1": JSON.stringify({ not: "a list" }) });
    expect(await countUnsentDrafts(me, s, now)).toBe(2);
    s.getAllKeys = async () => Promise.reject(new Error("SQLITE_BUSY"));
    await expect(countUnsentDrafts(me, s, now)).resolves.toBe(0);
  });
  it("an estimate already saved is not «unsent» (findDraft leaves its draft out the same way)", async () => {
    const { s } = mem({ "octo.drafts.v1.c1.u1": JSON.stringify([{ ...draft("2026-11-15T10:00:00Z"), estimateId: "e-saved" }, { ...draft("2026-11-15T10:00:00Z"), estimateId: "e-new" }]) });
    expect(await countUnsentDrafts(me, s, now)).toBe(2);
    expect(await countUnsentDrafts(me, s, now, (id) => id === "e-saved")).toBe(1);
  });
  it("#2381 Б2/Р9: the edits of a SAVED estimate (edit|<id>) are unsent — counted always: the estimate saved, the draft old, the estimate gone", async () => {
    const edit = (id: string, at: string) => ({ ...draft(at), ctx: `edit|${id}`, estimateId: id, baseSavedAt: "2026-11-01T10:00:00Z" });
    const { s } = mem({ "octo.drafts.v1.c1.u1": JSON.stringify([edit("e-saved", "2026-09-01T10:00:00Z"), edit("e-gone", "2026-11-15T10:00:00Z")]) });
    expect(await countUnsentDrafts(me, s, now, (id) => id === "e-saved")).toBe(2);
  });
  const authOk = { getSession: async () => ({ data: { session: null } }), signOut: async () => ({ error: null }) };
  const three = () => mem({ "octo.drafts.v1.c1.u1": JSON.stringify([draft("2026-11-15T10:00:00Z")]), "octo.drafts.v1.c2.u1": "[]", "octo.drafts.v1.demo": "[]" });
  it("«Выйти и стереть»: the wipe takes my drafts of every company (the demo's stay); both marks go", async () => {
    const { m, s } = three();
    await signOutAndMark(authOk, me, () => {}, s, { wipeDrafts: true });
    expect(m.get(SIGNOUT_DRAFTS_KEY)).toBe(me);
    await wipeAfterSignOut(me, { ...nobody, s });
    expect([...m.keys()]).toEqual(["octo.drafts.v1.demo"]);
  });
  it("a plain sign-out, another device or an expired session (no choice made): my drafts stay; an old «wipe» choice is taken away", async () => {
    const { m, s } = three();
    m.set(SIGNOUT_DRAFTS_KEY, me); // left over from a sign-out that never happened
    await signOutAndMark(authOk, me, () => {}, s);
    expect(m.has(SIGNOUT_DRAFTS_KEY)).toBe(false);
    await wipeAfterSignOut(me, { ...nobody, s });
    expect([...m.keys()].sort()).toEqual(["octo.drafts.v1.c1.u1", "octo.drafts.v1.c2.u1", "octo.drafts.v1.demo"]);
    // the «signed out» event with no sign-out of ours at all (another device): no mark — the same
    const other = three();
    await wipeAfterSignOut(me, { ...nobody, s: other.s });
    expect(other.m.has("octo.drafts.v1.c1.u1")).toBe(true);
  });
  it("killed after «Выйти и стереть»: the next start wipes the drafts too; the same person back in — nothing, both marks go", async () => {
    const a = three();
    a.m.set(SIGNOUT_WIPE_KEY, me);
    a.m.set(SIGNOUT_DRAFTS_KEY, me);
    await wipeSignOutIfPending(null, a.s);
    expect([...a.m.keys()]).toEqual(["octo.drafts.v1.demo"]);
    const b = three();
    b.m.set(SIGNOUT_WIPE_KEY, me);
    b.m.set(SIGNOUT_DRAFTS_KEY, me);
    await forgetSignOutMark(me, b.s);
    expect(b.m.has(SIGNOUT_DRAFTS_KEY)).toBe(false);
    expect(b.m.has("octo.drafts.v1.c1.u1")).toBe(true);
  });
  it("removed from a company (A2): nobody was asked — its drafts stay", async () => {
    const { m, s } = three();
    await wipeLeftCompanies(me, { signedIn: () => me, pauseMs: 0, active: () => new Set(["c1"]), s });
    expect([...m.keys()].sort()).toEqual(["octo.drafts.v1.c1.u1", "octo.drafts.v1.c2.u1", "octo.drafts.v1.demo"]);
  });
});
