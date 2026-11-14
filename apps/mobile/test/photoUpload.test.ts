/**
 * #1431: a photo the cloud refused is marked on the phone with a reason, shown on every phone, kept across a reload, and
 * sent again on «Повторить». The pure rules (src/data/photoUpload.ts) and the real uploadPhoto / applyOp with a stand-in
 * Supabase (what goes to the files row, what the phone is told back).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB, Photo, Visit } from "../src/data/types";

// ---- a stand-in Supabase: rows written, the storage's answer chosen per test
const writes: { table: string; op: string; row?: Record<string, unknown>; id?: unknown }[] = [];
const storage = { error: null as unknown, uploads: 0 };
const ok = { error: null, status: 200 };
const thenable = (v: unknown) => ({ then: (r: (x: unknown) => unknown, j?: (e: unknown) => unknown) => Promise.resolve(v).then(r, j) });
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (table: string) => ({
      update: (row: Record<string, unknown>) => ({ eq: (_c: string, id: unknown) => (writes.push({ table, op: "update", row, id }), thenable(ok)) }),
      upsert: (row: Record<string, unknown>) => (writes.push({ table, op: "upsert", row }), thenable(ok)),
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
const { FILES_MAX_BYTES, canRetry, failedPhotos, keepPhotoLocal, markPhoto, photoFailOf, tooBig } = await import("../src/data/photoUpload");

let file: { size: number; type: string } | "gone" = { size: 300_000, type: "image/jpeg" };
beforeEach(() => {
  writes.length = 0;
  storage.error = null;
  storage.uploads = 0;
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
  it("the server's «not now» (503): throws, nothing marked", async () => {
    storage.error = storageError(503, "503", "Service Unavailable");
    await expect(uploadPhoto("c1", "f1", "file:///p.jpg")).rejects.toThrow();
    expect(statusOf()).toEqual([]);
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
  it("«Повторить» needs the file here; a vanished file cannot be sent", () => {
    expect(canRetry({ id: "a", kind: "before", uri: "file:///a", upload: { failed: "tooBig", at: "x" } })).toBe(true);
    expect(canRetry({ id: "a", kind: "before", upload: { failed: "refused", at: "x" } })).toBe(false);
    expect(canRetry({ id: "a", kind: "before", uri: "file:///a", upload: { failed: "gone", at: "x" } })).toBe(false);
    expect(canRetry({ id: "a", kind: "before", uri: "file:///a" })).toBe(false);
  });
});
