/** #1431: photos the cloud did not take — one «Требует внимания» reason per visit, bad, opens the visit, on the client's card. */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { attentionHref, buildAttention, PHOTO_FAILED_SCORE, REJECTED_SCORE } from "../src/features/attention";
import { attentionPeople } from "../src/features/attentionPeople";
import { visitContext } from "../src/data/selectors";
import type { DB } from "../src/data/types";

const at = "2026-11-14T10:00:00Z";
function withFailed(n: number, visitIdx = 0): { db: DB; visitId: string } {
  const db = makeSeed();
  const v = db.visits[visitIdx]!;
  v.photos = [
    ...Array.from({ length: n }, (_, i) => ({ id: `pf${visitIdx}-${i}`, kind: "before" as const, uri: `file:///f${i}.jpg`, upload: { failed: "tooBig" as const, at } })),
    { id: `ok${visitIdx}`, kind: "after" as const, uri: "file:///ok.jpg" },
  ];
  return { db, visitId: v.id };
}
const photoItems = (db: DB) => buildAttention(db, "director").filter((x) => x.kind === "photoFailed");

describe("attention — photos the cloud did not take (#1431)", () => {
  it("one reason per visit with the count; bad; opens the visit", () => {
    const { db, visitId } = withFailed(2);
    const items = photoItems(db);
    expect(items).toHaveLength(1);
    const it0 = items[0]!;
    expect(it0).toMatchObject({ id: `photo-${visitId}`, refId: visitId, label: "photoUp.att", chip: "photoUp.chip", status: "bad", score: PHOTO_FAILED_SCORE });
    expect(it0.params.n).toBe(2);
    expect(attentionHref(it0)).toBe(`/visit/${visitId}`);
    // the client's name, as other visit reasons say it
    const v = db.visits.find((x) => x.id === visitId)!;
    expect(it0.name).toBe(visitContext(db, v).customer?.name ?? "");
  });
  it("no refused photo — no reason; two visits — two reasons", () => {
    expect(photoItems(makeSeed())).toEqual([]);
    const { db } = withFailed(1, 0);
    const v1 = db.visits[1]!;
    v1.photos = [{ id: "x", kind: "after", upload: { failed: "refused", at } }];
    expect(photoItems(db).map((x) => x.refId).sort()).toEqual([db.visits[0]!.id, v1.id].sort());
  });
  it("above every reason but a refused money change and a lead waiting for a reply; on the visit's client card", () => {
    expect(PHOTO_FAILED_SCORE).toBeLessThan(REJECTED_SCORE);
    const { db, visitId } = withFailed(1);
    const all = buildAttention(db, "director");
    // a new lead waiting for a reply is 1000 + minutes: it stays above
    const others = all.filter((x) => x.kind !== "photoFailed" && x.kind !== "rejected" && x.kind !== "lead");
    expect(others.every((x) => x.score < PHOTO_FAILED_SCORE)).toBe(true);
    const c = visitContext(db, db.visits.find((x) => x.id === visitId)!).customer;
    const card = attentionPeople(db, all).find((p) => p.items.some((x) => x.kind === "photoFailed"))!;
    expect(card.customerId).toBe(c?.id);
  });
  it("a lead without a client stays its own card (CLAUDE.md): a refused photo of its inspection is on the lead's card", () => {
    const db = makeSeed();
    const lead = db.leads.find((l) => !l.customerId)!;
    const v = db.visits[0]!;
    Object.assign(v, { jobId: undefined, propertyId: undefined, leadId: lead.id, kind: "inspection" });
    v.photos = [{ id: "pl", kind: "before", uri: "file:///l.jpg", upload: { failed: "refused", at } }];
    const card = attentionPeople(db, buildAttention(db, "director")).find((p) => p.items.some((x) => x.kind === "photoFailed"))!;
    expect(card.key).toBe(`lead:${lead.id}`);
    expect(card.customerId).toBeUndefined();
  });
  it("a tech sees it too (the photos are theirs)", () => {
    const { db } = withFailed(1);
    expect(buildAttention(db, "tech").some((x) => x.kind === "photoFailed")).toBe(true);
  });
});
