/**
 * #1431: a photo the cloud did not take. `uploadPhoto` (cloud/ops.ts) marks the files row `upload_status = 'failed'` on
 * a refusal and is not tried again; until now no screen read it — the photo stayed on this phone only and nobody knew.
 * Here: why it was refused (in our words — the screen shows a reason, never the server's text), the mark on the phone's
 * copy, and what a reload keeps (the server's photos carry no local address; without it «Повторить» has nothing to send).
 * Pure: test/photoUpload.test.ts.
 */
import type { DB, Photo, PhotoFail, Visit } from "./types";

/** the cloud bucket's limit (migration 20261114200000_files_size_limit, #1430): a bigger file is refused with 413 */
export const FILES_MAX_BYTES = 25 * 1024 * 1024;

const field = (e: unknown, k: string): unknown => (e && typeof e === "object" ? (e as Record<string, unknown>)[k] : undefined);

/** why the storage refused a file: its size, its type, or something else (the reason the screen tells) */
export function photoFailOf(e: unknown): PhotoFail {
  const status = String(field(e, "statusCode") ?? field(e, "status") ?? "");
  const msg = String(field(e, "message") ?? "");
  if (status === "413" || /maximum allowed size|too large/i.test(msg)) return "tooBig";
  if (status === "415" || /mime type|not supported/i.test(msg)) return "type";
  return "refused";
}

/**
 * the storage's answer that is not about the file: an expired sign-in (older storage answers it as HTTP 400 with
 * statusCode 401/403 and «jwt expired»), a timeout, «too many», its own failure — the op stays and is sent again
 */
export function storageNotNow(e: unknown): boolean {
  const code = Number(field(e, "statusCode")) || 0;
  const msg = String(field(e, "message") ?? "");
  return /jwt expired|exp.? claim|invalid jwt/i.test(msg) || code === 401 || code === 408 || code === 429 || code >= 500;
}

/** a photo is too big before it is sent: refused the same way, without sending 25 MB for nothing */
export const tooBig = (bytes: number) => bytes > FILES_MAX_BYTES;

/** the mark of the photo `id` set (a refusal) or taken off (taken by the cloud) on every visit that holds it */
export function markPhoto(db: DB, id: string, failed: PhotoFail | null, at: string): DB {
  let changed = false;
  const visits = db.visits.map((v) => {
    if (!v.photos.some((p) => p.id === id)) return v;
    changed = true;
    return { ...v, photos: v.photos.map((p): Photo => (p.id !== id ? p : failed ? { ...p, upload: { failed, at } } : withoutMark(p))) };
  });
  return changed ? { ...db, visits } : db;
}

const withoutMark = (p: Photo): Photo => {
  if (!p.upload) return p;
  const { upload: _gone, ...rest } = p;
  return rest;
};

/**
 * The company read again (store.refresh): the server's photos carry no local address and only «failed» without a reason.
 * The phone's copy keeps what only it knows — the photo's file on this phone and why it was refused. A photo the server
 * took (no failed mark) is not marked, whatever the phone thought.
 */
export function keepPhotoLocal(next: DB, prev: DB): DB {
  const before = new Map<string, Photo>();
  for (const v of prev.visits) for (const p of v.photos) before.set(p.id, p);
  if (!before.size) return next;
  let changed = false;
  const visits = next.visits.map((v): Visit => {
    let vChanged = false;
    const photos = v.photos.map((p) => {
      const old = before.get(p.id);
      if (!old) return p;
      const uri = p.uri ?? old.uri;
      const upload = p.upload ? (old.upload ?? p.upload) : undefined;
      if (uri === p.uri && upload === p.upload) return p;
      vChanged = true;
      const out: Photo = { ...p, ...(uri ? { uri } : {}) };
      if (upload) out.upload = upload;
      else delete out.upload;
      return out;
    });
    if (!vChanged) return v;
    changed = true;
    return { ...v, photos };
  });
  return changed ? { ...next, visits } : next;
}

/** every photo the cloud did not take, with its visit (newest refusal first) */
export function failedPhotos(db: DB): { visitId: string; photo: Photo & { upload: NonNullable<Photo["upload"]> } }[] {
  const out: { visitId: string; photo: Photo & { upload: NonNullable<Photo["upload"]> } }[] = [];
  for (const v of db.visits) for (const p of v.photos) if (p.upload) out.push({ visitId: v.id, photo: p as Photo & { upload: NonNullable<Photo["upload"]> } });
  return out.sort((a, b) => (a.photo.upload.at < b.photo.upload.at ? 1 : a.photo.upload.at > b.photo.upload.at ? -1 : 0));
}

/**
 * «Повторить» can help: a plain refusal of a file still on this phone. Not a vanished file (nothing to send), and not one
 * too big or of a type the cloud does not take — the same file would be refused again (design review of #1431 №1).
 */
export const canRetry = (p: Photo) => p.upload?.failed === "refused" && !!p.uri;
