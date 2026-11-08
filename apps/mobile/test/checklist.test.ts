/** unit:checklistGate, unit:checklistFor (docs/specs/08 §4, §5, §10.1; step 14 CH1b): warnings, never a lock. */
import { describe, expect, it } from "vitest";
import {
  checklistFor, checklistGate, checklistKindOf, itemDone, itemKind, itemRequired, itemSkipped, missedCount, photoMinimums, photoStageOf,
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
