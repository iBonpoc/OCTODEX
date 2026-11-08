/** unit:checklistGate, unit:checklistFor (docs/specs/08 §4, §5, §10.1; step 14 CH1b): warnings, never a lock. */
import { describe, expect, it } from "vitest";
import {
  canAddItem, canAttachPhoto, canEditTemplates, canEditVisitSettings, canRemoveItem, canReview, canSkip, canTick, cleanTemplate, cleanText, visitClosed,
  checklistFor, checklistGate, jobServices, snapshotPhotoMins, checklistKindOf, itemDone, itemKind, itemRequired, itemSkipped, missedCount, photoMinimums, photoStageOf,
  VISIT_SETTINGS_DEFAULT, visitMissed, visitSettings, visitSettingsOf,
} from "../src/features/checklist";
import type { ChecklistItem, ChecklistTemplate, Photo, Visit, VisitSettings } from "../src/data/types";

const visit = (over: Partial<Visit> = {}): Visit => ({
  id: "v1", jobId: "j1", techId: "t1", start: "2026-11-10T17:00:00.000Z", durationMin: 60, step: "working", scope: [], checklist: [], photos: [], amountDueCents: 0, kind: "install", ...over,
});
const item = (id: string, over: Partial<ChecklistItem> = {}): ChecklistItem => ({ id, label: id, done: false, kind: "check", required: true, ...over });
const photos = (before: number, after: number): Photo[] => [
  ...Array.from({ length: before }, (_, i) => ({ id: `b${i}`, kind: "before" as const })),
  ...Array.from({ length: after }, (_, i) => ({ id: `a${i}`, kind: "after" as const })),
];
const S: VisitSettings = VISIT_SETTINGS_DEFAULT;
const tpl = (id: string, over: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
  id, name: `T ${id}`, items: [{ id: `${id}-1`, label: `${id} one`, kind: "check", required: true }], appliesTo: { everyVisit: false, visitKinds: [], catalogItemIds: [] }, ...over,
});

describe("unit:checklistGate — an item", () => {
  it("an old item (id, label, done) reads as a required tick", () => {
    const old = { id: "x", label: "x", done: false };
    expect(itemKind(old)).toBe("check");
    expect(itemRequired(old)).toBe(true);
  });
  it("done = ticked, or a photo item with a photo; skipped is not done", () => {
    expect(itemDone(item("a", { done: true }))).toBe(true);
    expect(itemDone(item("a", { kind: "photo", photoIds: ["p1"] }))).toBe(true);
    expect(itemDone(item("a", { kind: "check", photoIds: ["p1"] }))).toBe(false);
    const skipped = item("a", { na: { reason: "unsafe", at: "2026-11-10T18:00:00Z" } });
    expect(itemDone(skipped)).toBe(false);
    expect(itemSkipped(skipped)).toBe(true);
  });
});

describe("unit:checklistGate — before work and before the signature", () => {
  it("all done, photos there: no warning", () => {
    const g = checklistGate(visit({ checklist: [item("a", { done: true }), item("b", { required: false })], photos: photos(1, 1) }), S);
    expect(g).toEqual({ warnBeforeWork: false, warnBeforeSign: false, missing: { items: [], photosBefore: 0, photosAfter: 0 } });
  });
  it("no photo «before»: a warning before work — not a lock (founder 05.11)", () => {
    const g = checklistGate(visit({ step: "on_site", photos: [] }), S);
    expect(g.warnBeforeWork).toBe(true);
    expect(g.missing.photosBefore).toBe(1);
  });
  it("a required item open and no photo «after»: a warning before the signature with what is missing", () => {
    const g = checklistGate(visit({ checklist: [item("a"), item("b", { required: false }), item("c", { done: true })], photos: photos(1, 0) }), S);
    expect(g.warnBeforeSign).toBe(true);
    expect(g.missing).toEqual({ items: ["a"], photosBefore: 0, photosAfter: 1 });
  });
  it("«Пропустить» lets the tech go on: a skipped item does not warn again", () => {
    const g = checklistGate(visit({ checklist: [item("a", { na: { at: "2026-11-10T18:00:00Z" } })], photos: photos(1, 1) }), S);
    expect(g.warnBeforeSign).toBe(false);
  });
  it("photos not required by the company: no photo warning", () => {
    const off = { ...S, photosBeforeRequired: false, photosAfterRequired: false };
    expect(checklistGate(visit({ step: "on_site" }), off)).toMatchObject({ warnBeforeWork: false, warnBeforeSign: false });
  });
  it("an inspection: no «after», one check before «Готово» (items and photos «before», §11.5 №25)", () => {
    const insp = visit({ jobId: undefined, kind: "inspection", step: "on_site" });
    expect(checklistKindOf(insp)).toBe("inspection");
    const g = checklistGate(insp, S);
    expect(g.warnBeforeWork).toBe(false);
    expect(g.missing.photosAfter).toBe(0);
    expect(g.warnBeforeSign).toBe(true);
    expect(checklistGate({ ...insp, photos: photos(1, 0) }, S).warnBeforeSign).toBe(false);
  });
  it("a template raises the minimum of photos, never lowers it", () => {
    const v = visit({ checklist: [item("a", { templateId: "t1", done: true })], photos: photos(1, 1) });
    expect(photoMinimums(v, S, [tpl("t1", { minPhotosBefore: 3 }), tpl("t2", { minPhotosAfter: 5 })])).toEqual({ before: 3, after: 1 });
    expect(checklistGate(v, { ...S, minPhotosAfter: 2 }, [tpl("t1", { minPhotosAfter: 1 })]).missing.photosAfter).toBe(1);
  });
});

describe("unit:checklistGate — what a finished visit left undone (В4)", () => {
  it("nothing while the visit is not finished", () => {
    expect(missedCount(visitMissed(visit({ step: "working", checklist: [item("a")] }), S))).toBe(0);
  });
  it("a skipped required item counts as not done; photos short count", () => {
    const m = visitMissed(visit({ step: "signed", checklist: [item("a", { na: { at: "x" } }), item("b", { done: true })], photos: photos(1, 0) }), S);
    expect(m).toEqual({ items: ["a"], photosBefore: 0, photosAfter: 1 });
    expect(missedCount(m)).toBe(2);
  });
  it("a visit started before the company turned checklists on is left alone (§11.5 №26)", () => {
    const v = visit({ step: "paid", checklist: [item("a")], photos: photos(1, 1), start: "2026-11-01T17:00:00.000Z" });
    expect(missedCount(visitMissed(v, S, [], "2026-11-08T00:00:00.000Z"))).toBe(0);
    expect(missedCount(visitMissed(v, S, [], "2026-10-01T00:00:00.000Z"))).toBe(1);
  });
  it("a closed visit (completed without payment) counts", () => {
    expect(visitMissed(visit({ step: "on_site", closed: true, checklist: [item("a")], photos: photos(1, 1) }), S).items).toEqual(["a"]);
  });
});

describe("unit:checklistGate — the company's photo rules", () => {
  it("defaults: photos before and after required, one each", () => {
    expect(visitSettings({ company: null })).toEqual({ photosBeforeRequired: true, photosAfterRequired: true, minPhotosBefore: 1, minPhotosAfter: 1 });
  });
  it("only valid values are taken (as the server's check)", () => {
    expect(visitSettingsOf({ visitSettings: { photosAfterRequired: false, minPhotosBefore: 3, minPhotosAfter: 0 } })).toEqual({ photosBeforeRequired: true, photosAfterRequired: false, minPhotosBefore: 3, minPhotosAfter: 1 });
    expect(visitSettingsOf({ visitSettings: { minPhotosBefore: 2.5 as number, photosBeforeRequired: "yes" as unknown as boolean } })).toMatchObject({ photosBeforeRequired: true, minPhotosBefore: 1 });
  });
});

describe("unit:checklistFor — the snapshot that comes into a new visit (§5)", () => {
  let n = 0;
  const newId = () => `n${++n}`;
  it("every visit → by kind → by services, no item twice, new ids, the template's name kept", () => {
    n = 0;
    const every = tpl("every", { appliesTo: { everyVisit: true, visitKinds: [], catalogItemIds: [] } });
    const work = tpl("work", { appliesTo: { everyVisit: false, visitKinds: ["work"], catalogItemIds: [] }, items: [{ id: "w1", label: "Ladder", kind: "check", required: false, hint: "two people" }] });
    const insp = tpl("insp", { appliesTo: { everyVisit: false, visitKinds: ["inspection"], catalogItemIds: [] } });
    // a service template that is also «every visit»: taken once
    const svc = tpl("svc", { appliesTo: { everyVisit: false, visitKinds: [], catalogItemIds: ["cat-9"] }, items: [{ id: "s1", label: "Photo of the old", kind: "photo", required: true }] });
    const gone = tpl("gone", { appliesTo: { everyVisit: true, visitKinds: [], catalogItemIds: [] }, archivedAt: "2026-11-01T00:00:00Z" });
    const out = checklistFor({ kind: "work", catalogItemIds: ["cat-9"] }, [svc, every, work, insp, gone, { ...every }], newId);
    expect(out.map((i) => [i.id, i.label, i.templateName])).toEqual([
      ["n1", "every one", "T every"],
      ["n2", "Ladder", "T work"],
      ["n3", "Photo of the old", "T svc"],
    ]);
    expect(out[1]).toMatchObject({ kind: "check", required: false, hint: "two people", done: false, templateId: "work", position: 1 });
    expect(out[2]).toMatchObject({ kind: "photo", required: true });
  });
  it("an inspection takes its own templates, not those of work", () => {
    n = 0;
    const insp = tpl("insp", { appliesTo: { everyVisit: false, visitKinds: ["inspection"], catalogItemIds: [] } });
    const work = tpl("work", { appliesTo: { everyVisit: false, visitKinds: ["work"], catalogItemIds: [] } });
    expect(checklistFor({ kind: "inspection" }, [insp, work], newId).map((i) => i.templateId)).toEqual(["insp"]);
  });
  it("no templates: no items", () => {
    expect(checklistFor({ kind: "work" }, [], newId)).toEqual([]);
  });
});

describe("unit:checklistGate — the stage of an item's photo (§11.5 №27)", () => {
  it("before work — «before», from work on — «after»", () => {
    expect(photoStageOf({ step: "on_site" })).toBe("before");
    expect(photoStageOf({ step: "working" })).toBe("after");
    expect(photoStageOf({ step: "signed" })).toBe("after");
  });
});

describe("unit:checklistGate — a photo item is done by a LIVE photo of the visit", () => {
  it("a removed photo takes the item back to «not done»", () => {
    const it = item("p", { kind: "photo", photoIds: ["ph1"], done: true });
    expect(itemDone(it, [{ id: "ph1", kind: "after" }])).toBe(true);
    expect(itemDone(it, [])).toBe(false);
    const v = visit({ step: "signed", checklist: [it], photos: photos(1, 1) });
    expect(visitMissed(v, S).items).toEqual(["p"]);
  });
});

describe("unit:checklistRights — who may do what (the server checks the same, §8, §11.6)", () => {
  const open = visit({ step: "working" });
  const signed = visit({ step: "signed", signature: "M0 0" });
  const done = visit({ step: "on_site", closed: true });
  it("a closed visit: signed, paid, done or closed without payment", () => {
    expect([open, signed, done, visit({ step: "done" })].map(visitClosed)).toEqual([false, true, true, true]);
  });
  it("a tick: the tech ticks always, unticks only before the close; sales never", () => {
    expect([canTick("tech", open, false), canTick("tech", signed, true), canTick("tech", signed, false), canTick("tech", done, false)]).toEqual([true, true, false, false]);
    expect([canTick("dispatcher", signed, false), canTick("director", signed, false), canTick("sales", open, true)]).toEqual([true, true, false]);
  });
  it("skip and add: not by a tech on a closed visit; a tech adds only optional ones", () => {
    expect([canSkip("tech", open), canSkip("tech", signed), canSkip("sales", open), canSkip("dispatcher", signed)]).toEqual([true, false, false, true]);
    expect([canAddItem("tech", open, false), canAddItem("tech", open, true), canAddItem("tech", signed, false), canAddItem("dispatcher", open, true), canAddItem("sales", open, false)])
      .toEqual([true, false, false, true, false]);
    expect([canAttachPhoto("tech"), canAttachPhoto("sales")]).toEqual([true, false]);
  });
  it("remove: a required — the director; an optional — the office; a tech — his own optional before the close", () => {
    const req = item("r");
    const mine = item("m", { required: false, addedBy: "t1" });
    const theirs = item("o", { required: false, addedBy: "x" });
    expect([canRemoveItem("director", "d", open, req), canRemoveItem("dispatcher", "o", open, req), canRemoveItem("dispatcher", "o", open, theirs)]).toEqual([true, false, true]);
    expect([canRemoveItem("tech", "t1", open, mine), canRemoveItem("tech", "t1", open, theirs), canRemoveItem("tech", "t1", signed, mine), canRemoveItem("tech", "t1", open, req)]).toEqual([true, false, false, false]);
    expect(canRemoveItem("sales", "s", open, theirs)).toBe(false);
  });
  it("«Просмотрено» and templates — the office; photo rules — the director", () => {
    expect([canReview("dispatcher"), canReview("tech"), canReview("sales")]).toEqual([true, false, false]);
    expect([canEditTemplates("dispatcher"), canEditTemplates("sales"), canEditVisitSettings("director"), canEditVisitSettings("dispatcher")]).toEqual([true, false, true, false]);
  });
});

describe("unit:checklistText — text as the server takes it", () => {
  it("a new line or a tab is a space; trimmed; cut to the column", () => {
    expect(cleanText(" wet\nroof\t ")).toBe("wet roof");
    expect(cleanText("x".repeat(301))).toHaveLength(300);
    expect(cleanText(undefined)).toBe("");
  });
  it("a template: no name — not sent; empty and repeated items left out; the name cut to 120", () => {
    const base = tpl("t1");
    expect(cleanTemplate({ ...base, name: "  " })).toBeNull();
    const t = cleanTemplate({ ...base, name: "n".repeat(130), items: [
      { id: "a", label: " A\n1 ", kind: "check", required: true, hint: " " }, { id: "a", label: "dup", kind: "check", required: true }, { id: "b", label: "  ", kind: "photo", required: false },
    ] })!;
    expect(t.name).toHaveLength(120);
    expect(t.items).toEqual([{ id: "a", label: "A 1", kind: "check", required: true }]);
  });
});

describe("unit:checklistFor — the snapshot's photo minimums and the job's services (CH2, §11.5 №24, §11.7 №7)", () => {
  it("the highest minimum of the templates the items came from; none when no template raises one", () => {
    const a = tpl("a", { minPhotosBefore: 2 });
    const b = tpl("b", { minPhotosBefore: 4, minPhotosAfter: 3 });
    const c = tpl("c", { minPhotosAfter: 9 });
    const items = [item("x", { templateId: "a" }), item("y", { templateId: "b" })];
    expect(snapshotPhotoMins(items, [a, b, c])).toEqual({ before: 4, after: 3 });
    expect(snapshotPhotoMins([item("z")], [a, b, c])).toBeUndefined();
    expect(snapshotPhotoMins([item("x", { templateId: "a" })], [a])).toEqual({ before: 2 });
  });
  it("the tech's phone (no templates) takes the visit's snapshot; it raises the company's, never lowers it", () => {
    expect(photoMinimums(visit({ photoMins: { before: 3 } }), S, [])).toEqual({ before: 3, after: 1 });
    expect(photoMinimums(visit({ photoMins: { after: 5 } }), { ...S, minPhotosAfter: 6 }, [])).toEqual({ before: 1, after: 6 });
    expect(photoMinimums(visit({ photoMins: { before: 0, after: 99 } as never }), S, [])).toEqual({ before: 1, after: 1 });
    expect(checklistGate(visit({ step: "on_site", photos: photos(2, 0), photoMins: { before: 3 } }), S).missing.photosBefore).toBe(1);
  });
  it("services: lines of the chosen option and its chosen add-ons, the job's own lines; no repeats", () => {
    const option = { lines: [{ id: "l1", catalogItemId: "cat1" }, { id: "l2", catalogItemId: "cat2", optional: true }, { id: "l3", catalogItemId: "cat3", optional: true }, { id: "l4" }] };
    expect(jobServices(option, ["l3"], [{ catalogItemId: "cat4" }, { catalogItemId: "cat1" }, {}])).toEqual(["cat1", "cat3", "cat4"]);
    expect(jobServices(undefined, [], [{ catalogItemId: "cat9" }])).toEqual(["cat9"]);
  });
});
