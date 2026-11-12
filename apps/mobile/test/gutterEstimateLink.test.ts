/**
 * M8b (docs/specs/33-gutters-estimate.md П23.8; stub S5g): «Смета / Обновить смету» — which estimate is the measurement's,
 * what the button does, the document after «Обновить» (hand changes and own lines stay, a signed estimate is never
 * touched), the revision write (the server numbers it, T98) and the measurement's status.
 */
import { describe, expect, it, vi } from "vitest";

type Call = { table: string; verb: string; row?: unknown; opts?: unknown };
const calls: Call[] = [];
vi.mock("@/cloud/client", () => ({
  supabase: {
    from: (table: string) => {
      const c: Call = { table, verb: "" };
      calls.push(c);
      const chain = {
        upsert: (row: unknown, opts: unknown) => ((c.verb = "upsert"), (c.row = row), (c.opts = opts), chain),
        then: (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) => Promise.resolve({ error: null, status: 201 }).then(ok, no),
      };
      return chain;
    },
  },
}));

import { computeGutterParts, type PartQty } from "@octo/estimating-engine";
import type { CatalogItem, DB, Estimate, EstimateDoc } from "../src/data/types";
import { makeSeed } from "../src/data/seed";
import { gutterData, guttersOps, K, putMeasurement, withGutterData } from "../src/modules/gutters/data";
import { clientLangOf, docWithLines, estimateAction, estimateOfMeasurement, makeEstimate, ofMeasurement, type MakeResult } from "../src/modules/gutters/estimateLink";
import { linesFromParts, type ModuleLine } from "../src/modules/gutters/estimate";
import { laborRows, materialRows, missingItems, partName, sampleJob } from "../src/modules/gutters/prices";
import type { MeasurementRow } from "../src/modules/gutters/canvas/model";
import { tFor } from "../src/i18n/translate";
import { newDoc } from "../src/features/estimateDoc";
import type { GuardedUndo } from "../src/data/undo";

const C = "11111111-1111-4111-8111-111111111111";
const name = (p: PartQty) => `${p.attrs.part ?? p.attrs.work ?? p.key}`;
let n = 0;
const uid = () => `x${++n}`;
const parts = computeGutterParts(sampleJob({})).parts;
const fewer = parts.map((p) => (p.section === "gutter" ? { ...p, qty: "10" } : p));
const list = (cents = 1234): CatalogItem[] =>
  missingItems(C, [...materialRows({}), ...laborRows()], [], name).map((it) => ({ ...it, placeholder: false, priceCents: cents, ...(it.kind === "material" ? { costCents: cents, vendorTaxBps: 0, markupBps: 0 } : {}) }));
const M: MeasurementRow = { id: "m1", label: null, status: "draft", propertyId: null, leadId: "l1" };
const docOf = (lines: ModuleLine[]): EstimateDoc => ({ ...newDoc(), options: [{ id: "o1", name: "Option", lines: lines as EstimateDoc["options"][number]["lines"] }] });
const est = (id: string, status: Estimate["status"], lines: ModuleLine[]): Estimate => ({ id, customerId: "c1", propertyId: "p1", title: "T", totalCents: 0, status, doc: docOf(lines) } as Estimate);
const own = { id: "own", name: "Haul away", group: "service" as const, quantity: "1", unit: "ea", unitPriceCents: 5000 };

describe("which estimate is the measurement's, what the button does", () => {
  const mine = linesFromParts(parts, list(), name, uid, "r1", "m1");
  const other = linesFromParts(parts, list(), name, uid, "r9", "m9");
  it("the one written last (by the lines' time), whatever order the list comes in (the cloud lists by id)", () => {
    const at = (t: string) => linesFromParts(parts, list(), name, uid, "r", "m1", t);
    const db = { estimates: [est("e-new", "draft", at("2026-11-08T10:00:00Z")), est("e-old", "draft", at("2026-11-08T09:00:00Z"))] };
    expect(estimateOfMeasurement(db, "m1")?.id).toBe("e-new");
    expect(estimateOfMeasurement({ estimates: [...db.estimates].reverse() }, "m1")?.id).toBe("e-new");
  });
  it("the newest open one with its lines; a signed one only when no open one; a declined one never", () => {
    const db = { estimates: [est("e1", "sent", mine), est("e2", "draft", other), est("e3", "approved", mine), est("e4", "draft", mine), est("e5", "declined", mine)] };
    expect(estimateOfMeasurement(db, "m1")?.id).toBe("e4");
    expect(estimateOfMeasurement({ estimates: [est("e3", "approved", mine)] }, "m1")?.id).toBe("e3");
    expect(estimateOfMeasurement({ estimates: [est("e5", "declined", mine)] }, "m1")).toBeUndefined();
    expect(estimateOfMeasurement({ estimates: [est("e2", "draft", other)] }, "m1")).toBeUndefined();
  });
  it("«Смета» / «Обновить смету» / «Открыть смету» / signed / no client yet / nothing drawn", () => {
    expect(estimateAction({ estimates: [] }, M, false)).toEqual({ kind: "none" });
    expect(estimateAction({ estimates: [] }, M, true)).toEqual({ kind: "make" });
    expect(estimateAction({ estimates: [] }, { ...M, leadId: null }, true)).toEqual({ kind: "needLead" });
    expect(estimateAction({ estimates: [] }, { ...M, leadId: null, propertyId: "p1" }, true)).toEqual({ kind: "make" });
    expect(estimateAction({ estimates: [est("e1", "draft", mine)] }, M, true)).toEqual({ kind: "update", estimateId: "e1" });
    expect(estimateAction({ estimates: [est("e1", "sent", mine)] }, { ...M, status: "ready" }, true)).toEqual({ kind: "open", estimateId: "e1" });
    expect(estimateAction({ estimates: [est("e1", "awaiting_countersign", mine)] }, M, true)).toEqual({ kind: "open", estimateId: "e1", signed: true });
  });
  it("#699: the review's one action by the state — and no «Перенести изменения» when nothing changed", () => {
    const ready = { ...M, status: "ready" as const };
    // not linked → link it; no estimate → make it
    expect(estimateAction({ estimates: [] }, { ...M, leadId: null, propertyId: null }, true).kind).toBe("needLead");
    expect(estimateAction({ estimates: [] }, M, true).kind).toBe("make");
    // an estimate, the drawing as estimated (ready) → open it, never «update»; even a sent or a draft one
    for (const st of ["draft", "sent"] as const) expect(estimateAction({ estimates: [est("e1", st, mine)] }, ready, true)).toEqual({ kind: "open", estimateId: "e1" });
    // the drawing changed after it (draft again) → move the changes
    expect(estimateAction({ estimates: [est("e1", "sent", mine)] }, M, true)).toEqual({ kind: "update", estimateId: "e1" });
    // signed → only open, changed or not
    for (const m of [M, ready]) expect(estimateAction({ estimates: [est("e1", "approved", mine)] }, m, true)).toEqual({ kind: "open", estimateId: "e1", signed: true });
  });
});

describe("the document after «Обновить смету»", () => {
  it("a new estimate: one option with the measurement's lines, each knows its measurement and revision", () => {
    const lines = linesFromParts(parts, list(), name, uid, "r1", "m1");
    const d = docWithLines(undefined, lines, "m1", () => newDoc());
    expect(d.options).toHaveLength(1);
    expect(d.options[0]!.lines.every((l) => ofMeasurement(l, "m1") && (l.source as { revisionId?: string }).revisionId === "r1")).toBe(true);
  });
  it("hand price and own line stay; untouched lines take the new quantity; another measurement's lines are not touched", () => {
    const first = linesFromParts(parts, list(), name, uid, "r1", "m1");
    const other = linesFromParts(parts.slice(0, 3), list(), name, uid, "r9", "m9");
    const gutter = first.findIndex((l) => (l.source as { section: string }).section === "gutter");
    const edited = first.map((l, i) => (i === gutter ? { ...l, unitPriceCents: 9999 } : l));
    const prev = docOf([...edited, own as ModuleLine, ...other]);
    const next = linesFromParts(fewer, list(), name, uid, "r2", "m1");
    const d = docWithLines(prev, next, "m1", () => newDoc());
    const out = d.options[0]!.lines;
    const g = out.find((l) => l.id === edited[gutter]!.id)!;
    expect(g.unitPriceCents).toBe(9999); // hand price
    expect(String(g.quantity)).toBe(String(next.find((l) => (l.source as { section: string }).section === "gutter")!.quantity)); // new qty
    expect(out.filter((l) => l.id === "own")).toHaveLength(1);
    for (const o of other) expect(out.find((l) => l.id === o.id)).toEqual(o); // m9's lines as they were
  });
});

describe("another measurement in the same estimate (review M8b №5)", () => {
  it("its lines with the same price-list items never hold back this measurement's new part", () => {
    const first = linesFromParts(parts.filter((p) => p.section !== "downspouts"), list(), name, uid, "r1", "m1");
    const garage = linesFromParts(parts.filter((p) => p.section === "downspouts"), list(), name, uid, "r9", "m9");
    const next = linesFromParts(parts, list(), name, uid, "r2", "m1");
    const out = docWithLines(docOf([...first, ...garage]), next, "m1", () => newDoc()).options[0]!.lines;
    const ds = (mid: string) => out.filter((l) => ofMeasurement(l, mid) && (l.source as unknown as { section: string }).section === "downspouts");
    expect(ds("m1").length).toBe(garage.length); // the house's downspouts are there
    expect(ds("m9")).toEqual(garage); // the garage's as they were
  });
});

describe("makeEstimate — through the core's store", () => {
  const harness = (db: DB, active = true) => {
    const sent: { kind: string; payload: Record<string, unknown> }[] = [];
    const saved: { id: string; customerId: string; propertyId: string; doc: EstimateDoc; leadId?: string }[] = [];
    const targets: string[] = [];
    const undone: string[] = [];
    const s = {
      db,
      moduleOp: (_m: string, c: { kind: string; payload: Record<string, unknown>; apply: (d: DB) => DB }) => {
        if (!active) return null;
        sent.push({ kind: c.kind, payload: c.payload });
        s.db = c.apply(s.db);
        return () => undone.push(c.kind);
      },
      leadEstimateTarget: (leadId: string) => (targets.push(leadId), { customerId: "c-new", propertyId: "p-new", undo: () => undone.push("target") }),
      saveEstimate: (e: (typeof saved)[number]) => {
        saved.push(e);
        s.db = { ...s.db, estimates: [...s.db.estimates.filter((x) => x.id !== e.id), { ...e, title: "T", totalCents: 0, status: "draft" } as Estimate] };
        return () => undone.push("estimate");
      },
    };
    return { s, sent, saved, targets, undone };
  };
  const input = (m: MeasurementRow, p = parts) => ({ m, elements: [], parts: p, catalog: list(), name, fallbackTitle: "Gutters", now: () => "2026-11-08T12:00:00Z" });
  /** the demo with the module on (trial) and the lead l1 */
  const on = (d: DB, active = true): DB => ({
    ...d,
    company: { ...d.company!, modules: { gutters: { enabled: active, trialEndsAt: new Date(Date.now() + 86_400_000).toISOString(), settings: {}, rowVersion: 1 } } },
    leads: d.leads.some((l) => l.id === "l1") ? d.leads : [...d.leads, { ...d.leads[0]!, id: "l1" }],
  });
  const ok = (r: MakeResult) => {
    if (!r.ok) throw new Error(`not made: ${r.reason}`);
    return r;
  };

  it("«Смета» of a lead: the client from the lead, a revision first, the measurement ready, then the estimate", () => {
    const h = harness(on(withGutterData(makeSeed(), putMeasurement(M))));
    const r = ok(makeEstimate(h.s, input(M)));
    expect(h.targets).toEqual(["l1"]);
    expect(h.sent.map((x) => x.kind)).toEqual([K.rAdd, K.mSave]);
    expect((h.sent[1]!.payload.m as MeasurementRow).status).toBe("ready");
    expect(gutterData(h.s.db).measurements[0]!.status).toBe("ready");
    const revId = (h.sent[0]!.payload.r as { id: string }).id;
    expect(h.saved[0]).toMatchObject({ id: r.estimateId, customerId: "c-new", propertyId: "p-new", leadId: "l1" });
    expect(h.saved[0]!.doc.options[0]!.lines.every((l) => (l.source as { revisionId?: string }).revisionId === revId && ofMeasurement(l, "m1"))).toBe(true);
    expect(r.updated).toBe(false);
    // «Отменить»: the estimate, the status, the client made from the lead
    r.undo();
    expect(h.undone).toEqual(["estimate", K.mSave, "target"]);
  });
  it("#1244 (the director's 3rd review): with the core's undoTogether — one «Отменить» of all three parts, all or none (too late → nothing undone)", () => {
    const h = harness(on(withGutterData(makeSeed(), putMeasurement(M))));
    const asked: unknown[][] = [];
    const st = { ...h.s, undoTogether: (undos: readonly unknown[]) => (asked.push([...undos]), (() => false) as unknown as GuardedUndo) };
    // the harness's own functions write through h.s: keep the db in step
    Object.defineProperty(st, "db", { get: () => h.s.db });
    const r = ok(makeEstimate(st, input(M)));
    expect(r.undo()).toBe(false);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toHaveLength(3);
    expect(h.undone).toEqual([]);
  });
  it("#1138 (review of #1169 Б1): where the person may not make a new estimate — «notHere», and NOTHING is written (before: a revision, «ready», a client from the lead and a false «Смета составлена»)", () => {
    const h = harness(on(withGutterData(makeSeed(), putMeasurement(M))));
    const asked: (string | undefined)[] = [];
    const s = { ...h.s, mayMakeEstimateAt: (pid: string | undefined) => (asked.push(pid), false) };
    const r = makeEstimate(s, input(M));
    expect(r).toEqual({ ok: false, reason: "notHere" });
    expect(h.sent).toEqual([]); // no revision, no «ready»
    expect(h.targets).toEqual([]); // no client made from the lead
    expect(h.saved).toEqual([]);
    expect(asked).toHaveLength(1); // asked once, at the lead's property (or its client's), before anything
  });
  it("…where he may: made as before (the question does not change the rest)", () => {
    const h = harness(on(withGutterData(makeSeed(), putMeasurement(M))));
    const s = { ...h.s, mayMakeEstimateAt: () => true };
    expect(makeEstimate(s, input(M)).ok).toBe(true);
    expect(h.saved).toHaveLength(1);
  });
  it("P4b-2 (#705): the drawing goes with the estimate as its page; «Обновить» replaces it; without a page — none", () => {
    const h = harness(on(withGutterData(makeSeed(), putMeasurement(M))));
    const pg = { id: "gutters:m1", title: "Gutter drawing", w: 100, h: 50, items: [{ t: "l" as const, x1: 0, y1: 0, x2: 10, y2: 0, sw: 1, ink: "ink" as const }] };
    const first = ok(makeEstimate(h.s, { ...input(M), page: pg }));
    expect(h.saved[0]!.doc.pages).toEqual([pg]);
    h.s.db = withGutterData(h.s.db, putMeasurement({ ...M, status: "draft" }));
    ok(makeEstimate(h.s, { ...input(M, fewer), page: { ...pg, h: 60 } }));
    expect(h.saved[1]!.doc.pages).toEqual([{ ...pg, h: 60 }]);
    expect(first.estimateId).toBe(h.saved[1]!.id);
    const h2 = harness(on(withGutterData(makeSeed(), putMeasurement(M))));
    ok(makeEstimate(h2.s, input(M)));
    expect("pages" in h2.saved[0]!.doc).toBe(false);
  });
  it("«Обновить смету»: the same estimate id, its own client; hand changes stay", () => {
    const h = harness(on(withGutterData(makeSeed(), putMeasurement(M))));
    const first = ok(makeEstimate(h.s, input(M)));
    const doc = h.saved[0]!.doc;
    const l0 = doc.options[0]!.lines[0]!;
    h.s.db = { ...h.s.db, estimates: h.s.db.estimates.map((e) => (e.id === first.estimateId ? { ...e, doc: { ...doc, options: [{ ...doc.options[0]!, lines: [{ ...l0, unitPriceCents: 777 }, ...doc.options[0]!.lines.slice(1)] }] } } : e)) };
    h.s.db = withGutterData(h.s.db, putMeasurement({ ...M, status: "draft" })); // the drawing changed
    const r = ok(makeEstimate(h.s, input(M, fewer)));
    expect(r).toMatchObject({ estimateId: first.estimateId, updated: true });
    expect(h.targets).toEqual(["l1"]); // not asked again
    expect(h.saved[1]!.doc.options[0]!.lines.find((l) => l.id === l0.id)!.unitPriceCents).toBe(777);
  });
  it("a signed estimate is never touched; no client → nothing; the module off → nothing at all, not even the lead's client (review M8b №1)", () => {
    const lines = linesFromParts(parts, list(), name, uid, "r1", "m1");
    const signed = harness({ ...on(withGutterData(makeSeed(), putMeasurement(M))), estimates: [est("e1", "approved", lines)] });
    expect(makeEstimate(signed.s, input(M))).toEqual({ ok: false, reason: "signed" });
    expect([signed.sent, signed.saved, signed.targets]).toEqual([[], [], []]);
    const loose = harness(on(withGutterData(makeSeed(), putMeasurement({ ...M, leadId: null }))));
    expect(makeEstimate(loose.s, input({ ...M, leadId: null }))).toEqual({ ok: false, reason: "noClient" });
    expect(loose.sent).toEqual([]);
    const off = harness(on(withGutterData(makeSeed(), putMeasurement(M)), false));
    expect(makeEstimate(off.s, input(M))).toEqual({ ok: false, reason: "off" });
    expect([off.sent, off.saved, off.targets]).toEqual([[], [], []]);
  });
  it("a lead this person does not see: the property's client (a tech on his visit's property, review M8b №6)", () => {
    const d = on(withGutterData(makeSeed(), putMeasurement(M)));
    const prop = d.properties[0]!;
    const m = { ...M, leadId: "gone-lead", propertyId: prop.id };
    const h = harness({ ...d, moduleData: withGutterData(d, putMeasurement(m)).moduleData });
    ok(makeEstimate(h.s, input(m)));
    expect(h.targets).toEqual([]);
    expect(h.saved[0]).toMatchObject({ customerId: prop.customerId, propertyId: prop.id });
  });
});

describe("the client's language (rule 7)", () => {
  it("the lead's language, else the property's client's — never the app's", () => {
    const d = makeSeed();
    const lead = d.leads[0]!;
    const es = { ...d, leads: d.leads.map((l) => (l.id === lead.id ? { ...l, customerId: undefined, people: undefined, contacts: [], language: "es" as const } : l)) } as DB;
    expect(clientLangOf(es, { leadId: lead.id, propertyId: null })).toBe("es");
    const ru = { ...es, leads: es.leads.map((l) => (l.id === lead.id ? { ...l, language: "ru" as const } : l)) } as DB;
    expect(clientLangOf(ru, { leadId: lead.id, propertyId: null })).toBe("ru");
    expect(clientLangOf(d, { leadId: null, propertyId: null })).toBe(d.company?.docLanguage ?? "en");
  });
});

describe("revision.add → the server; part names in the client's language", () => {
  const run = async (p: PromiseLike<{ error: unknown }>) => void (await p);
  it("insert or nothing (a replay adds nothing); the number is the server's — the phone sends 1", async () => {
    calls.length = 0;
    await guttersOps({ kind: K.rAdd, payload: { r: { id: "r1", measurementId: "m1", elements: [{ id: "e1" }], parts: [{ key: "k" }], engineVersion: "1.2" } } }, { companyId: "c1", userId: "u1", run });
    expect(calls[0]).toMatchObject({ table: "gutter_measurement_revisions", verb: "upsert", row: { id: "r1", company_id: "c1", measurement_id: "m1", revision: 1, engine_version: "1.2" }, opts: { onConflict: "id", ignoreDuplicates: true } });
    await expect(guttersOps({ kind: K.rAdd, payload: { r: { id: "r1" } } }, { companyId: "c1", userId: "u1", run })).rejects.toThrow(/without a revision/);
  });
  it("a part with no price-list item is named in the language it is asked for (rule 7)", () => {
    const p = parts.find((x) => x.kind === "labor")!;
    expect(partName(tFor("es"), p)).not.toBe(partName(tFor("en"), p));
  });
});
