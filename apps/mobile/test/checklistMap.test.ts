/** unit:checklistMap (step 14 CH1b, docs/specs/08 §11.3): the rows of the checklist tables → the app; rule 16 fallback. */
import { describe, expect, it } from "vitest";
import { checklistOf, isMissingTable, itemFromDb, itemsByVisit, templateFromDb, visitSettingsFromDb } from "../src/cloud/checklistMap";

const row = (over: Record<string, unknown> = {}) => ({
  id: "i1", visit_id: "v1", position: 0, label: "Confirm scope", kind: "check", required: true, hint: null, template_id: null, template_name: null,
  done: false, done_by: null, done_at: null, skipped: false, na_reason: null, na_text: null, na_by: null, na_at: null, photo_ids: [], created_by: "u1",
  created_at: "2026-11-08T10:00:00Z", ...over,
});

describe("unit:checklistMap — an item row", () => {
  it("a plain tick", () => {
    expect(itemFromDb(row())).toEqual({ id: "i1", label: "Confirm scope", done: false, kind: "check", required: true, addedBy: "u1", position: 0 });
  });
  it("a ticked photo item from a template", () => {
    const it = itemFromDb(row({ kind: "photo", required: false, template_id: "t1", template_name: "Every visit", hint: "wide", done: true, done_by: "u3", done_at: "2026-11-08T11:00:00Z", photo_ids: ["p1"] }));
    expect(it).toMatchObject({ kind: "photo", required: false, templateId: "t1", templateName: "Every visit", hint: "wide", done: true, doneBy: "u3", doneAt: "2026-11-08T11:00:00Z", photoIds: ["p1"] });
  });
  it("a skip with a reason; an unknown reason is dropped, the skip stays", () => {
    expect(itemFromDb(row({ skipped: true, na_reason: "client_refused", na_text: "no access", na_by: "u3", na_at: "2026-11-08T12:00:00Z" })).na)
      .toEqual({ reason: "client_refused", text: "no access", by: "u3", at: "2026-11-08T12:00:00Z" });
    expect(itemFromDb(row({ skipped: true, na_reason: "weird", na_at: "2026-11-08T12:00:00Z" })).na).toEqual({ at: "2026-11-08T12:00:00Z" });
  });
});

describe("unit:checklistMap — the items of each visit", () => {
  it("in the visit's order (position, then when added); removed rows left out", () => {
    const m = itemsByVisit([
      row({ id: "b", position: 1 }), row({ id: "a", position: 1, created_at: "2026-11-08T09:00:00Z" }), row({ id: "c", position: 0 }),
      row({ id: "gone", position: 0, deleted_at: "2026-11-08T13:00:00Z" }), row({ id: "x", visit_id: "v2" }),
    ]);
    expect(m.get("v1")!.map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(m.get("v2")!.map((i) => i.id)).toEqual(["x"]);
  });
  it("rule 16: with the table a visit's rows (none → none); without it the old array", () => {
    const m = itemsByVisit([row()]);
    expect(checklistOf("v1", [{ id: "old", label: "old", done: true }], m).map((i) => i.id)).toEqual(["i1"]);
    expect(checklistOf("v9", [{ id: "old", label: "old", done: true }], m)).toEqual([]);
    expect(checklistOf("v1", [{ id: "old", label: "old", done: true }], null)).toEqual([{ id: "old", label: "old", done: true }]);
    expect(checklistOf("v1", null, null)).toEqual([]);
  });
});

describe("unit:checklistMap — a template and the photo settings", () => {
  it("a template row", () => {
    expect(templateFromDb({
      id: "t1", name: "Every visit", items: [{ id: "a", label: "Scope", kind: "check", required: true }, { id: "b", label: "Area", kind: "photo", required: false, hint: "wide" }],
      applies_every_visit: true, applies_visit_kinds: ["work", "estimate"], applies_catalog_item_ids: ["c1"], min_photos_before: 2, min_photos_after: null, module_key: "gutters", archived_at: null,
    })).toEqual({
      id: "t1", name: "Every visit",
      items: [{ id: "a", label: "Scope", kind: "check", required: true }, { id: "b", label: "Area", kind: "photo", required: false, hint: "wide" }],
      appliesTo: { everyVisit: true, visitKinds: ["work"], catalogItemIds: ["c1"] }, minPhotosBefore: 2, module: "gutters",
    });
  });
  it("visit_settings: an object as stored, anything else none", () => {
    expect(visitSettingsFromDb({ minPhotosBefore: 2 })).toEqual({ minPhotosBefore: 2 });
    expect(visitSettingsFromDb(null)).toBeUndefined();
    expect(visitSettingsFromDb([1])).toBeUndefined();
  });
});

describe("unit:checklistMap — the old array only when the server has no table (rule 16)", () => {
  it("no table: PGRST205 / 42P01 / 404; a timeout or a 500 is not that", () => {
    expect([{ code: "PGRST205" }, { code: "42P01" }, { status: 404 }].map(isMissingTable)).toEqual([true, true, true]);
    expect([{ status: 500 }, { code: "57014" }, new Error("network"), null].map(isMissingTable)).toEqual([false, false, false, false]);
  });
});

describe("unit:checklistMap — the visit's photo minimums (migration 20261108150000)", () => {
  it("1..20 each; none, out of range or a server without the columns → the company's", async () => {
    const { photoMinsFromDb } = await import("../src/cloud/checklistMap");
    expect(photoMinsFromDb(2, null)).toEqual({ before: 2 });
    expect(photoMinsFromDb(null, 3)).toEqual({ after: 3 });
    expect(photoMinsFromDb(0, 21)).toBeUndefined();
    expect(photoMinsFromDb(undefined, undefined)).toBeUndefined();
  });
});
