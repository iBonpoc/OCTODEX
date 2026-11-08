/**
 * Step 14 CH1b (docs/specs/08 §10.1, §11.3): the checklist mutations of the store. Locally at once (offline); in the
 * cloud a tick is one row's update (chk.item.set), never the whole list; a photo item's photo goes out FIRST — the
 * server takes only a photo of the visit on an item (migration 20261108140000), so the item's op waits behind it.
 * React's hooks: test/support/miniReact.ts; the server (repo, ops), the sign-in and AsyncStorage are stand-ins.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", () => import("./support/miniReact"));
vi.mock("react/jsx-runtime", () => import("./support/miniReact"));
vi.mock("react/jsx-dev-runtime", () => import("./support/miniReact"));
vi.mock("expo-crypto", () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
    getAllKeys: async () => [...storage.keys()],
    multiRemove: async (ks: string[]) => ks.forEach((k) => storage.delete(k)),
    removeItem: async (k: string) => void storage.delete(k),
  },
}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
const auth = { ready: true, session: null as object | null, company: null as object | null, userId: null as string | null };
vi.mock("@/cloud/auth", () => ({ useAuth: () => auth }));
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((a) => (resolve = a));
  return { promise, resolve };
};
const server = { loads: [] as Deferred<unknown>[], sends: [] as { op: { k: string } & Record<string, unknown>; d: Deferred<void> }[] };
vi.mock("@/cloud/repo", async (orig) => ({
  ...(await orig<object>()),
  loadCompanyDB: () => {
    const d = deferred<unknown>();
    server.loads.push(d);
    return d.promise;
  },
}));
vi.mock("@/cloud/ops", async (orig) => ({
  ...(await orig<object>()),
  applyOp: (op: { k: string }) => {
    const d = deferred<void>();
    server.sends.push({ op: op as { k: string } & Record<string, unknown>, d });
    return d.promise;
  },
  renewSession: async () => {},
  sendVisitPoint: () => new Promise(() => {}),
}));
vi.mock("@/cloud/outboxTiming", () => ({ SEND_AFTER_MS: 0, readyToSend: () => true }));
vi.mock("@/data/appActive", () => ({ onAppActive: () => () => {}, onAppLeave: () => () => {} }));
vi.mock("@/data/outboxRetry", async (orig) => ({ ...(await orig<object>()), backoffMs: () => 0 }));

import { render, settle, type Root } from "./support/miniReact";
import { StoreProvider } from "../src/data/store";
import { makeSeed } from "../src/data/seed";
import type { DB, Visit } from "../src/data/types";

type Value = {
  db: DB;
  mode: string;
  scheduleJob: (jobId: string, s: { start: string; durationMin: number; techId: string | null }) => () => void;
  bookLead: (id: string, at: { start: string; durationMin: number; techId: string | null }) => () => void;
  addInspection: (propertyId: string, at: { start: string; durationMin: number; techId: string | null }) => { id: string; undo: () => void };
  checkItem: (visitId: string, itemId: string, done: boolean) => () => void;
  toggleCheck: (visitId: string, itemId: string) => () => void;
  skipItems: (visitId: string, itemIds: string[], reason?: string, text?: string) => () => void;
  attachItemPhoto: (visitId: string, itemId: string, uri?: string) => () => void;
  addCheckItem: (visitId: string, label: string) => () => void;
  addVisitItem: (visitId: string, label: string, required: boolean) => () => void;
  removeVisitItem: (visitId: string, itemId: string) => () => void;
  reviewVisitMissed: (visitId: string) => () => void;
  editVisitItem: (visitId: string, itemId: string, patch: { label?: string; required?: boolean }) => () => void;
  moveVisitItem: (visitId: string, itemId: string, dir: -1 | 1) => () => void;
  addVisitTemplate: (visitId: string, templateId: string) => () => void;
  setVisitSettings: (patch: object) => () => void;
  saveChecklistTemplate: (t: object) => () => void;
  removePhoto: (visitId: string, photoId: string) => () => void;
  setRole: (r: string) => void;
  queue: unknown[];
};
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
const tick = async () => {
  await wait(1700); // the outbox tick
  await settle();
};
let root: Root<P> | null = null;

const VISIT = "00000000-0000-4000-8000-0000000000f1";
const ITEM = "00000000-0000-4000-8000-0000000000a1";
const PHOTO_ITEM = "00000000-0000-4000-8000-0000000000a2";
function company(): DB {
  const db = makeSeed();
  const v0 = db.visits[0]!;
  const v: Visit = {
    ...v0, id: VISIT, step: "working", photos: [],
    checklist: [
      { id: ITEM, label: "Confirm scope", done: false, kind: "check", required: true },
      { id: PHOTO_ITEM, label: "Photo of the area", done: false, kind: "photo", required: true },
    ],
  };
  return { ...db, me: "u1", visits: [v, ...db.visits.slice(1)] };
}
const visitOf = (r: Root<P>) => valueOf(r).db.visits.find((v) => v.id === VISIT)!;

async function signedIn(over: Partial<DB> = {}, role = "owner"): Promise<Root<P>> {
  Object.assign(auth, { session: {}, userId: "u1", company: { companyId: "c1", role, companyName: "Co" } });
  const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
  await settle();
  server.loads.splice(0).forEach((d) => d.resolve({ ...company(), ...over }));
  await settle();
  expect(valueOf(r).mode).toBe("cloud");
  return r;
}

beforeEach(() => {
  storage.clear();
  server.loads.length = 0;
  server.sends.length = 0;
  Object.assign(auth, { session: null, userId: null, company: null });
});
afterEach(() => {
  root?.unmount();
  root = null;
});

describe("unit:checklistStore — a tick", () => {
  it("at once on the phone; to the server one row's update, not the whole list", async () => {
    const r = await signedIn();
    valueOf(r).checkItem(VISIT, ITEM, true);
    await settle();
    expect(visitOf(r).checklist[0]).toMatchObject({ done: true, doneBy: "u1" });
    await tick();
    expect(server.sends.map((s) => s.op.k)).toEqual(["chk.item.set"]);
    expect(server.sends[0]!.op).toMatchObject({ visitId: VISIT, itemIds: [ITEM], done: true });
  });
  it("«Отменить» takes the tick back before it is sent", async () => {
    const r = await signedIn();
    const undo = valueOf(r).toggleCheck(VISIT, ITEM);
    await settle();
    expect(visitOf(r).checklist[0]!.done).toBe(true);
    undo();
    await settle();
    expect(visitOf(r).checklist[0]!.done).toBe(false);
    await tick();
    expect(server.sends).toEqual([]);
  });
});

describe("unit:checklistStore — a photo item (the order of the queue)", () => {
  it("photo.add goes first; the item's op waits for it and carries the photo's id", { timeout: 15_000 }, async () => {
    const r = await signedIn();
    valueOf(r).attachItemPhoto(VISIT, PHOTO_ITEM, "file:///p.jpg");
    await settle();
    const v = visitOf(r);
    const photo = v.photos.at(-1)!;
    expect(photo.kind).toBe("after"); // the visit is at work: «after» (§11.5 №27)
    expect(v.checklist[1]).toMatchObject({ done: true, photoIds: [photo.id] });
    await tick();
    // only the photo is out; the item's op waits while the photo has not reached the server
    expect(server.sends.map((s) => s.op.k)).toEqual(["photo.add"]);
    await tick();
    expect(server.sends.map((s) => s.op.k)).toEqual(["photo.add"]);
    server.sends[0]!.d.resolve();
    await settle();
    await tick();
    expect(server.sends.map((s) => s.op.k)).toEqual(["photo.add", "chk.item.set"]);
    expect(server.sends[1]!.op).toMatchObject({ itemIds: [PHOTO_ITEM], done: true, addPhotoId: photo.id });
  });
  it("«Отменить» takes off both the photo and the item's tick", async () => {
    const r = await signedIn();
    const undo = valueOf(r).attachItemPhoto(VISIT, PHOTO_ITEM);
    await settle();
    undo();
    await settle();
    expect(visitOf(r).photos).toEqual([]);
    expect(visitOf(r).checklist[1]).toMatchObject({ done: false });
    expect(visitOf(r).checklist[1]!.photoIds).toBeUndefined();
  });
});

describe("unit:checklistStore — skip, add, remove, «Просмотрено», photo rules", () => {
  it("«Пропустить» marks the items skipped (not done) in one op", async () => {
    const r = await signedIn();
    valueOf(r).skipItems(VISIT, [ITEM, PHOTO_ITEM], "unsafe", " wet ");
    await settle();
    expect(visitOf(r).checklist.map((c) => [c.done, c.na?.reason, c.na?.text])).toEqual([[false, "unsafe", "wet"], [false, "unsafe", "wet"]]);
    await tick();
    expect(server.sends[0]!.op).toMatchObject({ k: "chk.item.set", itemIds: [ITEM, PHOTO_ITEM], skipped: true, naReason: "unsafe", naText: "wet" });
  });
  it("a tech's own item on site: optional, his, an insert of one row", async () => {
    const r = await signedIn();
    valueOf(r).addCheckItem(VISIT, "  Dog in the yard ");
    await settle();
    const added = visitOf(r).checklist.at(-1)!;
    expect(added).toMatchObject({ label: "Dog in the yard", required: false, kind: "check", addedBy: "u1", position: 2 });
    await tick();
    expect(server.sends[0]!.op).toMatchObject({ k: "chk.item.add", item: { id: added.id, visitId: VISIT, required: false, position: 2 } });
  });
  it("a removal is one row's (soft); «Просмотрено» is the visit's", { timeout: 15_000 }, async () => {
    const r = await signedIn();
    valueOf(r).removeVisitItem(VISIT, ITEM);
    valueOf(r).reviewVisitMissed(VISIT);
    await settle();
    expect(visitOf(r).checklist.map((c) => c.id)).toEqual([PHOTO_ITEM]);
    expect(visitOf(r).checklistReviewedBy).toBe("u1");
    await tick();
    server.sends[0]?.d.resolve();
    await settle();
    await tick();
    expect(server.sends.map((s) => s.op.k)).toEqual(["chk.item.remove", "chk.visit.review"]);
  });
  it("photo rules: the whole settings, with the defaults filled", async () => {
    const r = await signedIn();
    valueOf(r).setVisitSettings({ minPhotosAfter: 3 });
    await settle();
    expect(valueOf(r).db.company?.visitSettings).toEqual({ photosBeforeRequired: true, photosAfterRequired: true, minPhotosBefore: 1, minPhotosAfter: 3 });
    await tick();
    expect(server.sends[0]!.op).toMatchObject({ k: "company.visitSettings", settings: { minPhotosAfter: 3, photosBeforeRequired: true } });
  });
});

describe("unit:checklistStore — transitions of an item", () => {
  it("a tick takes a skip off; a skip takes a tick off", async () => {
    const r = await signedIn();
    valueOf(r).checkItem(VISIT, ITEM, true);
    valueOf(r).skipItems(VISIT, [ITEM]);
    await settle();
    expect(visitOf(r).checklist[0]).toMatchObject({ done: false });
    expect(visitOf(r).checklist[0]!.na).toBeDefined();
    valueOf(r).checkItem(VISIT, ITEM, true);
    await settle();
    expect(visitOf(r).checklist[0]).toMatchObject({ done: true });
    expect(visitOf(r).checklist[0]!.na).toBeUndefined();
  });
  it("a photo removed takes it off the item (the item is «not done» again); a photo item is not ticked by hand", async () => {
    const r = await signedIn();
    valueOf(r).checkItem(VISIT, PHOTO_ITEM, true);
    await settle();
    expect(visitOf(r).checklist[1]!.done).toBe(false);
    valueOf(r).attachItemPhoto(VISIT, PHOTO_ITEM);
    await settle();
    const photo = visitOf(r).photos.at(-1)!;
    valueOf(r).removePhoto(VISIT, photo.id);
    await settle();
    expect(visitOf(r).checklist[1]!.photoIds).toEqual([]);
  });
});

describe("unit:checklistStore — what the server would refuse is not queued (it would hold the queue)", () => {
  it("a tech on a signed visit: no untick, no skip, no new item; a tick still goes", async () => {
    const r = await signedIn();
    valueOf(r).setRole("tech");
    await settle();
    // the client signed with the first item ticked
    valueOf(r).checkItem(VISIT, ITEM, true);
    await settle();
    // the visit as the server read it back after the signature (the step itself is another test's)
    Object.assign(visitOf(r), { step: "signed", signature: "M0 0" });
    valueOf(r).checkItem(VISIT, ITEM, false);
    valueOf(r).skipItems(VISIT, [PHOTO_ITEM]);
    valueOf(r).addCheckItem(VISIT, "late");
    await settle();
    expect(visitOf(r).checklist.map((c) => [c.done, !!c.na])).toEqual([[true, false], [false, false]]);
    await tick();
    expect(server.sends.map((x) => x.op.k)).toEqual(["chk.item.set"]);
  });
  it("a template without a name is not sent; a new one is added, a changed one replaced", async () => {
    const r = await signedIn();
    const t = { id: "00000000-0000-4000-8000-0000000000b1", name: " Every visit ", items: [{ id: "00000000-0000-4000-8000-0000000000c1", label: "Scope", kind: "check", required: true }], appliesTo: { everyVisit: true, visitKinds: [], catalogItemIds: [] } };
    valueOf(r).saveChecklistTemplate({ ...t, name: " " });
    valueOf(r).saveChecklistTemplate(t);
    valueOf(r).saveChecklistTemplate({ ...t, name: "Every visit v2" });
    await settle();
    expect(valueOf(r).db.checklistTemplates!.filter((x) => x.id === t.id).map((x) => x.name)).toEqual(["Every visit v2"]);
    await tick();
    expect(server.sends.map((x) => [x.op.k, (x.op.template as { name: string }).name])).toEqual([["chk.template.save", "Every visit"]]);
  });
});

describe("unit:checklistStore — a server before the checklist migration (rule 16)", () => {
  it("a tick goes as the old whole list; no «Просмотрено» (nothing the server keeps)", { timeout: 15_000 }, async () => {
    const r = await signedIn({ checklistLegacy: true });
    valueOf(r).checkItem(VISIT, ITEM, true);
    valueOf(r).reviewVisitMissed(VISIT);
    await settle();
    expect(visitOf(r).checklistReviewedAt).toBeUndefined();
    await tick();
    expect(server.sends.map((x) => x.op.k)).toEqual(["visit.checklist"]);
    expect(server.sends[0]!.op.checklist).toEqual([{ id: ITEM, label: "Confirm scope", done: true }, { id: PHOTO_ITEM, label: "Photo of the area", done: false }]);
  });
});

describe("unit:checklistStore — offline in the demo (no cloud)", () => {
  it("a tick is local at once and waits in the queue", async () => {
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    expect(valueOf(r).mode).toBe("demo");
    const v = valueOf(r).db.visits.find((x) => x.checklist.length)!;
    valueOf(r).checkItem(v.id, v.checklist[0]!.id, !v.checklist[0]!.done);
    await settle();
    expect(valueOf(r).db.visits.find((x) => x.id === v.id)!.checklist[0]!.done).toBe(!v.checklist[0]!.done);
  });
});

describe("unit:checklistStore — the snapshot of templates in a new visit (S4, S9; docs/specs/08 §5, §11.7 №7)", () => {
  const TPL = {
    id: "00000000-0000-4000-8000-0000000000d1", name: "Install",
    items: [{ id: "00000000-0000-4000-8000-0000000000d2", label: "Check the slope", kind: "check" as const, required: true }],
    appliesTo: { everyVisit: false, visitKinds: ["work" as const], catalogItemIds: [] }, minPhotosAfter: 3,
  };
  const INSPECT = { ...TPL, id: "00000000-0000-4000-8000-0000000000d3", name: "Inspection", minPhotosAfter: undefined, appliesTo: { everyVisit: false, visitKinds: ["inspection" as const], catalogItemIds: [] } };
  const drain = async () => {
    for (let i = 0; i < 6; i++) {
      await tick();
      server.sends.forEach((s) => s.d.resolve());
    }
  };
  it("S9: the visit gets the items and the minimums; job.schedule goes first, then each item, then the minimums", { timeout: 15_000 }, async () => {
    const r = await signedIn({ checklistTemplates: [TPL, INSPECT] });
    valueOf(r).scheduleJob("j2", { start: new Date().toISOString(), durationMin: 60, techId: null });
    await settle();
    const v = valueOf(r).db.visits.at(-1)!;
    expect(v.checklist.map((c) => [c.label, c.templateName, c.required])).toEqual([["Check the slope", "Install", true]]);
    expect(v.checklist[0]!.id).not.toBe(TPL.items[0]!.id);
    expect(v.photoMins).toEqual({ after: 3 });
    await drain();
    expect(server.sends.map((x) => x.op.k)).toEqual(["job.schedule", "chk.item.add", "chk.visit.mins"]);
    expect(server.sends[1]!.op.item).toMatchObject({ visitId: v.id, label: "Check the slope", templateId: TPL.id });
    expect(server.sends[2]!.op).toMatchObject({ visitId: v.id, before: null, after: 3 });
  });
  it("S4: an inspection gets the inspection's template; «Отменить» takes back the visit and its items", { timeout: 15_000 }, async () => {
    const r = await signedIn({ checklistTemplates: [TPL, INSPECT] });
    const n = valueOf(r).db.visits.length;
    const { id, undo } = valueOf(r).addInspection("p1", { start: new Date().toISOString(), durationMin: 45, techId: null });
    await settle();
    const v = valueOf(r).db.visits.find((x) => x.id === id)!;
    expect(v.checklist.map((c) => c.templateName)).toEqual(["Inspection"]);
    expect(v.photoMins).toBeUndefined();
    undo();
    await settle();
    expect(valueOf(r).db.visits.length).toBe(n);
    await drain();
    expect(server.sends).toEqual([]);
  });
  it("a template changed later does not change the visit (the snapshot)", { timeout: 15_000 }, async () => {
    const r = await signedIn({ checklistTemplates: [TPL] });
    valueOf(r).scheduleJob("j2", { start: new Date().toISOString(), durationMin: 60, techId: null });
    await settle();
    const id = valueOf(r).db.visits.at(-1)!.id;
    valueOf(r).saveChecklistTemplate({ ...TPL, items: [{ ...TPL.items[0]!, label: "Changed" }] });
    await settle();
    expect(valueOf(r).db.visits.find((x) => x.id === id)!.checklist.map((c) => c.label)).toEqual(["Check the slope"]);
  });
  it("S9: a template of a service — by the catalog item of the job's line", { timeout: 15_000 }, async () => {
    const SVC = { ...TPL, id: "00000000-0000-4000-8000-0000000000d4", name: "Service", minPhotosAfter: undefined, appliesTo: { everyVisit: false, visitKinds: [], catalogItemIds: ["cat-x"] } };
    const r = await signedIn({ checklistTemplates: [SVC], jobLines: [{ id: "jl1", jobId: "j2", position: 0, name: "X", catalogItemId: "cat-x", quantity: "1", unitPriceCents: 100, taxable: false, totalCents: 100 }] });
    valueOf(r).scheduleJob("j2", { start: new Date().toISOString(), durationMin: 60, techId: null });
    valueOf(r).scheduleJob("j3", { start: new Date().toISOString(), durationMin: 60, techId: null });
    await settle();
    const [a, b] = valueOf(r).db.visits.slice(-2);
    expect(a!.checklist.map((c) => c.templateName)).toEqual(["Service"]);
    expect(b!.checklist).toEqual([]);
  });
  it("S4 from a lead: the inspection gets its template; «Отменить» takes back the visit and its items", { timeout: 15_000 }, async () => {
    const r = await signedIn({ checklistTemplates: [INSPECT] });
    const n = valueOf(r).db.visits.length;
    const lead = valueOf(r).db.leads.find((l) => l.status === "new")!;
    const undo = valueOf(r).bookLead(lead.id, { start: new Date().toISOString(), durationMin: 45, techId: null });
    await settle();
    const v = valueOf(r).db.visits.find((x) => x.leadId === lead.id)!;
    expect(v.checklist.map((c) => c.templateName)).toEqual(["Inspection"]);
    undo();
    await settle();
    expect(valueOf(r).db.visits.length).toBe(n);
  });
  it("an old server: the snapshot goes as the old whole list", { timeout: 15_000 }, async () => {
    const r = await signedIn({ checklistTemplates: [TPL], checklistLegacy: true });
    valueOf(r).scheduleJob("j2", { start: new Date().toISOString(), durationMin: 60, techId: null });
    await drain();
    expect(server.sends.map((x) => x.op.k)).toEqual(["job.schedule", "visit.checklist"]);
  });
});

describe("unit:checklistStore — «Просмотрено» and «Отменить» after it was sent (CH2b, rule 5)", () => {
  it("«Отменить» after the op went to the server sends the reverse op", { timeout: 15_000 }, async () => {
    const r = await signedIn();
    const undo = valueOf(r).reviewVisitMissed(VISIT);
    await tick();
    server.sends.forEach((s) => s.d.resolve());
    await settle();
    undo();
    await settle();
    expect(visitOf(r).checklistReviewedAt).toBeUndefined();
    await tick();
    expect(server.sends.map((x) => [x.op.k, x.op.at === null])).toEqual([["chk.visit.review", false], ["chk.visit.review", true]]);
  });
});

describe("unit:checklistOfficeStore — the office edits a visit before it starts (§7.4, CH3)", () => {
  const TPL = {
    id: "00000000-0000-4000-8000-0000000000e1", name: "Inspection",
    items: [
      { id: "00000000-0000-4000-8000-0000000000e2", label: "Measure the run", kind: "check" as const, required: true },
      { id: "00000000-0000-4000-8000-0000000000e3", label: "Photo of the roof", kind: "photo" as const, required: false },
    ],
    appliesTo: { everyVisit: false, visitKinds: ["inspection" as const], catalogItemIds: [] }, minPhotosBefore: 2,
  };
  const drain = async () => {
    for (let i = 0; i < 6; i++) {
      await tick();
      server.sends.forEach((s) => s.d.resolve());
    }
  };
  const scheduled = (r: Root<P>) => Object.assign(visitOf(r), { step: "scheduled" });
  it("text (cleaned) and «Обязательный» — one row's update with only what changed", { timeout: 15_000 }, async () => {
    const r = await signedIn();
    scheduled(r);
    valueOf(r).editVisitItem(VISIT, ITEM, { label: " Confirm\nscope with the client " });
    valueOf(r).editVisitItem(VISIT, ITEM, { label: "  " });
    valueOf(r).editVisitItem(VISIT, ITEM, { required: false });
    await settle();
    expect(visitOf(r).checklist[0]).toMatchObject({ label: "Confirm scope with the client", required: false });
    await drain();
    expect(server.sends.map((x) => x.op)).toEqual([
      { k: "chk.item.edit", id: ITEM, visitId: VISIT, label: "Confirm scope with the client" },
      { k: "chk.item.edit", id: ITEM, visitId: VISIT, required: false },
    ]);
  });
  it("the dispatcher makes an item required, never optional; a started visit — nothing", { timeout: 15_000 }, async () => {
    const r = await signedIn();
    scheduled(r);
    valueOf(r).setRole("dispatcher");
    await settle();
    valueOf(r).editVisitItem(VISIT, ITEM, { required: false });
    valueOf(r).setRole("director");
    await settle();
    Object.assign(visitOf(r), { step: "on_site" });
    valueOf(r).editVisitItem(VISIT, ITEM, { label: "late" });
    valueOf(r).moveVisitItem(VISIT, ITEM, 1);
    await drain();
    expect(server.sends).toEqual([]);
    expect(visitOf(r).checklist[0]).toMatchObject({ label: "Confirm scope", required: true });
  });
  it("«Ниже»: the two items swap — one op each; «Отменить» takes both back", { timeout: 15_000 }, async () => {
    const r = await signedIn();
    scheduled(r);
    const undo = valueOf(r).moveVisitItem(VISIT, ITEM, 1);
    await settle();
    expect(visitOf(r).checklist.map((c) => c.id)).toEqual([PHOTO_ITEM, ITEM]);
    undo();
    await settle();
    expect(visitOf(r).checklist.map((c) => c.id)).toEqual([ITEM, PHOTO_ITEM]);
    valueOf(r).moveVisitItem(VISIT, ITEM, 1);
    await drain();
    expect(server.sends.map((x) => [x.op.id, x.op.position])).toEqual([[PHOTO_ITEM, 0], [ITEM, 1]]);
  });
  it("«Добавить из шаблона» (an inspection sales booked — no snapshot): each item, then the raised minimum; twice — nothing", { timeout: 15_000 }, async () => {
    const r = await signedIn({ checklistTemplates: [TPL] });
    scheduled(r);
    valueOf(r).addVisitTemplate(VISIT, TPL.id);
    valueOf(r).addVisitTemplate(VISIT, TPL.id);
    await settle();
    const v = visitOf(r);
    expect(v.checklist.map((c) => [c.label, c.templateName, c.position])).toEqual([
      ["Confirm scope", undefined, undefined], ["Photo of the area", undefined, undefined], ["Measure the run", "Inspection", 2], ["Photo of the roof", "Inspection", 3],
    ]);
    expect(v.photoMins).toEqual({ before: 2 });
    await drain();
    expect(server.sends.map((x) => x.op.k)).toEqual(["chk.item.add", "chk.item.add", "chk.visit.mins"]);
    expect(server.sends[0]!.op.item).toMatchObject({ visitId: VISIT, label: "Measure the run", templateId: TPL.id, templateName: "Inspection", required: true });
    expect(server.sends[2]!.op).toMatchObject({ before: 2, after: null });
  });
  it("«Отменить» takes the template's items back", { timeout: 15_000 }, async () => {
    const r = await signedIn({ checklistTemplates: [TPL] });
    scheduled(r);
    const undo = valueOf(r).addVisitTemplate(VISIT, TPL.id);
    await settle();
    undo();
    await drain();
    expect(visitOf(r).checklist).toHaveLength(2);
    expect(server.sends).toEqual([]);
  });
  it("sales (books inspections) neither edits nor adds a template: the server would refuse it", { timeout: 15_000 }, async () => {
    const r = await signedIn({ checklistTemplates: [TPL] }, "sales");
    scheduled(r);
    valueOf(r).editVisitItem(VISIT, ITEM, { label: "sales" });
    valueOf(r).addVisitTemplate(VISIT, TPL.id);
    valueOf(r).moveVisitItem(VISIT, ITEM, 1);
    await drain();
    expect(visitOf(r).checklist.map((c) => c.label)).toEqual(["Confirm scope", "Photo of the area"]);
    expect(server.sends).toEqual([]);
  });
  it("an old server: «Ниже» goes as the old whole list in the new order", { timeout: 15_000 }, async () => {
    const r = await signedIn({ checklistLegacy: true });
    scheduled(r);
    valueOf(r).moveVisitItem(VISIT, ITEM, 1);
    await drain();
    expect(server.sends.map((x) => x.op.k)).toEqual(["visit.checklist"]);
    expect((server.sends[0]!.op.checklist as { id: string }[]).map((c) => c.id)).toEqual([PHOTO_ITEM, ITEM]);
  });
  it("an old server: the edit and the template go as the old whole list", { timeout: 15_000 }, async () => {
    const r = await signedIn({ checklistTemplates: [TPL], checklistLegacy: true });
    scheduled(r);
    valueOf(r).editVisitItem(VISIT, ITEM, { label: "Scope" });
    valueOf(r).addVisitTemplate(VISIT, TPL.id);
    await drain();
    expect(server.sends.map((x) => x.op.k)).toEqual(["visit.checklist", "visit.checklist"]);
    expect((server.sends[1]!.op.checklist as { label: string }[]).map((c) => c.label)).toEqual(["Scope", "Photo of the area", "Measure the run", "Photo of the roof"]);
  });
});
