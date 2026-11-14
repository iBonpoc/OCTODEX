/**
 * #1431 in StoreProvider itself: a photo whose file the cloud refused is marked with the reason when its op comes back;
 * the reload after the send keeps the file on this phone and the reason; «Повторить» takes the mark off and queues
 * photo.retry with the file; a second refusal puts the mark back, a «taken» takes it off for good. Harness as
 * test/storeSync.test.ts (miniReact; repo, ops, sign-in and AsyncStorage are stand-ins answered by hand).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", () => import("./support/miniReact"));
vi.mock("react/jsx-runtime", () => import("./support/miniReact"));
vi.mock("react/jsx-dev-runtime", () => import("./support/miniReact"));
vi.mock("expo-crypto", () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
    getAllKeys: async () => [...storage.keys()],
    multiRemove: async (ks: string[]) => ks.forEach((k) => storage.delete(k)),
    removeItem: async (k: string) => void storage.delete(k),
  },
}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
const auth = { ready: true, session: null as object | null, company: null as object | null, userId: null as string | null };
vi.mock("@/cloud/auth", () => ({ useAuth: () => auth }));
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
};
const server = { loads: [] as Deferred<unknown>[], sends: [] as { op: { k: string; id?: string; uri?: string }; d: Deferred<unknown> }[] };
vi.mock("@/cloud/repo", async (orig) => ({
  ...(await orig<object>()),
  loadCompanyDB: () => {
    const d = deferred<unknown>();
    server.loads.push(d);
    return d.promise;
  },
}));
vi.mock("@/cloud/ops", async (orig) => ({
  ...(await orig<object>()),
  applyOp: (op: { k: string }) => {
    const d = deferred<unknown>();
    server.sends.push({ op, d });
    return d.promise;
  },
  renewSession: async () => {},
  sendVisitPoint: () => new Promise(() => {}),
}));
vi.mock("@/cloud/outboxTiming", () => ({ SEND_AFTER_MS: 0, readyToSend: () => true }));
vi.mock("@/data/appActive", () => ({ onAppActive: () => () => {}, onAppLeave: () => () => {} }));
vi.mock("@/data/outboxRetry", async (orig) => ({ ...(await orig<object>()), backoffMs: () => 0 }));

import { render, settle, type Root } from "./support/miniReact";
import { StoreProvider } from "../src/data/store";
import { makeSeed } from "../src/data/seed";
import type { DB, Photo } from "../src/data/types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Value = { db: DB; queue: { label: string }[]; addPhoto: (v: string, k: "before" | "after", uri?: string) => () => void; retryPhoto: (v: string, p: string) => () => void };
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
let root: Root<P> | null = null;

beforeEach(() => {
  storage.clear();
  server.loads.length = 0;
  server.sends.length = 0;
  Object.assign(auth, { session: {}, userId: "u1", company: { companyId: "c1", role: "owner", companyName: "Co" } });
});
afterEach(() => {
  root?.unmount();
  root = null;
});

/** the outbox tick sends what waits; wait for the n-th send */
async function sent(n: number) {
  for (let i = 0; i < 40 && server.sends.length < n; i++) {
    await wait(100);
    await settle();
  }
  expect(server.sends.length).toBe(n);
  return server.sends[n - 1]!;
}
/** the server's copy of the company: the phone's visits, its photos as the server reads them (no file, «failed» only) */
const serverCopy = (db: DB, failed: Set<string>): DB => ({
  ...db,
  visits: db.visits.map((v) => ({
    ...v,
    photos: v.photos.map((p): Photo => ({ id: p.id, kind: p.kind, ...(failed.has(p.id) ? { upload: { failed: "refused", at: "2026-11-14T00:00:00Z" } } : {}) })),
  })),
});
async function answerReload(r: Root<P>, failed: Set<string>) {
  for (let i = 0; i < 40 && !server.loads.some((d) => !(d as { done?: boolean }).done); i++) {
    await wait(100);
    await settle();
  }
  const d = server.loads.find((x) => !(x as { done?: boolean }).done)!;
  (d as { done?: boolean }).done = true;
  d.resolve(serverCopy(valueOf(r).db, failed));
  await settle();
  await wait(50);
  await settle();
}
const photoOf = (r: Root<P>, visitId: string, id: string) => valueOf(r).db.visits.find((v) => v.id === visitId)!.photos.find((p) => p.id === id)!;

describe("unit:photoUploadStore — a refused photo on the phone (#1431)", () => {
  it("marked with the reason, kept across the reload, «Повторить» sends it again", { timeout: 20_000 }, async () => {
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    const seed = makeSeed();
    (server.loads[0] as { done?: boolean }).done = true;
    server.loads[0]!.resolve(seed);
    await settle();
    const visitId = seed.visits[0]!.id;

    valueOf(r).addPhoto(visitId, "before", "file:///big.jpg");
    await settle();
    const photo = valueOf(r).db.visits.find((v) => v.id === visitId)!.photos.at(-1)!;
    expect(photo.upload).toBeUndefined();
    const add = await sent(1);
    expect(add.op).toMatchObject({ k: "photo.add", id: photo.id, uri: "file:///big.jpg" });
    add.d.resolve({ photo: { id: photo.id, failed: "tooBig" } });
    await settle();
    expect(photoOf(r, visitId, photo.id).upload?.failed).toBe("tooBig");

    // the reload after the send: the server has «failed» without a reason and no file — the phone keeps both
    await answerReload(r, new Set([photo.id]));
    expect(photoOf(r, visitId, photo.id)).toMatchObject({ uri: "file:///big.jpg", upload: { failed: "tooBig" } });
    // kept on the device too (the next start reads the same)
    for (let i = 0; i < 30 && !(storage.get("octo.cloud.v1.c1.u1") ?? "").includes("tooBig"); i++) await wait(100);
    expect(storage.get("octo.cloud.v1.c1.u1") ?? "").toContain("tooBig");

    // «Повторить»: the mark goes at once, photo.retry with the file is queued
    valueOf(r).retryPhoto(visitId, photo.id);
    await settle();
    expect(photoOf(r, visitId, photo.id).upload).toBeUndefined();
    expect(valueOf(r).queue.map((q) => q.label)).toContain("photo.retry");
    const retry = await sent(2);
    expect(retry.op).toMatchObject({ k: "photo.retry", id: photo.id, uri: "file:///big.jpg" });
    // refused again: the mark is back, with the new reason
    retry.d.resolve({ photo: { id: photo.id, failed: "refused" } });
    await settle();
    expect(photoOf(r, visitId, photo.id).upload?.failed).toBe("refused");
    await answerReload(r, new Set([photo.id]));

    // and once more — taken: the mark goes, and the reload (the server has no «failed») keeps it off
    valueOf(r).retryPhoto(visitId, photo.id);
    await settle();
    const third = await sent(3);
    third.d.resolve({ photo: { id: photo.id, failed: null } });
    await settle();
    expect(photoOf(r, visitId, photo.id).upload).toBeUndefined();
    await answerReload(r, new Set());
    expect(photoOf(r, visitId, photo.id)).toEqual({ id: photo.id, kind: "before", uri: "file:///big.jpg" });
  });

  it("nothing to send again: a photo without a mark, or with no file here — no op", async () => {
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    const seed = makeSeed();
    const v = seed.visits[0]!;
    v.photos = [
      { id: "p-ok", kind: "before", uri: "file:///ok.jpg" },
      { id: "p-other-phone", kind: "before", upload: { failed: "refused", at: "2026-11-14T00:00:00Z" } },
      { id: "p-gone", kind: "before", uri: "blob:http://x/dead", upload: { failed: "gone", at: "2026-11-14T00:00:00Z" } },
    ];
    server.loads[0]!.resolve(seed);
    await settle();
    for (const id of ["p-ok", "p-other-phone", "p-gone", "nope"]) valueOf(r).retryPhoto(v.id, id);
    await settle();
    expect(valueOf(r).queue.filter((q) => q.label === "photo.retry")).toEqual([]);
    expect(photoOf(r, v.id, "p-gone").upload?.failed).toBe("gone");
  });
});
