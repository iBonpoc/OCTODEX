/**
 * #1431: a photo the cloud refused is marked on the phone with a reason, shown on every phone, kept across a reload, and
 * sent again on «Повторить». The pure rules (src/data/photoUpload.ts) and the real uploadPhoto / applyOp with a stand-in
 * Supabase (what goes to the files row, what the phone is told back).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB, FileItem, Photo, Visit } from "../src/data/types";

// ---- a stand-in Supabase: rows written, the storage's answer chosen per test
const writes: { table: string; op: string; row?: Record<string, unknown>; id?: unknown }[] = [];
const storage = { error: null as unknown, uploads: 0 };
// what a read of a files row answers (#1557: is the upload already recorded?)
const fileRows = new Map<string, Record<string, unknown>>();
let readError: unknown = null;
const ok = { error: null, status: 200 };
const thenable = (v: unknown) => ({ then: (r: (x: unknown) => unknown, j?: (e: unknown) => unknown) => Promise.resolve(v).then(r, j) });
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (table: string) => ({
      update: (row: Record<string, unknown>) => ({ eq: (_c: string, id: unknown) => (writes.push({ table, op: "update", row, id }), thenable(ok)) }),
      upsert: (row: Record<string, unknown>) => (writes.push({ table, op: "upsert", row }), thenable(ok)),
      select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => (readError ? { data: null, error: readError, status: 0 } : { data: fileRows.get(id) ?? null, error: null, status: 200 }) }) }),
    }),
    storage: {
      from: () => ({
        upload: async () => {
          storage.uploads++;
          return { error: storage.error };
        },
      }),
    },
  },
}));
const { applyOp, uploadPhoto } = await import("../src/cloud/ops");
const { FILES_MAX_BYTES, canRetry, failedPhotos, hasReceipt, keepPhotoLocal, keepReceiptLocal, markPhoto, photoFailOf, tooBig } = await import("../src/data/photoUpload");
const { makeSeed } = await import("../src/data/seed");
const { normalizeDB } = await import("../src/data/normalize");

let file: { size: number; type: string } | "gone" = { size: 300_000, type: "image/jpeg" };
beforeEach(() => {
  writes.length = 0;
  storage.error = null;
  storage.uploads = 0;
  fileRows.clear();
  readError = null;
  file = { size: 300_000, type: "image/jpeg" };
  vi.stubGlobal("fetch", async () => {
    if (file === "gone") throw new TypeError("Failed to fetch");
    const f = file;
    return { blob: async () => ({ size: f.size, type: f.type }) };
  });
});
const statusOf = () => writes.filter((w) => w.table === "files" && w.op === "update").map((w) => w.row?.upload_status);

// a StorageApiError as storage-js makes it (status, statusCode, message)
const storageError = (status: number, statusCode: string, message: string) => Object.assign(new Error(message), { name: "StorageApiError", status, statusCode });

describe("photoFailOf — the storage's «no» in our words", () => {
  it("size, type, anything else", () => {
    expect(photoFailOf(storageError(413, "413", "The object exceeded the maximum allowed size"))).toBe("tooBig");
    expect(photoFailOf(storageError(400, "413", "Payload too large"))).toBe("tooBig");
    expect(photoFailOf({ message: "The object exceeded the maximum allowed size" })).toBe("tooBig");
    expect(photoFailOf(storageError(415, "415", "mime type image/heic is not supported"))).toBe("type");
    expect(photoFailOf(storageError(403, "403", "new row violates row-level security policy"))).toBe("refused");
    expect(photoFailOf(null)).toBe("refused");
  });
  it("the limit is the bucket's 25 MB", () => {
    expect(FILES_MAX_BYTES).toBe(26214400);
    expect(tooBig(FILES_MAX_BYTES)).toBe(false);
    expect(tooBig(FILES_MAX_BYTES + 1)).toBe(true);
  });
});

describe("uploadPhoto — what the files row and the phone are told", () => {
  it("taken: uploaded, null back", async () => {
    expect(await uploadPhoto("c1", "f1", "file:///p.jpg")).toBeNull();
    expect(storage.uploads).toBe(1);
    expect(statusOf()).toEqual(["uploaded"]);
  });
  it("the storage says the file is too big: failed, «tooBig»", async () => {
    storage.error = storageError(413, "413", "The object exceeded the maximum allowed size");
    expect(await uploadPhoto("c1", "f1", "file:///p.jpg")).toBe("tooBig");
    expect(statusOf()).toEqual(["failed"]);
  });
  it("over 25 MB on the phone: refused the same way, never sent", async () => {
    file = { size: FILES_MAX_BYTES + 1, type: "image/jpeg" };
    expect(await uploadPhoto("c1", "f1", "file:///p.jpg")).toBe("tooBig");
    expect(storage.uploads).toBe(0);
    expect(statusOf()).toEqual(["failed"]);
  });
  it("the file is no longer on the phone: failed, «gone»", async () => {
    file = "gone";
    expect(await uploadPhoto("c1", "f1", "blob:http://x/dead")).toBe("gone");
    expect(storage.uploads).toBe(0);
    expect(statusOf()).toEqual(["failed"]);
  });
  it("no network: not a refusal — throws, the op stays in the queue, nothing marked", async () => {
    storage.error = new TypeError("Failed to fetch");
    await expect(uploadPhoto("c1", "f1", "file:///p.jpg")).rejects.toThrow();
    expect(statusOf()).toEqual([]);
  });
  it("an expired sign-in the storage answers as 400 + statusCode 403 «jwt expired»: not the file's fault — throws, nothing marked", async () => {
    storage.error = storageError(400, "403", "jwt expired");
    await expect(uploadPhoto("c1", "f1", "file:///p.jpg")).rejects.toThrow();
    storage.error = storageError(400, "401", "Invalid JWT");
    await expect(uploadPhoto("c1", "f1", "file:///p.jpg")).rejects.toThrow();
    expect(statusOf()).toEqual([]);
  });
  it("the server's «not now» (503): throws, nothing marked", async () => {
    storage.error = storageError(503, "503", "Service Unavailable");
    await expect(uploadPhoto("c1", "f1", "file:///p.jpg")).rejects.toThrow();
    expect(statusOf()).toEqual([]);
  });
});

describe("uploadPhoto — a repeat after the upload was recorded (#1557)", () => {
  it("the answer of «uploaded» was lost, the repeat is refused: the row already records it — taken, not marked failed", async () => {
    storage.error = storageError(403, "403", "new row violates row-level security policy");
    fileRows.set("f1", { upload_status: "uploaded", storage_key: "c1/f1.jpg" });
    expect(await uploadPhoto("c1", "f1", "file:///p.jpg")).toBeNull();
    expect(statusOf()).toEqual([]);
  });
  it("the answer was lost, then the file is gone from the phone: the row records it — taken, not «gone»", async () => {
    file = "gone";
    fileRows.set("f1", { upload_status: "uploaded", storage_key: "c1/f1.jpg" });
    expect(await uploadPhoto("c1", "f1", "file:///p.jpg")).toBeNull();
    expect(statusOf()).toEqual([]);
  });
  it("refused and the row cannot be read (no network): throws — the op waits, nothing marked on a guess", async () => {
    storage.error = storageError(403, "403", "new row violates row-level security policy");
    readError = { message: "TypeError: Failed to fetch", code: "" };
    await expect(uploadPhoto("c1", "f1", "file:///p.jpg")).rejects.toBeTruthy();
    expect(statusOf()).toEqual([]);
  });
  it("refused and the row records nothing: still «refused»", async () => {
    storage.error = storageError(403, "403", "new row violates row-level security policy");
    fileRows.set("f1", { upload_status: "local", storage_key: null });
    expect(await uploadPhoto("c1", "f1", "file:///p.jpg")).toBe("refused");
    expect(statusOf()).toEqual(["failed"]);
  });
});

describe("applyOp — photo.add and photo.retry tell the phone back", () => {
  it("photo.add: the row, then the file; a refusal comes back with its reason", async () => {
    storage.error = storageError(415, "415", "mime type not supported");
    const r = await applyOp({ k: "photo.add", id: "f1", visitId: "v1", stage: "before", uri: "file:///p.jpg" }, "c1", "u1");
    expect(r).toEqual({ photo: { id: "f1", failed: "type" } });
    expect(writes[0]).toMatchObject({ table: "files", op: "upsert" });
  });
  it("photo.add without a file: nothing to tell", async () => {
    expect(await applyOp({ k: "photo.add", id: "f1", visitId: "v1", stage: "before" }, "c1", "u1")).toBeUndefined();
  });
  it("#1558 file.send: a receipt's bytes once prepared — the answer is for its expense", async () => {
    const r = await applyOp({ k: "file.send", id: "f7", expenseId: "x7", uri: "file:///r.jpg" }, "c1", "u1");
    expect(r).toEqual({ receipt: { expenseId: "x7", failed: null } });
    expect(writes.filter((w) => w.op === "upsert")).toEqual([]);
    expect(statusOf()).toEqual(["uploaded"]);
  });
  it("#1558 expense.add with a receipt «preparing»: its row goes, no bytes, nothing told back", async () => {
    const r = await applyOp({ k: "expense.add", id: "x1", jobId: null, vendor: "V", category: "materials", amountCents: 100, receiptFileId: "f1" }, "c1", "u1");
    expect(r).toBeUndefined();
    expect(storage.uploads).toBe(0);
    expect(writes.find((w) => w.table === "files")?.row).toMatchObject({ id: "f1", kind: "receipt" });
  });
  it("photo.retry: only the file again (the row is there); taken — null", async () => {
    const r = await applyOp({ k: "photo.retry", id: "f1", visitId: "v1", uri: "file:///p.jpg" }, "c1", "u1");
    expect(r).toEqual({ photo: { id: "f1", failed: null } });
    expect(writes.filter((w) => w.op === "upsert")).toEqual([]);
    expect(statusOf()).toEqual(["uploaded"]);
  });
});

// ---- the phone's copy
const visit = (id: string, photos: Photo[]): Visit => ({ id, photos }) as unknown as Visit;
const dbOf = (...visits: Visit[]): DB => ({ visits }) as unknown as DB;

describe("markPhoto", () => {
  it("sets the mark with the reason, takes it off, leaves the rest as it is", () => {
    const d0 = dbOf(visit("v1", [{ id: "p1", kind: "before", uri: "file:///1" }, { id: "p2", kind: "after" }]), visit("v2", []));
    const d1 = markPhoto(d0, "p1", "tooBig", "2026-11-14T10:00:00Z");
    expect(d1.visits[0]!.photos[0]).toEqual({ id: "p1", kind: "before", uri: "file:///1", upload: { failed: "tooBig", at: "2026-11-14T10:00:00Z" } });
    expect(d1.visits[0]!.photos[1]).toBe(d0.visits[0]!.photos[1]);
    expect(d1.visits[1]).toBe(d0.visits[1]);
    const d2 = markPhoto(d1, "p1", null, "");
    expect(d2.visits[0]!.photos[0]).toEqual({ id: "p1", kind: "before", uri: "file:///1" });
    expect("upload" in d2.visits[0]!.photos[0]!).toBe(false);
  });
  it("a photo the phone does not hold: the same copy back", () => {
    const d0 = dbOf(visit("v1", [{ id: "p1", kind: "before" }]));
    expect(markPhoto(d0, "nope", "refused", "x")).toBe(d0);
  });
});

describe("keepPhotoLocal — a reload keeps what only the phone knows", () => {
  const at = "2026-11-14T10:00:00Z";
  it("the file on this phone and the reason; the server's «failed» without a reason gets the phone's", () => {
    const prev = dbOf(visit("v1", [{ id: "p1", kind: "before", uri: "file:///1", upload: { failed: "tooBig", at } }, { id: "p2", kind: "after", uri: "file:///2" }]));
    const next = dbOf(visit("v1", [{ id: "p1", kind: "before", upload: { failed: "refused", at: "2026-11-14T09:00:00Z" } }, { id: "p2", kind: "after" }]));
    const out = keepPhotoLocal(next, prev);
    expect(out.visits[0]!.photos).toEqual([
      { id: "p1", kind: "before", uri: "file:///1", upload: { failed: "tooBig", at } },
      { id: "p2", kind: "after", uri: "file:///2" },
    ]);
  });
  it("the server took it (no failed mark): the phone's mark goes", () => {
    const prev = dbOf(visit("v1", [{ id: "p1", kind: "before", uri: "file:///1", upload: { failed: "refused", at } }]));
    const out = keepPhotoLocal(dbOf(visit("v1", [{ id: "p1", kind: "before" }])), prev);
    expect(out.visits[0]!.photos[0]).toEqual({ id: "p1", kind: "before", uri: "file:///1" });
  });
  it("another phone's refused photo: shown failed, nothing to send from here", () => {
    const next = dbOf(visit("v1", [{ id: "p9", kind: "before", upload: { failed: "refused", at } }]));
    const out = keepPhotoLocal(next, dbOf(visit("v1", [])));
    expect(out).toBe(next);
    expect(canRetry(out.visits[0]!.photos[0]!)).toBe(false);
  });
  it("nothing to keep: the server's copy itself", () => {
    const next = dbOf(visit("v1", [{ id: "p1", kind: "before", uri: "https://x/1" }]));
    expect(keepPhotoLocal(next, dbOf(visit("v1", [{ id: "p1", kind: "before" }])))).toBe(next);
  });
});

describe("failedPhotos / canRetry", () => {
  it("every refused photo with its visit, the newest first", () => {
    const d = dbOf(
      visit("v1", [{ id: "a", kind: "before", uri: "file:///a", upload: { failed: "refused", at: "2026-11-14T08:00:00Z" } }, { id: "b", kind: "before" }]),
      visit("v2", [{ id: "c", kind: "after", uri: "file:///c", upload: { failed: "tooBig", at: "2026-11-14T09:00:00Z" } }]),
    );
    expect(failedPhotos(d).map((x) => [x.visitId, x.photo.id])).toEqual([["v2", "c"], ["v1", "a"]]);
    expect(failedPhotos(dbOf(visit("v1", [{ id: "b", kind: "before" }])))).toEqual([]);
  });
  it("«Повторить» needs the file here and a plain refusal: a vanished file, a too big one or a refused type would fail again", () => {
    expect(canRetry({ id: "a", kind: "before", uri: "file:///a", upload: { failed: "refused", at: "x" } })).toBe(true);
    expect(canRetry({ id: "a", kind: "before", uri: "file:///a", upload: { failed: "tooBig", at: "x" } })).toBe(false);
    expect(canRetry({ id: "a", kind: "before", uri: "file:///a", upload: { failed: "type", at: "x" } })).toBe(false);
    expect(canRetry({ id: "a", kind: "before", upload: { failed: "refused", at: "x" } })).toBe(false);
    expect(canRetry({ id: "a", kind: "before", uri: "file:///a", upload: { failed: "gone", at: "x" } })).toBe(false);
    expect(canRetry({ id: "a", kind: "before", uri: "file:///a" })).toBe(false);
  });
});

describe("#1558 — a photo or a receipt «preparing» (spec 46 §5.3а)", () => {
  const at = "2026-11-15T10:00:00Z";
  const prep = [{ at, way: "c2" as const, why: "out of memory" }];
  it("«Повторить» is not shown for «preparing» or «unreadable» (the phone tries by itself / «Подготовить снова»)", () => {
    expect(canRetry({ id: "a", kind: "before", uri: "file:///a", upload: { failed: "preparing", at } })).toBe(false);
    expect(canRetry({ id: "a", kind: "before", uri: "file:///a", upload: { failed: "unreadable", at } })).toBe(false);
  });
  it("«Требует внимания»: «preparing» is no reason to worry; «unreadable» is", () => {
    const d = dbOf(visit("v1", [
      { id: "a", kind: "before", uri: "file:///a", upload: { failed: "preparing", at } },
      { id: "b", kind: "before", uri: "file:///b", upload: { failed: "unreadable", at } },
    ]));
    expect(failedPhotos(d).map((x) => x.photo.id)).toEqual(["b"]);
  });
  it("a reload keeps «preparing» and its log — the server has a row without bytes, not «failed»", () => {
    const prev = dbOf(visit("v1", [{ id: "p1", kind: "before", uri: "file:///orig.heic", upload: { failed: "preparing", at }, prep }]));
    const next = dbOf(visit("v1", [{ id: "p1", kind: "before" }]));
    const p = keepPhotoLocal(next, prev).visits[0]!.photos[0]!;
    expect(p).toEqual({ id: "p1", kind: "before", uri: "file:///orig.heic", upload: { failed: "preparing", at }, prep });
  });
  it("a reload keeps a receipt «preparing» (the server reads the row as «есть чек»); it still counts as a receipt", () => {
    const x = { id: "x1", jobId: null, vendor: "V", category: "materials", amountCents: 1, at, memberId: "m" } as const;
    const prev = { visits: [], expenses: [{ ...x, receiptFileId: "f1", receiptUri: "file:///r.heic", receiptFailed: "preparing" as const, receiptPrep: prep }] } as unknown as DB;
    const next = { visits: [], expenses: [{ ...x, receiptFileId: "f1" }] } as unknown as DB;
    const out = keepReceiptLocal(next, prev).expenses![0]!;
    expect(out).toMatchObject({ receiptUri: "file:///r.heic", receiptFailed: "preparing", receiptPrep: prep });
    expect(hasReceipt(out)).toBe(true);
    expect(hasReceipt({ ...out, receiptFailed: "unreadable" })).toBe(false);
  });
});

describe("#1441: a module's photo (db.files) — the same mark and what a reload keeps", () => {
  const at = "2026-11-18T10:00:00Z";
  const withFiles = (files: FileItem[]): DB => ({ ...makeSeed(), files });
  it("markPhoto marks a measurement's photo and takes the mark off; the same answer twice changes nothing", () => {
    const db = withFiles([{ id: "f1", kind: "photo", measurementId: "m1", uri: "file:///a.jpg", at }]);
    const marked = markPhoto(db, "f1", "tooBig", at);
    expect(marked.files![0]!.upload).toEqual({ failed: "tooBig", at });
    expect(markPhoto(marked, "f1", "tooBig", at)).toBe(marked);
    const off = markPhoto(marked, "f1", null, "");
    expect(off.files![0]!.upload).toBeUndefined();
    expect(markPhoto(off, "f1", null, "")).toBe(off);
  });
  it("a reload keeps the file on this phone and the phone's own reason; taken by the cloud — no mark; an older record without the field loads", () => {
    const prev = withFiles([{ id: "f1", kind: "photo", measurementId: "m1", uri: "file:///a.jpg", at, upload: { failed: "tooBig", at } }, { id: "f2", kind: "photo", measurementId: "m1", uri: "file:///b.jpg", at, upload: { failed: "refused", at } }]);
    const next = withFiles([{ id: "f1", kind: "photo", measurementId: "m1", at, upload: { failed: "refused", at } }, { id: "f2", kind: "photo", measurementId: "m1", at }]);
    const kept = keepPhotoLocal(next, prev);
    expect(kept.files![0]).toMatchObject({ uri: "file:///a.jpg", upload: { failed: "tooBig" } });
    expect(kept.files![1]!.uri).toBe("file:///b.jpg");
    expect(kept.files![1]!.upload).toBeUndefined();
    // rule 16: a record an older build wrote (no `upload`) goes through normalize as it was
    const old = normalizeDB({ ...makeSeed(), files: [{ id: "f9", kind: "photo", measurementId: "m1", at } as FileItem] }, "cloud");
    expect(old.files!.find((f) => f.id === "f9")).toMatchObject({ id: "f9", measurementId: "m1" });
    expect(old.files!.find((f) => f.id === "f9")!.upload).toBeUndefined();
  });
});
