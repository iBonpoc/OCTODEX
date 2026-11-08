/**
 * Step 14 CH1b (docs/specs/08 §11.3): the checklist ops reach the server as UPDATEs of one visit's rows (a tech's tick
 * must never be an upsert: the insert policy would check it); the time of the phone only at the change; templates whole.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { table: string; how: "update" | "upsert"; row: Record<string, unknown>; eq: [string, unknown][]; in?: [string, unknown[]]; opts?: unknown };
const calls: Call[] = [];
/** what the server has in photo_ids of the item read before a photo is added */
const server = { photoIds: null as string[] | null };
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (table: string) => {
      const done = (how: Call["how"], row: Record<string, unknown>, opts?: unknown) => {
        const entry: Call = { table, how, row, eq: [], opts };
        calls.push(entry);
        const q = {
          eq: (c: string, v: unknown) => (entry.eq.push([c, v]), q),
          in: (c: string, v: unknown[]) => ((entry.in = [c, v]), q),
          then: (ok: (r: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok),
        };
        return q;
      };
      return {
        select: () => {
          const q = { eq: () => q, maybeSingle: () => Promise.resolve({ data: server.photoIds ? { photo_ids: server.photoIds } : null, error: null }) };
          return q;
        },
        update: (row: Record<string, unknown>) => done("update", row),
        upsert: (row: Record<string, unknown>, opts?: unknown) => done("upsert", row, opts),
      };
    },
  },
}));
import { applyOp, chkItemPatch } from "../src/cloud/ops";
import { createdBy } from "../src/data/outboxDeps";

beforeEach(() => {
  calls.splice(0);
  server.photoIds = null;
});
const AT = "2026-11-08T18:00:00.000Z";

describe("ops: chk.item.set — one visit's rows, an update", () => {
  it("a tick: done and the phone's time, nothing else", async () => {
    await applyOp({ k: "chk.item.set", visitId: "v1", itemIds: ["i1"], done: true, at: AT }, "co", "u");
    expect(calls).toEqual([{ table: "visit_checklist_items", how: "update", row: { done: true, done_at: AT }, eq: [["visit_id", "v1"]], in: ["id", ["i1"]], opts: undefined }]);
  });
  it("an untick sends no time (the server clears it)", () => {
    expect(chkItemPatch({ k: "chk.item.set", visitId: "v1", itemIds: ["i1"], done: false, at: AT })).toEqual({ done: false });
  });
  it("«Пропустить» for several items: skipped, reason, trimmed note, the time", async () => {
    await applyOp({ k: "chk.item.set", visitId: "v1", itemIds: ["i1", "i2"], done: false, skipped: true, naReason: "unsafe", naText: "  wet roof ", at: AT }, "co", "u");
    expect(calls[0]!.row).toEqual({ done: false, skipped: true, na_at: AT, na_reason: "unsafe", na_text: "wet roof" });
    expect(calls[0]!.in).toEqual(["id", ["i1", "i2"]]);
  });
  it("a photo on an item: added to what the server has (another person's photo stays), a retry adds nothing twice", async () => {
    server.photoIds = ["p-other"];
    await applyOp({ k: "chk.item.set", visitId: "v1", itemIds: ["i1"], done: true, addPhotoId: "p1", at: AT }, "co", "u");
    expect(calls[0]!.row).toEqual({ done: true, done_at: AT, photo_ids: ["p-other", "p1"] });
    server.photoIds = ["p-other", "p1"];
    await applyOp({ k: "chk.item.set", visitId: "v1", itemIds: ["i1"], done: true, addPhotoId: "p1", at: AT }, "co", "u");
    expect(calls[1]!.row.photo_ids).toEqual(["p-other", "p1"]);
  });
  it("a note with a new line is sent as the server takes it (no control characters)", () => {
    expect(chkItemPatch({ k: "chk.item.set", visitId: "v1", itemIds: ["i1"], skipped: true, naText: "wet\nroof", at: AT }).na_text).toBe("wet roof");
  });
  it("no items: nothing sent", async () => {
    await applyOp({ k: "chk.item.set", visitId: "v1", itemIds: [], done: true, at: AT }, "co", "u");
    expect(calls).toEqual([]);
  });
});

describe("ops: the other checklist ops", () => {
  it("chk.item.add: an insert by the phone's id (a retry adds nothing)", async () => {
    await applyOp({ k: "chk.item.add", item: { id: "i9", visitId: "v1", position: 3, label: "Dog in the yard", kind: "check", required: false } }, "co", "u");
    expect(calls[0]).toMatchObject({
      table: "visit_checklist_items", how: "upsert", opts: { onConflict: "id", ignoreDuplicates: true },
      row: { id: "i9", company_id: "co", visit_id: "v1", position: 3, label: "Dog in the yard", kind: "check", required: false, hint: null, template_id: null, template_name: null },
    });
  });
  it("chk.item.remove: soft (deleted_at), only on its visit", async () => {
    await applyOp({ k: "chk.item.remove", id: "i9", visitId: "v1" }, "co", "u");
    expect(calls[0]).toMatchObject({ table: "visit_checklist_items", how: "update", eq: [["id", "i9"], ["visit_id", "v1"]] });
    expect(typeof calls[0]!.row.deleted_at).toBe("string");
  });
  it("chk.visit.review: «Просмотрено» and «Отменить» (the server writes who)", async () => {
    await applyOp({ k: "chk.visit.review", visitId: "v1", at: AT }, "co", "u");
    await applyOp({ k: "chk.visit.review", visitId: "v1", at: null }, "co", "u");
    expect(calls.map((c) => [c.table, c.row])).toEqual([["visits", { checklist_reviewed_at: AT }], ["visits", { checklist_reviewed_at: null }]]);
  });
  it("chk.template.save: the whole template, trimmed", async () => {
    await applyOp({
      k: "chk.template.save",
      template: { id: "t1", name: " Every visit ", items: [{ id: "a", label: " Scope ", kind: "check", required: true, hint: " " }], appliesTo: { everyVisit: true, visitKinds: ["work"], catalogItemIds: [] }, minPhotosBefore: 2 },
    }, "co", "u");
    expect(calls[0]).toEqual({
      table: "checklist_templates", how: "upsert", eq: [], opts: { onConflict: "id" },
      row: {
        id: "t1", company_id: "co", name: "Every visit", items: [{ id: "a", label: "Scope", kind: "check", required: true }],
        applies_every_visit: true, applies_visit_kinds: ["work"], applies_catalog_item_ids: [], min_photos_before: 2, min_photos_after: null, module_key: null, archived_at: null,
      },
    });
  });
  it("company.visitSettings: only that column of the company", async () => {
    const settings = { photosBeforeRequired: true, photosAfterRequired: false, minPhotosBefore: 2, minPhotosAfter: 1 };
    await applyOp({ k: "company.visitSettings", settings }, "co", "u");
    expect(calls[0]).toMatchObject({ table: "companies", how: "update", row: { visit_settings: settings }, eq: [["id", "co"]] });
  });
  it("the old whole-list op still goes (old queues)", async () => {
    await applyOp({ k: "visit.checklist", visitId: "v1", checklist: [{ id: "i1", label: "x", done: true }] }, "co", "u");
    expect(calls[0]).toMatchObject({ table: "visits", how: "update", row: { checklist: [{ id: "i1", label: "x", done: true }] } });
  });
});

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [I9, T1, I1, V1] = [u(9), u(1), u(2), u(3)];
describe("unit:outboxDeps — what the checklist ops make", () => {
  it("a new item and a template make their row; a tick, a removal, «Просмотрено» make nothing", () => {
    expect([...createdBy({ k: "chk.item.add", item: { id: I9, visitId: V1, position: 0, label: "x", kind: "check", required: false } })]).toEqual([I9]);
    expect([...createdBy({ k: "chk.template.save", template: { id: T1, name: "x", items: [], appliesTo: { everyVisit: true, visitKinds: [], catalogItemIds: [] } } })]).toEqual([T1]);
    expect([...createdBy({ k: "chk.item.set", visitId: V1, itemIds: [I1], done: true, at: AT })]).toEqual([]);
    expect([...createdBy({ k: "chk.item.remove", id: I1, visitId: V1 })]).toEqual([]);
    expect([...createdBy({ k: "chk.visit.review", visitId: V1, at: AT })]).toEqual([]);
  });
});
