/** CH2b (docs/specs/08 §8, В4): «Не сделано» — one warn card per finished visit until «Просмотрено» or done. */
import { describe, expect, it } from "vitest";
import { attentionHref, buildAttention } from "../src/features/attention";
import { makeSeed } from "../src/data/seed";
import type { DB, Role, Visit } from "../src/data/types";

const START = "2026-11-05T17:00:00.000Z";
function withVisit(over: Partial<Visit>, company: Partial<NonNullable<DB["company"]>> = {}): DB {
  const db = makeSeed();
  const v0 = db.visits.find((v) => v.jobId)!;
  const v: Visit = {
    ...v0, id: "vm", start: START, step: "signed", photos: [{ id: "b", kind: "before" }, { id: "a", kind: "after" }],
    checklist: [{ id: "r1", label: "Walk through", done: false, kind: "check", required: true }], ...over,
  };
  return { ...db, visits: [...db.visits.filter((x) => x.id !== v0.id), v], company: db.company ? { ...db.company, checklistSince: "2026-11-01T00:00:00.000Z", ...company } : db.company };
}
const missed = (db: DB, role: Role = "director") => buildAttention(db, role).filter((i) => i.kind === "visitMissed");

describe("unit:attention — «Не сделано» of a checklist (docs/specs/08 §8)", () => {
  it("a finished visit with a required item open: one warn card that opens the visit", () => {
    const [it] = missed(withVisit({}));
    expect(it).toMatchObject({ refId: "vm", status: "warn", chip: "chk2b.att.chip", label: "chk2b.att.missed" });
    expect(it!.params).toMatchObject({ n: 1, date: "Nov 5" });
    expect(attentionHref(it!)).toBe("/visit/vm");
  });
  it("skipped items and short photos count; one card per visit", () => {
    const db = withVisit({ photos: [], checklist: [{ id: "r1", label: "x", done: false, kind: "check", required: true, na: { reason: "unsafe", at: START } }] });
    const list = missed(db);
    expect(list).toHaveLength(1);
    expect(list[0]!.params.n).toBe(3);
  });
  it("nothing when all is done, the item is optional, the visit is not finished, or before checklistSince", () => {
    expect(missed(withVisit({ checklist: [{ id: "r1", label: "x", done: true, kind: "check", required: true }] }))).toEqual([]);
    expect(missed(withVisit({ checklist: [{ id: "o", label: "x", done: false, kind: "check", required: false }] }))).toEqual([]);
    expect(missed(withVisit({ step: "working" }))).toEqual([]);
    expect(missed(withVisit({}, { checklistSince: "2026-11-06T00:00:00.000Z" }))).toEqual([]);
  });
  it("«Просмотрено» takes it away", () => {
    expect(missed(withVisit({ checklistReviewedAt: "2026-11-06T00:00:00.000Z" }))).toEqual([]);
  });
  it("an old server (no checklist migration, no checklistSince): no cards — not a flood of old visits", () => {
    const db = withVisit({}, { checklistSince: undefined });
    expect(missed({ ...db, checklistLegacy: true })).toEqual([]);
  });
  it("the office only: not a tech, not sales", () => {
    expect(missed(withVisit({}), "dispatcher")).toHaveLength(1);
    expect(missed(withVisit({}), "tech")).toEqual([]);
    expect(missed(withVisit({}), "sales")).toEqual([]);
  });
});
