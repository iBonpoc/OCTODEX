/** #1558 (spec 46 §5.3а): which photos get a new round, when «preparing» becomes «unreadable», what a round does. */
import { describe, expect, it } from "vitest";
import { applyPrep, prepDue, prepStateAfter, prepTargetOf, prepTargets, PREP_DAY_MS, PREP_GAP_MS, PREP_LATE_GAP_MS, PREP_ROUNDS } from "../src/data/photoPrepare";
import type { DB, Photo, PrepTry } from "../src/data/types";

const T0 = Date.parse("2026-11-15T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const tries = (n: number, from = T0, step = PREP_GAP_MS): PrepTry[] => Array.from({ length: n }, (_, i) => ({ at: iso(from + i * step), way: "c2", why: "x" }));
const photo = (p: Partial<Photo> = {}): Photo => ({ id: "p1", kind: "before", uri: "file:///orig.heic", upload: { failed: "preparing", at: iso(T0) }, prep: tries(1), ...p });
const dbOf = (photos: Photo[], expenses: DB["expenses"] = []): DB => ({ visits: [{ id: "v1", photos }], expenses }) as unknown as DB;
const expense = { id: "x1", jobId: null, vendor: "V", category: "materials", amountCents: 1, at: iso(T0), memberId: "m", receiptFileId: "f1", receiptUri: "file:///r.heic", receiptFailed: "preparing", receiptPrep: tries(1) } as const;

describe("prepDue — not on every pass: a round decodes the whole original", () => {
  it("none yet (put back by «Повторить») — after the «Отменить» window; then every 10 minutes; after 5 rounds every 2 hours", () => {
    expect(prepDue(undefined, T0)).toBe(true);
    expect(prepDue([], T0 + 5999, iso(T0), 6000)).toBe(false);
    expect(prepDue([], T0 + 6000, iso(T0), 6000)).toBe(true);
    expect(prepDue(tries(1), T0 + PREP_GAP_MS - 1)).toBe(false);
    expect(prepDue(tries(1), T0 + PREP_GAP_MS)).toBe(true);
    const five = tries(PREP_ROUNDS);
    const last = T0 + (PREP_ROUNDS - 1) * PREP_GAP_MS;
    expect(prepDue(five, last + PREP_GAP_MS)).toBe(false);
    expect(prepDue(five, last + PREP_LATE_GAP_MS)).toBe(true);
  });
});

describe("prepStateAfter — «unreadable» only after 5 rounds and a day", () => {
  it("5 rounds within a day: still «preparing»; a day passed with 4 rounds: still «preparing»", () => {
    expect(prepStateAfter(tries(5), T0 + PREP_DAY_MS - 1)).toBe("preparing");
    expect(prepStateAfter(tries(4), T0 + PREP_DAY_MS * 2)).toBe("preparing");
  });
  it("5 rounds and a day from the first failure: «unreadable»", () => {
    expect(prepStateAfter(tries(5), T0 + PREP_DAY_MS)).toBe("unreadable");
  });
});

describe("prepTargets / prepTargetOf", () => {
  it("only «preparing» with a file here, due now; receipts too (with their files row)", () => {
    const d = dbOf(
      [photo(), photo({ id: "p2", upload: { failed: "refused", at: iso(T0) } }), photo({ id: "p3", uri: undefined }), photo({ id: "p4", upload: { failed: "unreadable", at: iso(T0) } })],
      [expense],
    );
    expect(prepTargets(d, T0 + 1)).toEqual([]);
    expect(prepTargets(d, T0 + PREP_GAP_MS).map((t) => (t.kind === "photo" ? t.id : t.expenseId))).toEqual(["p1", "x1"]);
    expect(prepTargets(d, T0 + 1, true)).toHaveLength(2);
  });
  it("«Подготовить снова» finds an «unreadable» photo or receipt; a plain one — none", () => {
    const d = dbOf([photo({ upload: { failed: "unreadable", at: iso(T0) } }), photo({ id: "p2", upload: undefined })], [{ ...expense, receiptFailed: "unreadable" }]);
    expect(prepTargetOf(d, { visitId: "v1", photoId: "p1" })?.kind).toBe("photo");
    expect(prepTargetOf(d, { visitId: "v1", photoId: "p2" })).toBeNull();
    expect(prepTargetOf(d, { expenseId: "x1" })).toMatchObject({ kind: "receipt", fileId: "f1" });
  });
});

describe("applyPrep — a round's result", () => {
  const t = { kind: "photo" as const, visitId: "v1", id: "p1", uri: "file:///orig.heic", tries: tries(1) };
  it("made: the new file replaces the original here, the mark and the log go, photo.retry with the new file", () => {
    const r = applyPrep(dbOf([photo()]), t, { ok: true, uri: "file:///new.jpg", way: "c2", small: true }, T0 + PREP_GAP_MS)!;
    expect(r.db.visits[0]!.photos[0]).toEqual({ id: "p1", kind: "before", uri: "file:///new.jpg", small: true });
    expect(r.op).toEqual({ k: "photo.retry", id: "p1", visitId: "v1", uri: "file:///new.jpg" });
  });
  it("not made: one more line in the log, no op; the 5th round a day later — «unreadable»", () => {
    const r = applyPrep(dbOf([photo()]), t, { ok: false, way: "c2", why: "oom" }, T0 + PREP_GAP_MS)!;
    expect(r.op).toBeUndefined();
    expect(r.db.visits[0]!.photos[0]!.prep).toHaveLength(2);
    expect(r.db.visits[0]!.photos[0]!.upload?.failed).toBe("preparing");
    expect(JSON.stringify(r)).not.toContain("photo.add");
    const late = applyPrep(dbOf([photo({ prep: tries(4) })]), t, { ok: false, way: "c2", why: "oom" }, T0 + PREP_DAY_MS)!;
    expect(late.db.visits[0]!.photos[0]!.upload?.failed).toBe("unreadable");
  });
  it("a photo removed meanwhile, or no longer «preparing»: left as it is", () => {
    expect(applyPrep(dbOf([]), t, { ok: true, uri: "file:///n.jpg", way: "c1" }, T0)).toBeNull();
    expect(applyPrep(dbOf([photo({ upload: undefined })]), t, { ok: true, uri: "file:///n.jpg", way: "c1" }, T0)).toBeNull();
  });
  it("a receipt made: its new file here, the mark goes, file.send for its files row", () => {
    const rt = { kind: "receipt" as const, expenseId: "x1", fileId: "f1", uri: "file:///r.heic", tries: tries(1) };
    const r = applyPrep(dbOf([], [expense]), rt, { ok: true, uri: "file:///r.jpg", way: "c1" }, T0)!;
    const x = r.db.expenses![0]!;
    expect(x.receiptUri).toBe("file:///r.jpg");
    expect(x.receiptFailed).toBeUndefined();
    expect(x.receiptPrep).toBeUndefined();
    expect(r.op).toEqual({ k: "file.send", id: "f1", expenseId: "x1", uri: "file:///r.jpg" });
  });
});
