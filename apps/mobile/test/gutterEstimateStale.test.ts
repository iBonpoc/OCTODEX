/**
 * C5b (docs/specs/33-gutters-estimate.md П23.11): «замер изменился после сметы». The module answers the core through the
 * registry (ModuleDef.estimateNotes); the core asks only for an open estimate of a company with the module on.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/cloud/client", () => ({ supabase: {} }));
import { computeGutterParts, type PartQty } from "@octo/estimating-engine";
import type { DB, Estimate, EstimateDoc } from "../src/data/types";
import { makeSeed } from "../src/data/seed";
import { estimateNotes, registerModule } from "../src/modules/registry";
import gutters from "../src/modules/gutters/module";
import { staleMeasurements } from "../src/modules/gutters/estimateLink";
import { linesFromParts, type ModuleLine } from "../src/modules/gutters/estimate";
import { sampleJob } from "../src/modules/gutters/prices";
import type { ElementRow, MeasurementRow } from "../src/modules/gutters/canvas/model";
import { newDoc } from "../src/features/estimateDoc";

registerModule(gutters);
const parts = computeGutterParts(sampleJob({})).parts;
const name = (p: PartQty) => `${p.attrs.part ?? p.attrs.work ?? p.key}`;
let n = 0;
const uid = () => `x${++n}`;
const lines = (m: string, at = "2026-11-08T10:00:00Z") => linesFromParts(parts, [], name, uid, "r1", m, at);
const docOf = (ls: ModuleLine[]): EstimateDoc => ({ ...newDoc(), options: [{ id: "o1", name: "Option", lines: ls as EstimateDoc["options"][number]["lines"] }] });
const est = (id: string, status: Estimate["status"], ls: ModuleLine[]): Estimate => ({ id, customerId: "c1", propertyId: "p1", title: "T", totalCents: 0, status, doc: docOf(ls) }) as Estimate;
const M = (id: string, status: MeasurementRow["status"]): MeasurementRow => ({ id, label: null, status, propertyId: null, leadId: "l1" });
const run = (m: string): ElementRow => ({ id: `run-${m}`, measurementId: m, kind: "run", geom: {}, attrs: {}, confidence: "drawn" });
const FUTURE = new Date(Date.now() + 5 * 86_400_000).toISOString();

function dbWith(estimates: Estimate[], measurements: MeasurementRow[], elements: ElementRow[], on = true): DB {
  const seed = makeSeed();
  return {
    ...seed,
    estimates,
    company: { ...seed.company!, modules: on ? { gutters: { enabled: true, trialEndsAt: FUTURE, settings: {}, rowVersion: 1 } } : {} },
    moduleData: { gutters: { measurements, elements } },
  } as DB;
}

describe("C5b: the measurement changed after the estimate", () => {
  it("a draft measurement (edited after «Смета») with something drawn → its open estimate gets «Обновить из замера»", () => {
    const db = dbWith([est("e1", "draft", lines("m1"))], [M("m1", "draft")], [run("m1")]);
    expect(staleMeasurements(db, db.estimates[0]!).map((m) => m.id)).toEqual(["m1"]);
    const notes = estimateNotes(db, db.estimates[0]!);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ module: "gutters", id: "stale", labelKey: "mod.gutters.est.stale" });
    expect(notes[0]!.action?.href).toBe("/module/gutters/draw?m=m1&estimate=1");
  });
  it("a sent estimate too (the client may not have signed yet)", () => {
    const db = dbWith([est("e1", "sent", lines("m1"))], [M("m1", "draft")], [run("m1")]);
    expect(estimateNotes(db, db.estimates[0]!)).toHaveLength(1);
  });
  it("nothing when the measurement is ready (the estimate is of what is drawn)", () => {
    const db = dbWith([est("e1", "draft", lines("m1"))], [M("m1", "ready")], [run("m1")]);
    expect(estimateNotes(db, db.estimates[0]!)).toEqual([]);
  });
  it("nothing for a signed or declined estimate (a copy; more work is a change order)", () => {
    for (const s of ["approved", "awaiting_countersign", "declined"] as const) {
      const db = dbWith([est("e1", s, lines("m1"))], [M("m1", "draft")], [run("m1")]);
      expect(estimateNotes(db, db.estimates[0]!)).toEqual([]);
    }
  });
  it("nothing for an older estimate of the measurement (a newer one is its estimate) or one of another measurement", () => {
    const db = dbWith([est("e-old", "draft", lines("m1", "2026-11-08T09:00:00Z")), est("e-new", "draft", lines("m1", "2026-11-08T11:00:00Z")), est("e2", "draft", lines("m2"))], [M("m1", "draft"), M("m2", "ready")], [run("m1"), run("m2")]);
    expect(estimateNotes(db, db.estimates[0]!)).toEqual([]);
    expect(estimateNotes(db, db.estimates[1]!)).toHaveLength(1);
    expect(estimateNotes(db, db.estimates[2]!)).toEqual([]);
  });
  it("nothing when the drawing was emptied, for an own estimate without module lines, or when the module is off", () => {
    const own = est("e-own", "draft", [{ id: "own", name: "Haul", group: "service", quantity: "1", unit: "ea", unitPriceCents: 5000 } as ModuleLine]);
    expect(estimateNotes(dbWith([est("e1", "draft", lines("m1"))], [M("m1", "draft")], []), est("e1", "draft", lines("m1")))).toEqual([]);
    expect(estimateNotes(dbWith([own], [M("m1", "draft")], [run("m1")]), own)).toEqual([]);
    const off = dbWith([est("e1", "draft", lines("m1"))], [M("m1", "draft")], [run("m1")], false);
    expect(estimateNotes(off, off.estimates[0]!)).toEqual([]);
  });
});
