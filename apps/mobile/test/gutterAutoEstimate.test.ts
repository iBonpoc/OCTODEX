/**
 * #3027 (founder 26.11: «если замер уже есть, то смета уже должна быть автоматически сделана… одна смета будет на весь объём работы»;
 * #3047 А, #3048 А, решение #3054; spec 70): which estimate a measurement's lines go to (its own, the lead's open draft, its sent one, a
 * new one), when the step runs by itself, the measurement's own section «Gutters» next to a person's own lines («Ремонт розетки»), and
 * that a later edit of the drawing changes only its own lines.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/cloud/client", () => ({ supabase: {} }));

import { computeGutterParts, type PartQty } from "@octo/estimating-engine";
import type { CatalogItem, DB, Estimate, EstimateDoc } from "../src/data/types";
import { makeSeed } from "../src/data/seed";
import { putMeasurement, withGutterData } from "../src/modules/gutters/data";
import { autoEstimate, estimateTarget, makeEstimate, ofMeasurement, sectionIdOf, type MakeResult } from "../src/modules/gutters/estimateLink";
import { linesFromParts, type ModuleLine } from "../src/modules/gutters/estimate";
import { laborRows, materialRows, missingItems, sampleJob } from "../src/modules/gutters/prices";
import type { MeasurementRow } from "../src/modules/gutters/canvas/model";
import { newDoc } from "../src/features/estimateDoc";
import { markUndo } from "../src/data/undo";

const C = "11111111-1111-4111-8111-111111111111";
const name = (p: PartQty) => `${p.attrs.part ?? p.attrs.work ?? p.key}`;
let n = 0;
const uid = () => `x${++n}`;
const parts = computeGutterParts(sampleJob({})).parts;
const fewer = parts.map((p) => (p.section === "gutter" ? { ...p, qty: "10" } : p));
const list = (): CatalogItem[] =>
  missingItems(C, [...materialRows({}), ...laborRows()], [], name).map((it) => ({ ...it, placeholder: false, priceCents: 1234, ...(it.kind === "material" ? { costCents: 1234, vendorTaxBps: 0, markupBps: 0 } : {}) }));
const M: MeasurementRow = { id: "m1", label: null, status: "draft", propertyId: null, leadId: "l1" };
const outlet = { id: "own-outlet", name: "Ремонт розетки", group: "service" as const, quantity: "1", unit: "ea", unitPriceCents: 9500 };
const docOf = (lines: unknown[]): EstimateDoc => ({ ...newDoc(), options: [{ id: "o1", name: "Option", lines: lines as EstimateDoc["options"][number]["lines"] }] });
const est = (id: string, status: Estimate["status"], lines: unknown[], x: Partial<Estimate> = {}): Estimate =>
  ({ id, customerId: "c1", propertyId: "p1", leadId: "l1", title: "Outlet repair", totalCents: 0, status, doc: docOf(lines), ...x }) as Estimate;
const mine = () => linesFromParts(parts, list(), name, uid, "r1", "m1");

describe("which estimate — one for the whole job (spec 70 §4.2)", () => {
  it("its own first; else the lead's open draft; else its sent one; else a new one; a signed or a declined one never", () => {
    expect(estimateTarget({ estimates: [est("own", "sent", mine()), est("d", "draft", [outlet])] }, M)).toMatchObject({ kind: "own", estimate: { id: "own" } });
    expect(estimateTarget({ estimates: [est("s", "sent", [outlet], { number: "EST-0009" }), est("d", "draft", [outlet], { number: "EST-0006" })] }, M)).toMatchObject({ kind: "join", estimate: { id: "d" } });
    expect(estimateTarget({ estimates: [est("s", "sent", [outlet])] }, M)).toMatchObject({ kind: "join", estimate: { id: "s" } });
    expect(estimateTarget({ estimates: [est("a", "approved", [outlet]), est("w", "awaiting_countersign", [outlet]), est("x", "declined", [outlet])] }, M)).toEqual({ kind: "new" });
    // another lead's / another address's — not this job
    expect(estimateTarget({ estimates: [est("o", "draft", [outlet], { leadId: "l2", propertyId: "p9" })] }, M)).toEqual({ kind: "new" });
  });
  it("the client's address counts as the lead does", () => {
    expect(estimateTarget({ estimates: [est("d", "draft", [outlet], { leadId: undefined })] }, { ...M, leadId: null, propertyId: "p1" })).toMatchObject({ kind: "join", estimate: { id: "d" } });
  });
});

describe("when the step runs by itself (spec 70 §4.1 А)", () => {
  it("a new estimate, joining an open one (a sent one too, #3048), its own draft the drawing changed after — yes", () => {
    expect(autoEstimate({ estimates: [] }, M, true)).toBe(true);
    expect(autoEstimate({ estimates: [est("s", "sent", [outlet])] }, M, true)).toBe(true);
    expect(autoEstimate({ estimates: [est("own", "draft", mine())] }, M, true)).toBe(true);
  });
  it("its own SENT or signed one — never by itself (the card asks: «Отправить изменения», «Доп. смета»); nothing drawn, no client, nothing changed — no", () => {
    expect(autoEstimate({ estimates: [est("own", "sent", mine())] }, M, true)).toBe(false);
    expect(autoEstimate({ estimates: [est("own", "approved", mine())] }, M, true)).toBe(false);
    expect(autoEstimate({ estimates: [] }, M, false)).toBe(false);
    expect(autoEstimate({ estimates: [] }, { ...M, leadId: null }, true)).toBe(false);
    expect(autoEstimate({ estimates: [est("own", "draft", mine())] }, { ...M, status: "ready" }, true)).toBe(false);
    expect(autoEstimate({ estimates: [] }, null, true)).toBe(false);
  });
});

describe("makeEstimate — into the job's one estimate, its own section", () => {
  const harness = (db: DB) => {
    const saved: { id: string; customerId: string; propertyId: string; doc: EstimateDoc; title: string; leadId?: string }[] = [];
    const targets: string[] = [];
    const s = {
      db,
      moduleOp: (_m: string, c: { apply: (d: DB) => DB }) => ((s.db = c.apply(s.db)), markUndo(() => true)),
      undoTogether: (us: readonly unknown[]) => markUndo(() => ([...us].reverse().forEach((u) => typeof u === "function" && (u as () => unknown)()), true)),
      leadEstimateTarget: (leadId: string) => (targets.push(leadId), { customerId: "c-new", propertyId: "p-new", undo: markUndo(() => true) }),
      saveEstimate: (e: (typeof saved)[number]) => {
        saved.push(e);
        const was = s.db.estimates.find((x) => x.id === e.id);
        s.db = { ...s.db, estimates: [...s.db.estimates.filter((x) => x.id !== e.id), { ...(was ?? { totalCents: 0, status: "draft" }), ...e } as Estimate] };
        return markUndo(() => true);
      },
    };
    return { s, saved, targets };
  };
  const on = (d: DB): DB => ({
    ...d,
    company: { ...d.company!, modules: { gutters: { enabled: true, trialEndsAt: new Date(Date.now() + 86_400_000).toISOString(), settings: {}, rowVersion: 1 } } },
    leads: d.leads.some((l) => l.id === "l1") ? d.leads : [...d.leads, { ...d.leads[0]!, id: "l1" }],
  });
  const SECTION = "Gutters · по замеру 11/26";
  const input = (m: MeasurementRow, p = parts) => ({ m, elements: [], parts: p, catalog: list(), name, fallbackTitle: "Gutters", now: () => "2026-11-26T12:00:00Z", section: SECTION });
  const ok = (r: MakeResult) => {
    if (!r.ok) throw new Error(`not made: ${r.reason}`);
    return r;
  };
  const base = () => on(withGutterData(makeSeed(), putMeasurement(M)));

  it("the lead's sent estimate with «Ремонт розетки»: the measurement goes INTO it — one estimate, its section «Gutters» first, the outlet stays, its client and title stay", () => {
    const h = harness({ ...base(), estimates: [...base().estimates, est("e6", "sent", [outlet], { number: "EST-0006", customerId: "c-lead", propertyId: "p-lead" })] });
    const r = ok(makeEstimate(h.s, input(M)));
    expect(r).toMatchObject({ estimateId: "e6", updated: false, joined: true });
    expect(h.targets).toEqual([]); // no second client made from the lead
    const saved = h.saved[0]!;
    expect(saved).toMatchObject({ id: "e6", customerId: "c-lead", propertyId: "p-lead", title: "Outlet repair" });
    const o = saved.doc.options[0]!;
    expect(o.sections?.[0]).toEqual({ id: sectionIdOf("m1"), title: SECTION, kind: "module", module: "gutters" });
    const gl = o.lines.filter((l) => ofMeasurement(l, "m1"));
    expect(gl.length).toBeGreaterThan(0);
    expect(gl.every((l) => l.sectionId === sectionIdOf("m1"))).toBe(true);
    expect(o.lines.find((l) => l.id === "own-outlet")).toEqual(outlet); // a person's own line — as it was, no section put on it
    expect(h.s.db.estimates.filter((e) => e.leadId === "l1" || e.id === "e6")).toHaveLength(1);
  });
  it("no estimate yet: a new one, its section «Gutters»", () => {
    const h = harness(base());
    const r = ok(makeEstimate(h.s, input(M)));
    expect(r.joined).toBeUndefined();
    expect(h.targets).toEqual(["l1"]);
    const o = h.saved[0]!.doc.options[0]!;
    expect(o.sections?.map((x) => x.id)).toEqual([sectionIdOf("m1")]);
    expect(o.lines.every((l) => l.sectionId === sectionIdOf("m1"))).toBe(true);
  });
  it("the drawing changed after a person added «Ремонт розетки»: only the measurement's lines change, the outlet and the section stay, no second section", () => {
    const h = harness(base());
    const first = ok(makeEstimate(h.s, input(M)));
    const e = h.s.db.estimates.find((x) => x.id === first.estimateId)!;
    const o0 = e.doc!.options[0]!;
    h.s.db = { ...h.s.db, estimates: h.s.db.estimates.map((x) => (x.id === e.id ? { ...x, doc: { ...e.doc!, options: [{ ...o0, lines: [...o0.lines, outlet] }] } } : x)) };
    h.s.db = withGutterData(h.s.db, putMeasurement({ ...M, status: "draft" }));
    expect(autoEstimate(h.s.db, { ...M, status: "draft" }, true)).toBe(true); // a draft of its own: by itself
    const r = ok(makeEstimate(h.s, input(M, fewer)));
    expect(r).toMatchObject({ estimateId: first.estimateId, updated: true });
    const o = h.saved[1]!.doc.options[0]!;
    expect(o.lines.find((l) => l.id === "own-outlet")).toEqual(outlet);
    expect(o.sections?.filter((x) => x.id === sectionIdOf("m1"))).toHaveLength(1);
    const gutter = o.lines.find((l) => ofMeasurement(l, "m1") && (l as ModuleLine).source?.section === "gutter");
    expect(gutter?.quantity).toBe("10");
    expect(o.lines.filter((l) => ofMeasurement(l, "m1")).every((l) => l.sectionId === sectionIdOf("m1"))).toBe(true);
  });
  it("a sent estimate saved as its new version (every section and line a new id, reIdDoc): the next update finds the measurement's section by its lines — no second section", () => {
    const h = harness(base());
    const first = ok(makeEstimate(h.s, input(M)));
    const e = h.s.db.estimates.find((x) => x.id === first.estimateId)!;
    const o0 = e.doc!.options[0]!;
    const re = { ...o0, sections: o0.sections!.map((x) => ({ ...x, id: "s-new" })), lines: o0.lines.map((l) => (l.sectionId ? { ...l, sectionId: "s-new" } : l)) };
    h.s.db = { ...h.s.db, estimates: h.s.db.estimates.map((x) => (x.id === e.id ? { ...x, doc: { ...e.doc!, options: [re] } } : x)) };
    h.s.db = withGutterData(h.s.db, putMeasurement({ ...M, status: "draft" }));
    ok(makeEstimate(h.s, input(M, fewer)));
    const o = h.saved[1]!.doc.options[0]!;
    expect(o.sections?.map((x) => x.id)).toEqual(["s-new"]);
    expect(o.lines.filter((l) => ofMeasurement(l, "m1")).every((l) => l.sectionId === "s-new")).toBe(true);
  });
  it("a second «Готово» changes nothing more: still one estimate (no second one for the job)", () => {
    const h = harness(base());
    ok(makeEstimate(h.s, input(M)));
    ok(makeEstimate(h.s, input(M)));
    expect(new Set(h.saved.map((x) => x.id)).size).toBe(1);
  });
  it("without a section title (the old call): no section, as before", () => {
    const h = harness(base());
    const { section: _s, ...old } = input(M);
    ok(makeEstimate(h.s, old));
    expect(h.saved[0]!.doc.options[0]!.sections ?? []).toEqual([]);
  });
});
