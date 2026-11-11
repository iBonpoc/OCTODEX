/**
 * unit:gutterDuplicate — the measurement's card «⋯» (spec 33 П25.3 Б1, Г; PR-H2): «Дублировать» makes a draft copy with
 * new ids (a downspout follows its gutter), the same link and accuracy, no estimate; one «Отменить» takes all of it back;
 * «Точность замера» changes only the measurement's own field (its status stays). The module not active — nothing.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/cloud/ops", () => ({ PermanentError: class extends Error {}, uploadPhoto: () => null }));
import { copyRows, duplicateMeasurement, gutterData, K, setAccuracy } from "../src/modules/gutters/data";
import { measurementState } from "../src/modules/gutters/measurements";
import type { DB } from "../src/data/types";

const M = { id: "m1", label: null, status: "ready" as const, propertyId: "p1", leadId: "l1", accuracy: "tape" as const, updatedAt: "2026-11-10T10:00:00Z" };
const EL = [
  { id: "r1", measurementId: "m1", kind: "run" as const, geom: { a: [0, 0], b: [120, 0] }, attrs: { size: "5" }, confidence: "drawn" as const },
  { id: "r2", measurementId: "m1", kind: "run" as const, geom: { a: [120, 0], b: [120, 96] }, attrs: {}, confidence: "drawn" as const },
  { id: "d1", measurementId: "m1", kind: "downspout" as const, geom: { runId: "r2", atIn: 90 }, attrs: { size: "2x3" }, confidence: "drawn" as const },
];
const other = { id: "m9", label: null, status: "draft" as const, propertyId: null, leadId: null };

/** a store like the core's: each op applied at once, its «Отменить» puts the db back as it was before it */
function fakeStore(active = true) {
  const s = {
    db: { moduleData: { gutters: { measurements: [M, other], elements: EL } }, estimates: [] } as unknown as DB,
    ops: [] as { kind: string; payload: Record<string, unknown> }[],
    moduleOp(_m: string, ch: { kind: string; payload: Record<string, unknown>; apply: (d: DB) => DB }) {
      if (!active) return null;
      const before = s.db;
      s.db = ch.apply(s.db);
      s.ops.push({ kind: ch.kind, payload: ch.payload });
      return () => {
        s.db = before;
        s.ops.pop();
      };
    },
  };
  return s;
}
let n = 0;
const ids = () => `new-${++n}`;

describe("copyRows: the copy's rows (pure)", () => {
  it("new ids everywhere, the downspout on its gutter's new id, a draft with the same link and accuracy", () => {
    n = 0;
    const c = copyRows(M, EL, ids);
    expect(c.m).toEqual({ id: "new-1", label: null, status: "draft", propertyId: "p1", leadId: "l1", accuracy: "tape" });
    expect(c.elements.map((e) => [e.id, e.measurementId, e.kind])).toEqual([["new-2", "new-1", "run"], ["new-3", "new-1", "run"], ["new-4", "new-1", "downspout"]]);
    expect(c.elements[2]!.geom).toEqual({ runId: "new-3", atIn: 90 });
    // the original rows are not touched
    expect(EL[2]!.geom).toEqual({ runId: "r2", atIn: 90 });
    c.elements[0]!.attrs.size = "6";
    expect(EL[0]!.attrs.size).toBe("5");
  });
});

describe("duplicateMeasurement («Дублировать»)", () => {
  it("writes the measurement first, then its elements; no estimate of the copy («Без сметы»)", () => {
    n = 0;
    const st = fakeStore();
    const r = duplicateMeasurement(st, "m1", ids, () => "2026-11-11T12:00:00Z")!;
    expect(r.id).toBe("new-1");
    expect(st.ops.map((o) => o.kind)).toEqual([K.mSave, K.eSave, K.eSave, K.eSave]);
    const g = gutterData(st.db);
    const copy = g.measurements.find((m) => m.id === "new-1")!;
    expect(copy).toMatchObject({ status: "draft", leadId: "l1", propertyId: "p1", accuracy: "tape", updatedAt: "2026-11-11T12:00:00Z" });
    expect(g.elements.filter((e) => e.measurementId === "new-1")).toHaveLength(3);
    expect(g.elements.filter((e) => e.measurementId === "m1")).toHaveLength(3);
    expect(measurementState(st.db, copy, true).state).toBe("noEstimate");
  });
  it("one «Отменить» takes the copy and all its elements back", () => {
    const st = fakeStore();
    const before = st.db;
    duplicateMeasurement(st, "m1", ids)!.undo();
    expect(st.db).toBe(before);
    expect(st.ops).toEqual([]);
  });
  it("a measurement the phone does not have, or the module not active — nothing", () => {
    expect(duplicateMeasurement(fakeStore(), "nope", ids)).toBeNull();
    expect(duplicateMeasurement(fakeStore(false), "m1", ids)).toBeNull();
  });
});

describe("setAccuracy («Точность замера» on the card)", () => {
  it("only the measurement's own field; the status (made into an estimate) stays", () => {
    const st = fakeStore();
    const undo = setAccuracy(st, "m1", "rough");
    expect(gutterData(st.db).measurements.find((m) => m.id === "m1")).toMatchObject({ accuracy: "rough", status: "ready" });
    expect(st.ops).toEqual([{ kind: K.mSave, payload: { m: { id: "m1", label: null, status: "ready", propertyId: "p1", leadId: "l1", accuracy: "rough" } } }]);
    undo!();
    expect(gutterData(st.db).measurements.find((m) => m.id === "m1")?.accuracy).toBe("tape");
  });
  it("the same accuracy, or an unknown measurement — no write (an old one without accuracy is rough)", () => {
    const st = fakeStore();
    expect(setAccuracy(st, "m1", "tape")).toBeNull();
    expect(setAccuracy(st, "m9", "rough")).toBeNull();
    expect(setAccuracy(st, "nope", "tape")).toBeNull();
    expect(st.ops).toEqual([]);
  });
});
