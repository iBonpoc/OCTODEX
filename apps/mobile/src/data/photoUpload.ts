/**
 * #1431: a photo the cloud did not take. `uploadPhoto` (cloud/ops.ts) marks the files row `upload_status = 'failed'` on
 * a refusal and is not tried again; until now no screen read it — the photo stayed on this phone only and nobody knew.
 * Here: why it was refused (in our words — the screen shows a reason, never the server's text), the mark on the phone's
 * copy, and what a reload keeps (the server's photos carry no local address; without it «Повторить» has nothing to send).
 * Pure: test/photoUpload.test.ts.
 */
import type { DB, Expense, Photo, PhotoFail, PhotoPrepFail, Visit } from "./types";

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
  // #1441: a module's photo (a measurement's) lives in db.files — the same mark
  const f = (db.files ?? []).find((x) => x.id === id);
  const fileNow = f && (failed ? f.upload?.failed !== failed : !!f.upload);
  const files = fileNow ? (db.files ?? []).map((x) => (x.id !== id ? x : failed ? { ...x, upload: { failed, at } } : withoutMark(x))) : db.files;
  return changed || fileNow ? { ...db, visits, ...(fileNow ? { files } : {}) } : db;
}

const withoutMark = <X extends { upload?: unknown }>(p: X): X => {
  if (!p.upload) return p;
  const { upload: _gone, ...rest } = p;
  return rest as X;
};

/**
 * The company read again (store.refresh): the server's photos carry no local address and only «failed» without a reason.
 * The phone's copy keeps what only it knows — the photo's file on this phone and why it was refused. A photo the server
 * took (no failed mark) is not marked, whatever the phone thought.
 */
export function keepPhotoLocal(next: DB, prev: DB): DB {
  return keepFileLocal(keepVisitPhotoLocal(next, prev), prev);
}

/** #1441: the same for a module's photos (db.files): the file on this phone and why the cloud refused it */
function keepFileLocal(next: DB, prev: DB): DB {
  const before = new Map((prev.files ?? []).filter((f) => f.uri || f.upload).map((f) => [f.id, f]));
  if (!before.size || !next.files?.length) return next;
  let changed = false;
  const files = next.files.map((f) => {
    const old = before.get(f.id);
    if (!old) return f;
    const uri = f.uri ?? old.uri;
    const upload = f.upload ? (old.upload ?? f.upload) : undefined;
    if (uri === f.uri && upload === f.upload) return f;
    changed = true;
    const out = { ...f, ...(uri ? { uri } : {}) };
    if (upload) out.upload = upload;
    else delete out.upload;
    return out;
  });
  return changed ? { ...next, files } : next;
}

function keepVisitPhotoLocal(next: DB, prev: DB): DB {
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
      // #1558: «preparing» / «unreadable» only this phone knows — the server has a row without bytes, not «failed»
      const prepHere = isPrepFail(old.upload?.failed);
      const upload = prepHere ? old.upload : p.upload ? (old.upload ?? p.upload) : undefined;
      const prep = prepHere ? old.prep : undefined;
      const small = p.small ?? old.small;
      if (uri === p.uri && upload === p.upload && prep === p.prep && small === p.small) return p;
      vChanged = true;
      const out: Photo = { ...p, ...(uri ? { uri } : {}), ...(small ? { small } : {}) };
      if (upload) out.upload = upload;
      else delete out.upload;
      if (prep) out.prep = prep;
      else delete out.prep;
      return out;
    });
    if (!vChanged) return v;
    changed = true;
    return { ...v, photos };
  });
  return changed ? { ...next, visits } : next;
}

/**
 * #1538: the company read again — an expense's receipt keeps its file on this phone and why the cloud refused it (the
 * server knows only the files row and «failed»). An expense the phone did not have, or without a receipt here, is as
 * the server says.
 */
export function keepReceiptLocal(next: DB, prev: DB): DB {
  const local = new Map<string, Expense>();
  for (const x of prev.expenses ?? []) if (x.receiptUri || x.receiptFailed) local.set(x.id, x);
  if (!local.size || !next.expenses?.length) return next;
  let changed = false;
  const expenses = next.expenses.map((x) => {
    const old = local.get(x.id);
    if (!old) return x;
    const receiptUri = x.receiptUri ?? old.receiptUri;
    // the server's «failed» carries no reason: the phone's own reason wins; the server took it — no mark
    // #1558: a receipt still being prepared here — the server has the row without bytes, which reads as «есть чек»
    const prepHere = isPrepFail(old.receiptFailed);
    const receiptFailed = prepHere ? old.receiptFailed : x.receiptFailed ? (old.receiptFailed ?? x.receiptFailed) : x.receiptFileId ? undefined : old.receiptFailed;
    const receiptPrep = prepHere ? old.receiptPrep : undefined;
    if (receiptUri === x.receiptUri && receiptFailed === x.receiptFailed && receiptPrep === x.receiptPrep) return x;
    changed = true;
    const out: Expense = { ...x, ...(receiptUri ? { receiptUri } : {}), ...(old.receiptFileId && !x.receiptFileId ? { receiptFileId: old.receiptFileId } : {}) };
    if (receiptFailed) out.receiptFailed = receiptFailed;
    else delete out.receiptFailed;
    if (receiptPrep) out.receiptPrep = receiptPrep;
    else delete out.receiptPrep;
    return out;
  });
  return changed ? { ...next, expenses } : next;
}

/** #1538: the queue's answer for an expense's receipt — refused (with why) or taken (the mark goes) */
export function markReceipt(db: DB, expenseId: string, failed: PhotoFail | null): DB {
  const x = (db.expenses ?? []).find((e) => e.id === expenseId);
  if (!x || (failed ? x.receiptFailed === failed : !x.receiptFailed)) return db;
  const next: Expense = { ...x };
  if (failed) next.receiptFailed = failed;
  else delete next.receiptFailed;
  return { ...db, expenses: (db.expenses ?? []).map((e) => (e.id === expenseId ? next : e)) };
}

/** #1558: the file is not sent yet because it could not be made anew here (not the cloud's «no») */
export const isPrepFail = (f: PhotoFail | undefined): f is PhotoPrepFail => f === "preparing" || f === "unreadable";

/** a receipt to show as «есть чек»: on this phone (also one being prepared, #1558), or taken by the cloud; not one the cloud refused */
export const hasReceipt = (x: Expense) => (!x.receiptFailed || x.receiptFailed === "preparing") && !!(x.receiptUri || x.receiptFileId);

/** every photo the cloud did not take, with its visit (newest refusal first) */
export function failedPhotos(db: DB): { visitId: string; photo: Photo & { upload: NonNullable<Photo["upload"]> } }[] {
  const out: { visitId: string; photo: Photo & { upload: NonNullable<Photo["upload"]> } }[] = [];
  // #1558: a photo being prepared is no reason to worry — it goes on its own; «unreadable» is
  for (const v of db.visits) for (const p of v.photos) if (p.upload && p.upload.failed !== "preparing") out.push({ visitId: v.id, photo: p as Photo & { upload: NonNullable<Photo["upload"]> } });
  return out.sort((a, b) => (a.photo.upload.at < b.photo.upload.at ? 1 : a.photo.upload.at > b.photo.upload.at ? -1 : 0));
}

/**
 * «Повторить» can help: a plain refusal of a file still on this phone. Not a vanished file (nothing to send), and not one
 * too big or of a type the cloud does not take — the same file would be refused again (design review of #1431 №1).
 */
export const canRetry = (p: Photo) => p.upload?.failed === "refused" && !!p.uri;
