/**
 * Spec 33 П21 (M5a): the Gutters module's data — rows of the server ↔ the phone, the module.op handler (what it sends),
 * the module's read, and the core's «is the module active on the server?» after a refused module.op (module_inactive).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { table: string; verb: string; row?: unknown; opts?: unknown; eq: [string, unknown][] };
const calls: Call[] = [];
const answer = { error: null as null | { message: string; code?: string }, modules: [] as Record<string, unknown>[], modulesError: null as null | { message: string } };
vi.mock("@/cloud/client", () => ({
  supabase: {
    from: (table: string) => {
      const c: Call = { table, verb: "", eq: [] };
      calls.push(c);
      const chain = {
        upsert: (row: unknown, opts: unknown) => ((c.verb = "upsert"), (c.row = row), (c.opts = opts), chain),
        update: (row: unknown) => ((c.verb = "update"), (c.row = row), chain),
        select: () => ((c.verb = "select"), chain),
        eq: (k: string, v: unknown) => (c.eq.push([k, v]), chain),
        maybeSingle: () => ({ then: (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) => Promise.resolve({ data: answer.modules[0] ?? null, error: answer.modulesError }).then(ok, no) }),
        then: (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) =>
          Promise.resolve(c.verb === "select" ? { data: answer.modules, error: answer.modulesError } : { error: answer.error, status: answer.error ? 403 : 201 }).then(ok, no),
      };
      return chain;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

import { applyOp, type Op } from "../src/cloud/ops";
import { registerModule, keepModuleData, loadModuleData } from "../src/modules/registry";
import gutters from "../src/modules/gutters/module";
import { dropElement, dropMeasurement, elementFromRow, gutterData, guttersOps, K, loadGutters, measurementOf, putElement, putMeasurement, withGutterData } from "../src/modules/gutters/data";
import { makeSeed } from "../src/data/seed";
import type { ElementRow, MeasurementRow } from "../src/modules/gutters/canvas/model";

registerModule(gutters);
const M: MeasurementRow = { id: "m1", label: null, status: "draft", propertyId: null, leadId: "l1" };
const E: ElementRow = { id: "e1", measurementId: "m1", kind: "run", geom: { a: [0, 0], b: [120, 0] }, attrs: { story: 1 }, confidence: "drawn" };
const op = (kind: string, payload: Record<string, unknown>): Op => ({ k: "module.op", module: "gutters", kind, payload }) as Op;
const DAY = 86_400_000;
beforeEach(() => {
  calls.length = 0;
  answer.error = null;
  answer.modules = [];
  answer.modulesError = null;
});

describe("unit:gutterData — the phone's slice", () => {
  it("absent or broken → empty; put / drop are pure; a measurement with its elements", () => {
    const db = makeSeed();
    expect(gutterData(db)).toEqual({ measurements: [], elements: [] });
    expect(gutterData({ moduleData: { gutters: { measurements: 1 } } })).toEqual({ measurements: [], elements: [] });
    let d = withGutterData(db, putMeasurement(M));
    d = withGutterData(d, putElement(E));
    d = withGutterData(d, putElement({ ...E, id: "e2" }));
    d = withGutterData(d, putElement({ ...E, attrs: { story: 2 } }));
    expect(measurementOf(gutterData(d), "m1")?.elements.map((e) => [e.id, e.attrs.story])).toEqual([["e2", 1], ["e1", 2]]);
    expect(gutterData(withGutterData(d, dropElement("e2"))).elements.map((e) => e.id)).toEqual(["e1"]);
    expect(gutterData(withGutterData(d, dropMeasurement("m1")))).toEqual({ measurements: [], elements: [] });
    expect(db.moduleData).toBeUndefined(); // the seed is not touched
  });
  it("rows of a newer version (another kind) are left out — so this version never «removes» them", () => {
    expect(elementFromRow({ id: "x", measurement_id: "m1", kind: "chain", geom: {}, attrs: {} })).toBeNull();
    expect(elementFromRow({ id: "x", measurement_id: "m1", kind: "downspout", geom: { runId: "e1", atIn: 3 }, attrs: {}, confidence: "weird" })).toMatchObject({ confidence: "drawn" });
  });
});

describe("unit:gutterData — the read (ModuleDef.load)", () => {
  it("live measurements and the elements of live ones only", async () => {
    const read = {
      live: async (table: string) =>
        table === "gutter_measurements"
          ? [{ id: "m1", lead_id: "l1", property_id: null, label: "Front", status: "ready", updated_at: "2026-11-08T00:00:00Z" }, { id: null }]
          : [{ id: "e1", measurement_id: "m1", kind: "run", geom: { a: [0, 0], b: [1, 0] }, attrs: {}, confidence: "taped" }, { id: "e9", measurement_id: "gone", kind: "run", geom: {}, attrs: {} }],
    };
    const g = await loadGutters(read);
    expect(g.measurements).toEqual([{ id: "m1", label: "Front", status: "ready", propertyId: null, leadId: "l1", updatedAt: "2026-11-08T00:00:00Z" }]);
    expect(g.elements.map((e) => [e.id, e.confidence])).toEqual([["e1", "taped"]]);
  });
  it("the core: loads a module only when the company has its row; a failed read keeps the phone's copy", async () => {
    const live = vi.fn(async () => [] as Record<string, unknown>[]);
    expect(await loadModuleData({}, { live })).toEqual({});
    expect(live).not.toHaveBeenCalled();
    const row = { enabled: false, settings: {}, rowVersion: 1 };
    expect(await loadModuleData({ gutters: row }, { live })).toEqual({ gutters: { measurements: [], elements: [] } });
    expect(await loadModuleData({ gutters: row }, { live: async () => Promise.reject(new Error("down")) })).toEqual({});
    const prev = { moduleData: { gutters: { measurements: [M], elements: [] } } };
    const next = { company: { modules: { gutters: row } }, moduleData: {} };
    expect(keepModuleData(next, prev).moduleData).toEqual(prev.moduleData);
    // read fine → the server's answer wins
    expect(keepModuleData({ ...next, moduleData: { gutters: { measurements: [], elements: [] } } }, prev).moduleData).toEqual({ gutters: { measurements: [], elements: [] } });
  });
});

describe("unit:gutterData — module.op → the server (guttersOps)", () => {
  const run = async (p: PromiseLike<{ error: unknown }>) => void (await p);
  const ctx = { companyId: "c1", userId: "u1", run };
  it("measurement.save / element.save: a full upsert of the row in my company; remove: deleted_at in my company", async () => {
    await guttersOps({ kind: K.mSave, payload: { m: M } }, ctx);
    await guttersOps({ kind: K.eSave, payload: { e: E } }, ctx);
    await guttersOps({ kind: K.eRemove, payload: { id: "e1" } }, ctx);
    await guttersOps({ kind: K.mRemove, payload: { id: "m1" } }, ctx);
    expect(calls.map((c) => [c.table, c.verb])).toEqual([
      ["gutter_measurements", "upsert"], ["gutter_measurement_elements", "upsert"], ["gutter_measurement_elements", "update"], ["gutter_measurements", "update"],
    ]);
    expect(calls[0]).toMatchObject({ row: { id: "m1", company_id: "c1", lead_id: "l1", property_id: null, label: null, status: "draft", deleted_at: null }, opts: { onConflict: "id" } });
    expect(calls[1]).toMatchObject({ row: { id: "e1", company_id: "c1", measurement_id: "m1", kind: "run", geom: E.geom, attrs: E.attrs, confidence: "drawn", deleted_at: null } });
    expect(calls[2]!.eq).toEqual([["id", "e1"], ["company_id", "c1"]]);
    expect(typeof (calls[2]!.row as { deleted_at: unknown }).deleted_at).toBe("string");
  });
  it("a broken or unknown change: the server's «no» from the phone (PermanentError), nothing sent", async () => {
    for (const [kind, payload] of [[K.mSave, {}], [K.eSave, { e: { id: "x" } }], [K.eRemove, {}], ["nope", {}]] as const)
      await expect(guttersOps({ kind, payload }, ctx)).rejects.toMatchObject({ name: "PermanentError" });
    expect(calls).toEqual([]);
  });
});

describe("unit:gutterData — a refused module.op: is the module active on the server? (spec 33 П21.1)", () => {
  const rls = { message: "new row violates row-level security policy", code: "42501" };
  it("refused and the module's trial is over → module_inactive", async () => {
    answer.error = rls;
    answer.modules = [{ module_key: "gutters", enabled: true, trial_ends_at: new Date(Date.now() - DAY).toISOString(), settings: {}, row_version: 2 }];
    await expect(applyOp(op(K.eSave, { e: E }), "c1", "u1")).rejects.toMatchObject({ name: "PermanentError", hint: "module_inactive" });
    expect(calls.at(-1)).toMatchObject({ table: "company_modules", verb: "select", eq: [["company_id", "c1"], ["module_key", "gutters"]] });
  });
  it("switched off → module_inactive too", async () => {
    answer.error = rls;
    answer.modules = [{ module_key: "gutters", enabled: false, settings: {}, row_version: 3 }];
    await expect(applyOp(op(K.eSave, { e: E }), "c1", "u1")).rejects.toMatchObject({ hint: "module_inactive" });
  });
  it("refused while active, or the check itself failed → the refusal as it was (a try)", async () => {
    answer.error = rls;
    answer.modules = [{ module_key: "gutters", enabled: true, trial_ends_at: new Date(Date.now() + DAY).toISOString(), settings: {}, row_version: 1 }];
    const e1 = await applyOp(op(K.eSave, { e: E }), "c1", "u1").catch((e) => e);
    expect(e1).toMatchObject({ name: "PermanentError", code: "42501" });
    expect(e1.hint).toBeUndefined();
    answer.modulesError = { message: "down" };
    const e2 = await applyOp(op(K.eSave, { e: E }), "c1", "u1").catch((e) => e);
    expect(e2.hint).toBeUndefined();
  });
  it("sent fine → no check at all", async () => {
    await applyOp(op(K.eSave, { e: E }), "c1", "u1");
    expect(calls.map((c) => c.table)).toEqual(["gutter_measurement_elements"]);
  });
});

describe("unit:gutterData — the canvas's store on the queue (makeModuleStore)", () => {
  const harness = (active = true) => {
    const sent: { kind: string; payload: Record<string, unknown>; coalesceKey?: string; made?: string[] }[] = [];
    const s = {
      db: makeSeed(),
      moduleOp: (_m: string, c: { kind: string; payload: Record<string, unknown>; apply: (d: never) => never; coalesceKey?: string; made?: string[] }) => {
        if (!active) return null;
        const { apply, ...rest } = c;
        sent.push(rest);
        s.db = apply(s.db as never);
        return () => {};
      },
    };
    return { s, sent };
  };
  it("a new measurement: the measurement first, then each element (key = its id); then only what changed; remove without a key", async () => {
    const { makeModuleStore } = await import("../src/modules/gutters/canvas/moduleStore");
    const { s, sent } = harness();
    const st = makeModuleStore(() => s as never, "m1", () => "2026-11-08T01:00:00Z");
    await st.save(M, { save: [E, { ...E, id: "e2" }], remove: [] });
    expect(sent.map((x) => [x.kind, x.coalesceKey])).toEqual([[K.mSave, "m1"], [K.eSave, "e1"], [K.eSave, "e2"]]);
    expect(sent[0]!.payload).toEqual({ m: M });
    expect((await st.load())?.elements.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect((await st.load())?.m.updatedAt).toBe("2026-11-08T01:00:00Z");
    sent.length = 0;
    await st.save(M, { save: [{ ...E, attrs: { story: 2 } }], remove: ["e2"] });
    expect(sent.map((x) => [x.kind, x.coalesceKey])).toEqual([[K.eSave, "e1"], [K.eRemove, undefined]]);
    expect(sent[1]!.payload).toEqual({ id: "e2" });
    sent.length = 0;
    await st.save({ ...M, label: "Back" }, { save: [], remove: [] });
    expect(sent.map((x) => x.kind)).toEqual([K.mSave]);
  });
  it("not active (founder О2): the save fails and nothing is written", async () => {
    const { makeModuleStore } = await import("../src/modules/gutters/canvas/moduleStore");
    const { s, sent } = harness(false);
    await expect(makeModuleStore(() => s as never, "m1").save(M, { save: [E], remove: [] })).rejects.toMatchObject({ name: "ModuleNotActive" });
    expect(sent).toEqual([]);
    expect(s.db.moduleData).toBeUndefined();
  });
});
