/**
 * #1431 in StoreProvider itself: a photo whose file the cloud refused is marked with the reason when its op comes back;
 * the reload after the send keeps the file on this phone and the reason; «Повторить» takes the mark off and queues
 * photo.retry with the file; a second refusal puts the mark back, a «taken» takes it off for good. Harness as
 * test/storeSync.test.ts (miniReact; repo, ops, sign-in and AsyncStorage are stand-ins answered by hand).
 * #1558: «Повторить» makes the file anew first; a photo or a receipt «preparing» sends only its row, the rounds send the
 * new file (never the original), 5 rounds and a day — «unreadable».
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
// #1558: the picture is made anew by a stand-in — `manip.fail` makes every way fail
const manip = { fail: false, made: 0, started: 0, hold: null as Promise<void> | null };
vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({
      resize() {
        return this;
      },
      async renderAsync() {
        manip.started++;
        if (manip.hold) await manip.hold;
        if (manip.fail) throw new Error("cannot decode");
        return { width: 800, height: 600, saveAsync: async () => ({ uri: `file:///made-${++manip.made}.jpg` }), release() {} };
      },
      release() {},
    }),
  },
}));
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
import { registerModule } from "../src/modules/registry";
import gutters from "../src/modules/gutters/module";
import { sweepLocalFiles, SWEEP_MIN_AGE_MS } from "../src/data/localFiles";
import { addPhoto as addMeasurePhoto, retryPhoto as retryMeasurePhoto } from "../src/modules/gutters/data";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Picked = string | { uri: string } | { preparing: { uri: string; way: "c1" | "c2" | "c3"; why: string } };
type Value = {
  db: DB;
  moduleOp: (...a: unknown[]) => unknown;
  queue: { label: string }[];
  addPhoto: (v: string, k: "before" | "after", photo?: Picked) => () => void;
  retryPhoto: (v: string, p: string) => () => void;
  preparePhotoAgain: (ref: { visitId?: string; photoId: string } | { expenseId: string }) => void;
  addExpense: (x: object, receipt?: Picked) => () => void;
  removePhoto: (v: string, p: string) => () => boolean | void;
  addClientFile: (customerId: string, uri: string) => () => boolean | void;
  retryClientFile: (id: string) => () => boolean | void;
  removeClientFile: (id: string) => () => boolean | void;
};
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
let root: Root<P> | null = null;

beforeEach(() => {
  Object.assign(manip, { fail: false, made: 0, started: 0, hold: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  storage.clear();
  server.loads.length = 0;
  server.sends.length = 0;
  Object.assign(auth, { session: {}, userId: "u1", company: { companyId: "c1", role: "owner", companyName: "Co" } });
});
afterEach(() => {
  vi.restoreAllMocks();
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
    add.d.resolve({ photo: { id: photo.id, failed: "refused" } });
    await settle();
    expect(photoOf(r, visitId, photo.id).upload?.failed).toBe("refused");

    // the reload after the send: the server has «failed» and no file — the phone keeps the file and its mark
    await answerReload(r, new Set([photo.id]));
    expect(photoOf(r, visitId, photo.id)).toMatchObject({ uri: "file:///big.jpg", upload: { failed: "refused" } });
    // kept on the device too (the next start reads the same)
    for (let i = 0; i < 30 && !(storage.get("octo.cloud.v1.c1.u1") ?? "").includes("\"refused\""); i++) await wait(100);
    expect(storage.get("octo.cloud.v1.c1.u1") ?? "").toContain("\"refused\"");

    // «Повторить»: made anew first (#1558: the file kept may be an original) — «preparing», then photo.retry with the new file
    valueOf(r).retryPhoto(visitId, photo.id);
    const retry = await sent(2);
    expect(retry.op).toMatchObject({ k: "photo.retry", id: photo.id, uri: "file:///made-1.jpg" });
    expect(photoOf(r, visitId, photo.id).upload).toBeUndefined();
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
    expect(photoOf(r, visitId, photo.id)).toEqual({ id: photo.id, kind: "before", uri: "file:///made-2.jpg" });
  });

  it("nothing to send again: no mark, no file here, or a file the cloud would refuse again — no op", async () => {
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    const seed = makeSeed();
    const v = seed.visits[0]!;
    v.photos = [
      { id: "p-ok", kind: "before", uri: "file:///ok.jpg" },
      { id: "p-other-phone", kind: "before", upload: { failed: "refused", at: "2026-11-14T00:00:00Z" } },
      { id: "p-gone", kind: "before", uri: "blob:http://x/dead", upload: { failed: "gone", at: "2026-11-14T00:00:00Z" } },
      // too big: the same file would be refused again — no «Повторить»
      { id: "p-big", kind: "before", uri: "file:///big.jpg", upload: { failed: "tooBig", at: "2026-11-14T00:00:00Z" } },
    ];
    server.loads[0]!.resolve(seed);
    await settle();
    for (const id of ["p-ok", "p-other-phone", "p-gone", "p-big", "nope"]) valueOf(r).retryPhoto(v.id, id);
    await settle();
    expect(valueOf(r).queue.filter((q) => q.label === "photo.retry")).toEqual([]);
    expect(photoOf(r, v.id, "p-gone").upload?.failed).toBe("gone");
  });

});

describe("unit:photoUploadStore — #1558 the original never goes to the cloud (spec 46 §5.3а)", () => {
  const start = async () => {
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    return r;
  };
  const load = async (seed: DB) => {
    (server.loads[0] as { done?: boolean }).done = true;
    server.loads[0]!.resolve(seed);
    await settle();
  };
  const orig = { preparing: { uri: "file:///orig-with-gps.heic", way: "c2" as const, why: "cannot decode" } };

  it("a photo «preparing»: only its row goes; «Подготовить снова» made it — photo.retry with the new file", { timeout: 20_000 }, async () => {
    const r = await start();
    const seed = makeSeed();
    await load(seed);
    const visitId = seed.visits[0]!.id;
    valueOf(r).addPhoto(visitId, "before", orig);
    await settle();
    const p = valueOf(r).db.visits.find((v) => v.id === visitId)!.photos.at(-1)!;
    expect(p).toMatchObject({ uri: "file:///orig-with-gps.heic", upload: { failed: "preparing" } });
    expect(p.prep).toHaveLength(1);
    const add = await sent(1);
    expect(add.op).toMatchObject({ k: "photo.add", id: p.id });
    expect((add.op as { uri?: string }).uri).toBeUndefined();
    add.d.resolve(undefined);
    await settle();
    valueOf(r).preparePhotoAgain({ visitId, photoId: p.id });
    const retry = await sent(2);
    expect(retry.op).toEqual({ k: "photo.retry", id: p.id, visitId, uri: "file:///made-1.jpg" });
    expect(photoOf(r, visitId, p.id)).toEqual({ id: p.id, kind: "before", uri: "file:///made-1.jpg" });
    expect(JSON.stringify(server.sends.map((x) => x.op))).not.toContain("orig-with-gps");
  });

  it("#1659 (review 25.11): a deleted photo's file is not swept while «Вернуть» may bring it back", { timeout: 20_000 }, async () => {
    const r = await start();
    const seed = makeSeed();
    await load(seed);
    const visitId = seed.visits[0]!.id;
    const dir = "file:///C/Caches/ImagePicker/";
    const file = `${dir}undo-me.jpg`;
    valueOf(r).addPhoto(visitId, "before", file);
    await settle();
    const p = valueOf(r).db.visits.find((v) => v.id === visitId)!.photos.at(-1)!;
    // sent: the queue names the file no more — only the visit does
    const add = await sent(1);
    add.d.resolve(undefined);
    await settle();
    await wait(50);
    const undo = valueOf(r).removePhoto(visitId, p.id);
    // the phone's record is written without the photo: only the undo names the file now
    for (let i = 0; i < 40 && [...storage.values()].some((v) => v.includes("undo-me")); i++) {
      await wait(100);
      await settle();
    }
    expect([...storage.values()].some((v) => v.includes("undo-me"))).toBe(false);
    const left = new Set([file, `${dir}orphan.jpg`]);
    const now = Date.now();
    const gone = await sweepLocalFiles({
      dirs: () => [dir],
      list: () => [...left].map((uri) => ({ uri, modified: now - SWEEP_MIN_AGE_MS - 1 })),
      remove: (u) => void left.delete(u),
      keys: async () => [...storage.keys()],
      read: async (k) => storage.get(k) ?? null,
    }, now);
    expect(gone).toBe(1);
    expect([...left]).toEqual([file]);
    undo();
    await settle();
    expect(photoOf(r, visitId, p.id).uri).toBe(file);
  });

  it("at the start: a photo «preparing» long enough is tried again by itself", { timeout: 20_000 }, async () => {
    const r = await start();
    const seed = makeSeed();
    const v = seed.visits[0]!;
    const old = "2026-11-01T00:00:00Z";
    v.photos = [{ id: "p-prep", kind: "before", uri: "file:///orig.heic", upload: { failed: "preparing", at: old }, prep: [{ at: old, way: "c2", why: "x" }] }];
    await load(seed);
    const s = await sent(1);
    expect(s.op).toEqual({ k: "photo.retry", id: "p-prep", visitId: v.id, uri: "file:///made-1.jpg" });
  });

  it("5 rounds and a day: «unreadable», nothing sent; the next round is only by «Подготовить снова»", { timeout: 20_000 }, async () => {
    manip.fail = true;
    const r = await start();
    const seed = makeSeed();
    const v = seed.visits[0]!;
    const old = (h: number) => new Date(Date.parse("2026-11-01T00:00:00Z") + h * 3_600_000).toISOString();
    v.photos = [{ id: "p-prep", kind: "before", uri: "file:///orig.heic", upload: { failed: "preparing", at: old(0) }, prep: [0, 1, 2, 3].map((h) => ({ at: old(h), way: "c2" as const, why: "x" })) }];
    await load(seed);
    for (let i = 0; i < 40 && photoOf(r, v.id, "p-prep").upload?.failed !== "unreadable"; i++) {
      await wait(100);
      await settle();
    }
    expect(photoOf(r, v.id, "p-prep").upload?.failed).toBe("unreadable");
    expect(photoOf(r, v.id, "p-prep").prep).toHaveLength(5);
    expect(server.sends).toEqual([]);
  });

  it("a receipt «preparing»: the expense and its row go without bytes; made — file.send with the new file", { timeout: 20_000 }, async () => {
    const r = await start();
    await load(makeSeed());
    valueOf(r).addExpense({ jobId: null, vendor: "Depot", category: "materials", amountCents: 1200 }, orig);
    await settle();
    const x = valueOf(r).db.expenses![0]!;
    expect(x).toMatchObject({ receiptUri: "file:///orig-with-gps.heic", receiptFailed: "preparing" });
    const add = await sent(1);
    expect(add.op).toMatchObject({ k: "expense.add", id: x.id, receiptFileId: x.receiptFileId });
    expect((add.op as { receiptUri?: string }).receiptUri).toBeUndefined();
    add.d.resolve(undefined);
    await settle();
    valueOf(r).preparePhotoAgain({ expenseId: x.id });
    const send = await sent(2);
    expect(send.op).toEqual({ k: "file.send", id: x.receiptFileId, expenseId: x.id, uri: "file:///made-1.jpg" });
    send.d.resolve({ receipt: { expenseId: x.id, failed: null } });
    await settle();
    expect(valueOf(r).db.expenses![0]).toMatchObject({ receiptUri: "file:///made-1.jpg" });
    expect(valueOf(r).db.expenses![0]!.receiptFailed).toBeUndefined();
  });

  it("«Подготовить снова» while a round runs is done right after it, not lost", { timeout: 20_000 }, async () => {
    const gate = deferred<void>();
    manip.hold = gate.promise;
    const r = await start();
    const seed = makeSeed();
    const v = seed.visits[0]!;
    const old = "2026-11-01T00:00:00Z";
    v.photos = [
      { id: "p-due", kind: "before", uri: "file:///a.heic", upload: { failed: "preparing", at: old }, prep: [{ at: old, way: "c2", why: "x" }] },
      { id: "p-tap", kind: "before", uri: "file:///b.heic", upload: { failed: "unreadable", at: old }, prep: [{ at: old, way: "c2", why: "x" }] },
    ];
    await load(seed);
    // the round at the start is busy with p-due (the picture is still being read)
    for (let i = 0; i < 40 && manip.started === 0; i++) await wait(100);
    expect(manip.started).toBe(1);
    valueOf(r).preparePhotoAgain({ photoId: "p-tap" });
    manip.hold = null;
    gate.resolve();
    // the queue sends one at a time: the first answered, the second goes
    (await sent(1)).d.resolve({ photo: { id: server.sends[0]!.op.id, failed: null } });
    await sent(2);
    expect(server.sends.map((x) => x.op.id).sort()).toEqual(["p-due", "p-tap"]);
  });
});

/** #1441: the same cycle for a module's photo (a measurement's, in db.files) through module.op */
describe("unit:photoUploadStore — a measurement's refused photo (#1441)", () => {
  registerModule(gutters);
  const fileOf = (r: Root<P>, id: string) => (valueOf(r).db.files ?? []).find((f) => f.id === id)!;
  it("photo.add refused → marked; the reload keeps the file and the reason; «Повторить» → photo.retry; refused again → back; taken → off", { timeout: 20_000 }, async () => {
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    const seed = makeSeed();
    const on = { ...seed, company: { ...seed.company!, modules: { ...(seed.company?.modules ?? {}), gutters: { enabled: true, trialEndsAt: new Date(Date.now() + 86_400_000).toISOString(), settings: {}, rowVersion: 1 } } } } as DB;
    (server.loads[0] as { done?: boolean }).done = true;
    server.loads[0]!.resolve(on);
    await settle();
    const ms = () => valueOf(r) as unknown as Parameters<typeof addMeasurePhoto>[0];
    addMeasurePhoto(ms(), { id: "mp1", measurementId: "m1", uri: "file:///m.jpg", at: "2026-11-18T10:00:00Z" });
    await settle();
    expect(fileOf(r, "mp1").upload).toBeUndefined();
    const add = await sent(1);
    expect(add.op).toMatchObject({ k: "module.op", module: "gutters", kind: "photo.add" });
    add.d.resolve({ photo: { id: "mp1", failed: "refused" } });
    await settle();
    expect(fileOf(r, "mp1").upload?.failed).toBe("refused");

    // the reload: the server's files carry «failed» and no file — the phone keeps both
    for (let i = 0; i < 40 && !server.loads.some((d) => !(d as { done?: boolean }).done); i++) {
      await wait(100);
      await settle();
    }
    const d = server.loads.find((x) => !(x as { done?: boolean }).done)!;
    (d as { done?: boolean }).done = true;
    const now = valueOf(r).db;
    d.resolve({ ...now, files: (now.files ?? []).map(({ uri: _u, upload: _x, ...f }) => ({ ...f, ...(f.id === "mp1" ? { upload: { failed: "refused" as const, at: "2026-11-18T00:00:00Z" } } : {}) })) });
    await settle();
    await wait(50);
    await settle();
    expect(fileOf(r, "mp1")).toMatchObject({ uri: "file:///m.jpg", upload: { failed: "refused" } });

    // «Повторить»: the mark goes at once, photo.retry of the module with the file
    retryMeasurePhoto(ms(), "mp1");
    await settle();
    expect(fileOf(r, "mp1").upload).toBeUndefined();
    const retry = await sent(2);
    expect(retry.op).toMatchObject({ k: "module.op", module: "gutters", kind: "photo.retry", payload: { id: "mp1", uri: "file:///m.jpg" } });
    retry.d.resolve({ photo: { id: "mp1", failed: "refused" } });
    await settle();
    expect(fileOf(r, "mp1").upload?.failed).toBe("refused");

    // once more — taken: the mark goes
    retryMeasurePhoto(ms(), "mp1");
    await settle();
    const third = await sent(3);
    third.d.resolve({ photo: { id: "mp1", failed: null } });
    await settle();
    expect(fileOf(r, "mp1").upload).toBeUndefined();
  });
});

describe("unit:photoUploadStore — #3161 a client's photo without a visit: «Повторить» and «Удалить»", () => {
  const fileOf = (r: Root<P>, id: string) => (valueOf(r).db.files ?? []).find((f) => f.id === id);
  it("file.add refused → marked; «Повторить» → file.add again with its file, the mark off; «Удалить» → photo.remove, «Вернуть» brings it back", { timeout: 20_000 }, async () => {
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    (server.loads[0] as { done?: boolean }).done = true;
    server.loads[0]!.resolve(makeSeed());
    await settle();
    const cid = valueOf(r).db.customers[0]!.id;
    valueOf(r).addClientFile(cid, "file:///c.jpg");
    await settle();
    const id = (valueOf(r).db.files ?? []).find((f) => f.customerId === cid && f.uri === "file:///c.jpg")!.id;
    const add = await sent(1);
    expect(add.op).toMatchObject({ k: "file.add", id, customerId: cid, uri: "file:///c.jpg" });
    add.d.resolve({ photo: { id, failed: "refused" } });
    await settle();
    expect(fileOf(r, id)?.upload?.failed).toBe("refused");

    // «Вернуть» on «Повторить»: the mark is back, nothing is sent
    const back = valueOf(r).retryClientFile(id);
    await settle();
    expect(fileOf(r, id)?.upload).toBeUndefined();
    back();
    await settle();
    expect(fileOf(r, id)?.upload?.failed).toBe("refused");
    await wait(300);
    expect(server.sends.length).toBe(1);
    // «Повторить»: the mark goes at once, the same file.add (the row is ignored if there, the bytes go again)
    valueOf(r).retryClientFile(id);
    await settle();
    expect(fileOf(r, id)?.upload).toBeUndefined();
    const again = await sent(2);
    expect(again.op).toMatchObject({ k: "file.add", id, customerId: cid, uri: "file:///c.jpg" });
    again.d.resolve({ photo: { id, failed: null } });
    await settle();
    expect(fileOf(r, id)?.upload).toBeUndefined();
    // nothing to retry now (not refused): a no-op, nothing queued
    valueOf(r).retryClientFile(id);
    await settle();
    await wait(300);
    expect(server.sends.length).toBe(2);

    // «Удалить»: off the client at once; «Вернуть» brings it back and nothing is sent
    const undo = valueOf(r).removeClientFile(id);
    await settle();
    expect(fileOf(r, id)).toBeUndefined();
    undo();
    await settle();
    expect(fileOf(r, id)?.uri).toBe("file:///c.jpg");
    await wait(300);
    expect(server.sends.length).toBe(2);
    // deleted for good: photo.remove of that row
    valueOf(r).removeClientFile(id);
    await settle();
    const rm = await sent(3);
    expect(rm.op).toEqual({ k: "photo.remove", id });
    // a second tap on a photo already gone: nothing more is queued
    valueOf(r).removeClientFile(id);
    await settle();
    await wait(300);
    expect(server.sends.length).toBe(3);
  });
});
