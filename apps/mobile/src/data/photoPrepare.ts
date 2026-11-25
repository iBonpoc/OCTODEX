/**
 * #1558 (spec 46 §5.3а): a photo or a receipt that could not be made anew is kept on this phone as «preparing» and
 * never sent as it was picked (the original has the camera's EXIF and GPS). Here: which ones are due for a new round,
 * when «preparing» becomes «unreadable», and what a round's result does to the data and the queue.
 * Pure: test/photoPrepare.test.ts.
 */
import type { Op } from "@/cloud/ops";
import type { Prepared } from "./photoShrink";
import type { DB, Expense, Photo, PhotoPrepFail, PrepTry } from "./types";

/** rounds before a photo may become «unreadable» (and not sooner than PREP_DAY_MS after the first failure) */
export const PREP_ROUNDS = 5;
export const PREP_DAY_MS = 24 * 60 * 60 * 1000;
/** the gap between rounds: a round decodes the whole original — not on every pass of the queue */
export const PREP_GAP_MS = 10 * 60 * 1000;
/** after PREP_ROUNDS rounds the phone waits for the day to pass, trying seldom */
export const PREP_LATE_GAP_MS = 2 * 60 * 60 * 1000;

export type PrepTarget =
  | { kind: "photo"; visitId: string; id: string; uri: string; tries: PrepTry[] }
  | { kind: "receipt"; expenseId: string; fileId: string; uri: string; tries: PrepTry[] };

const ms = (iso: string | undefined) => (iso ? Date.parse(iso) || 0 : 0);

/**
 * a new round is due: the last one long enough ago; none yet — once `hold` ms passed since it was marked (a photo put
 * back to «preparing» by «Повторить» waits out the toast's «Отменить», as a queued op does)
 */
export function prepDue(tries: readonly PrepTry[] | undefined, now: number, markedAt?: string, hold = 0): boolean {
  const list = tries ?? [];
  if (!list.length) return now - ms(markedAt) >= hold;
  const gap = list.length < PREP_ROUNDS ? PREP_GAP_MS : PREP_LATE_GAP_MS;
  return now - ms(list[list.length - 1]!.at) >= gap;
}

/** after a failed round: still «preparing», or «unreadable» — PREP_ROUNDS rounds and a day from the first failure */
export function prepStateAfter(tries: readonly PrepTry[], now: number): PhotoPrepFail {
  return tries.length >= PREP_ROUNDS && now - ms(tries[0]?.at) >= PREP_DAY_MS ? "unreadable" : "preparing";
}

/** the first entry of the log: the failure when the photo was picked */
export const firstTry = (p: { way: PrepTry["way"]; why: string }, at: string): PrepTry[] => [{ at, way: p.way, why: p.why }];

/** every photo and receipt «preparing» with its file still on this phone, due for a round at `now` (`all` — due or not) */
export function prepTargets(db: DB, now: number, all = false, hold = 0): PrepTarget[] {
  const out: PrepTarget[] = [];
  for (const v of db.visits)
    for (const p of v.photos)
      if (p.upload?.failed === "preparing" && p.uri && (all || prepDue(p.prep, now, p.upload.at, hold))) out.push({ kind: "photo", visitId: v.id, id: p.id, uri: p.uri, tries: p.prep ?? [] });
  for (const x of db.expenses ?? [])
    if (x.receiptFailed === "preparing" && x.receiptUri && x.receiptFileId && (all || prepDue(x.receiptPrep, now)))
      out.push({ kind: "receipt", expenseId: x.id, fileId: x.receiptFileId, uri: x.receiptUri, tries: x.receiptPrep ?? [] });
  return out;
}

/** the photo or receipt «unreadable», for «Подготовить снова» (one round by a tap) */
export function prepTargetOf(db: DB, ref: { visitId?: string; photoId: string } | { expenseId: string }): PrepTarget | null {
  if ("expenseId" in ref) {
    const x = (db.expenses ?? []).find((e) => e.id === ref.expenseId);
    return x?.receiptFileId && x.receiptUri && (x.receiptFailed === "preparing" || x.receiptFailed === "unreadable")
      ? { kind: "receipt", expenseId: x.id, fileId: x.receiptFileId, uri: x.receiptUri, tries: x.receiptPrep ?? [] }
      : null;
  }
  // the visit that holds it (a strip knows only the photo)
  const v = db.visits.find((x) => (ref.visitId ? x.id === ref.visitId : true) && x.photos.some((q) => q.id === ref.photoId));
  const p = v?.photos.find((q) => q.id === ref.photoId);
  return v && p?.uri && (p.upload?.failed === "preparing" || p.upload?.failed === "unreadable")
    ? { kind: "photo", visitId: v.id, id: p.id, uri: p.uri, tries: p.prep ?? [] }
    : null;
}

/**
 * a round's result on the data: made — the new file replaces the phone's address, the mark goes and its bytes are
 * queued (photo.retry / file.send); not made — one more line in the log, and maybe «unreadable». A photo or an expense
 * removed meanwhile, or no longer «preparing»/«unreadable», is left as it is (null).
 */
export function applyPrep(db: DB, t: PrepTarget, r: Prepared, now: number): { db: DB; op?: Op } | null {
  const at = new Date(now).toISOString();
  if (t.kind === "photo") {
    const v = db.visits.find((x) => x.id === t.visitId);
    const p = v?.photos.find((x) => x.id === t.id);
    if (!v || !p || !(p.upload?.failed === "preparing" || p.upload?.failed === "unreadable")) return null;
    let next: Photo;
    if (r.ok) {
      const { upload: _u, prep: _p, ...rest } = p;
      next = { ...rest, uri: r.uri, ...(r.small ? { small: true as const } : {}) };
    } else {
      const prep = [...(p.prep ?? []), { at, way: r.way, why: r.why }];
      next = { ...p, prep, upload: { failed: prepStateAfter(prep, now), at } };
    }
    const visits = db.visits.map((x) => (x.id !== v.id ? x : { ...x, photos: x.photos.map((q) => (q.id === p.id ? next : q)) }));
    return { db: { ...db, visits }, ...(r.ok ? { op: { k: "photo.retry", id: p.id, visitId: v.id, uri: r.uri } as Op } : {}) };
  }
  const x = (db.expenses ?? []).find((e) => e.id === t.expenseId);
  if (!x || !x.receiptFileId || !(x.receiptFailed === "preparing" || x.receiptFailed === "unreadable")) return null;
  let next: Expense;
  if (r.ok) {
    const { receiptFailed: _f, receiptPrep: _p, ...rest } = x;
    next = { ...rest, receiptUri: r.uri };
  } else {
    const receiptPrep = [...(x.receiptPrep ?? []), { at, way: r.way, why: r.why }];
    next = { ...x, receiptPrep, receiptFailed: prepStateAfter(receiptPrep, now) };
  }
  const expenses = (db.expenses ?? []).map((e) => (e.id === x.id ? next : e));
  return { db: { ...db, expenses }, ...(r.ok ? { op: { k: "file.send", id: x.receiptFileId, expenseId: x.id, uri: r.uri } as Op } : {}) };
}
