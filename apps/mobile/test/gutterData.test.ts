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
    expect(g.measurements).toEqual([{ id: "m1", label: "Front", status: "ready", propertyId: null, leadId: "l1", accuracy: "rough", updatedAt: "2026-11-08T00:00:00Z" }]);
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

describe("review M5a: fixes", () => {
  const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const MID = U(1), A = U(2), B = U(3);
  const ME = { userId: "u1", companyId: "c1" };
  const save = (e: string, x: number) =>
    ({ k: "module.op", module: "gutters", kind: K.eSave, payload: { e: { ...E, id: e, measurementId: MID, geom: { a: [0, 0], b: [x, 0] } } }, coalesceKey: e, made: [e] }) as Op;
  const it_ = (id: string, op: Op, owner: object | null = ME) => ({ id, op, at: "2026-11-08T00:00:00Z", tries: 0, ...(owner ? { owner } : {}) });

  it("№2: moves of one element of a measurement are one waiting write, though every element points at the measurement (real UUIDs)", async () => {
    const { coalesceAt } = await import("../src/data/outboxCoalesce");
    const mSave = { k: "module.op", module: "gutters", kind: K.mSave, payload: { m: { ...M, id: MID } }, coalesceKey: MID, made: [MID] } as Op;
    const q = [it_("m", mSave), it_("a", save(A, 10)), it_("b", save(B, 20))] as never[];
    expect(coalesceAt(q, save(A, 30), ME, null)).toBe(1);
    expect(coalesceAt(q, save(B, 40), ME, null)).toBe(2);
    // the measurement's own later write: its elements after it refer to what it makes — it goes to the end
    expect(coalesceAt(q, mSave, ME, null)).toBe(-1);
    // a remove of A after A's save: the newer save of A goes after it (else the remove would delete the newer)
    const rm = { k: "module.op", module: "gutters", kind: K.eRemove, payload: { id: A } } as Op;
    expect(coalesceAt([...q, it_("r", rm)] as never[], save(A, 50), ME, null)).toBe(-1);
  });

  it("dropModuleOps: only my ops of that module; others', another module's and the core's stay; owner-less ones are mine (they go as mine)", async () => {
    const { dropModuleOps, moduleRejected } = await import("../src/data/outboxRejected");
    const other = { k: "module.op", module: "roofing", kind: "x", payload: {} } as Op;
    const core = { k: "note.add" } as unknown as Op;
    const q = [it_("1", save(A, 1)), it_("2", save(B, 1), { userId: "u2", companyId: "c1" }), it_("3", other), it_("4", core), it_("5", save(A, 2), null)] as never[];
    const { kept, gone } = dropModuleOps(q, "gutters", ME);
    expect(gone.map((x: { id: string }) => x.id)).toEqual(["1", "5"]);
    expect(kept.map((x: { id: string }) => x.id)).toEqual(["2", "3", "4"]);
    // one card per module and person; a second batch adds to its count
    const one = moduleRejected([], "gutters", 2, "no", 1000, ME, "mod.gutters.rejected");
    const two = moduleRejected(one, "gutters", 3, "no", 2000, ME, "mod.gutters.rejected");
    expect(two).toHaveLength(1);
    expect(two[0]).toMatchObject({ what: "module", module: "gutters", count: 5, href: "/company/modules", labelKey: "mod.gutters.rejected", owner: ME });
    expect(moduleRejected(two, "gutters", 1, "no", 3000, { userId: "u2", companyId: "c1" })).toHaveLength(2);
  });

  it("№3: the card tells a tech to ask the owner and gives no «Открыть» to a screen he cannot open", async () => {
    const { rejectedHint, rejectedOpens } = await import("../src/features/attention");
    const r = { what: "module" as const, href: "/company/modules" };
    expect(rejectedHint(r, "director")).toBe("sync.rejected.moduleHint");
    expect(rejectedOpens(r, "director")).toBe(true);
    for (const role of ["tech", "sales"] as const) {
      expect(rejectedHint(r, role)).toBe("sync.rejected.moduleHintAsk");
      expect(rejectedOpens(r, role)).toBe(false);
    }
    expect(rejectedHint({ what: "payment", href: "/invoice/i1" }, "tech")).toBe("sync.rejected.hint");
  });

  const harness = () => {
    const sent: { kind: string; payload: Record<string, unknown> }[] = [];
    const s = {
      db: makeSeed(),
      moduleOp: (_m: string, c: { kind: string; payload: Record<string, unknown>; apply: (d: never) => never }) => {
        sent.push({ kind: c.kind, payload: c.payload });
        s.db = c.apply(s.db as never);
        return () => {};
      },
    };
    return { s, sent };
  };
  it("№1: what the server changed meanwhile (a lead linked, a label) is kept — the canvas sends only its own changes", async () => {
    const { makeModuleStore } = await import("../src/modules/gutters/canvas/moduleStore");
    const { s, sent } = harness();
    s.db = withGutterData(s.db, putMeasurement({ ...M, leadId: null }));
    const st = makeModuleStore(() => s as never, "m1");
    const opened = (await st.load())!.m;
    // the office linked the lead and named it; the next read brought it
    s.db = withGutterData(s.db, putMeasurement({ ...opened, leadId: "l9", label: "Front" }));
    await st.save(opened, { save: [E], remove: [] });
    expect(sent.map((x) => x.kind)).toEqual([K.eSave]); // the measurement is not written back
    // the phone changes its property: the row it sends keeps the server's lead and label
    sent.length = 0;
    await st.save({ ...opened, propertyId: "p7" }, { save: [], remove: [] });
    expect(sent).toEqual([{ kind: K.mSave, payload: { m: { id: "m1", label: "Front", status: "draft", propertyId: "p7", leadId: "l9" } } }]);
  });
  it("M8b: the status is the store's — a stale screen never sets it back; a change of the drawing after «Смета» makes it a draft", async () => {
    const { makeModuleStore } = await import("../src/modules/gutters/canvas/moduleStore");
    const { s, sent } = harness();
    s.db = withGutterData(s.db, putMeasurement({ ...M }));
    const st = makeModuleStore(() => s as never, "m1");
    const opened = (await st.load())!.m; // a draft on the screen
    // «Смета» made it ready meanwhile
    s.db = withGutterData(s.db, putMeasurement({ ...opened, status: "ready" }));
    await st.save(opened, { save: [], remove: [] });
    expect(sent).toEqual([]); // the screen's old «draft» is not written
    await st.save(opened, { save: [E], remove: [] });
    expect(sent.map((x) => [x.kind, (x.payload.m as { status?: string } | undefined)?.status])).toEqual([[K.mSave, "draft"], [K.eSave, undefined]]);
    // already a draft: a next change of the drawing writes no row
    s.db = withGutterData(s.db, putMeasurement({ ...opened, status: "draft" }));
    sent.length = 0;
    await st.save(opened, { save: [], remove: ["e1"] });
    expect(sent.map((x) => x.kind)).toEqual([K.eRemove]);
  });
  it("№4: the store lost the measurement (its waiting changes were dropped) — the next save sends it whole with every element", async () => {
    const { makeModuleStore } = await import("../src/modules/gutters/canvas/moduleStore");
    const { s, sent } = harness();
    const st = makeModuleStore(() => s as never, "m1");
    await st.save(M, { save: [E], remove: [] }, [E]);
    s.db = { ...s.db, moduleData: {} }; // dropped
    sent.length = 0;
    const e2 = { ...E, id: "e2" };
    await st.save(M, { save: [e2], remove: [] }, [E, e2]);
    expect(sent.map((x) => [x.kind, (x.payload.e as { id?: string } | undefined)?.id])).toEqual([[K.mSave, undefined], [K.eSave, "e1"], [K.eSave, "e2"]]);
  });
});

describe("unit:gutterData — M5b: places and «Сделать заявкой» (S4g, S1b)", () => {
  const on = { modules: { gutters: { enabled: true, trialEndsAt: new Date(Date.now() + DAY).toISOString(), settings: {}, rowVersion: 1 } } };
  const g = (ms: Partial<MeasurementRow>[]) => ({ measurements: ms.map((m, i) => ({ ...M, id: `m${i}`, leadId: null, ...m })), elements: [] });
  it("lead: no measurement → «Замер» linked to the lead (and its property); one or more → «Открыть замер» the newest", async () => {
    const { placeActions } = await import("../src/modules/registry");
    const ctx = { role: "tech" as const, leadId: "l1", propertyId: "p1" };
    expect(placeActions("lead", on, ctx, undefined, {})).toEqual([expect.objectContaining({ labelKey: "mod.gutters.measure", href: "/module/gutters/draw?lead=l1&property=p1", module: "gutters" })]);
    const data = { gutters: g([{ leadId: "l1", updatedAt: "2026-11-01" }, { leadId: "l1", updatedAt: "2026-11-05" }, { leadId: "l2", updatedAt: "2026-11-09" }]) };
    expect(placeActions("lead", on, ctx, undefined, data)).toEqual([expect.objectContaining({ labelKey: "mod.gutters.measureOpen", href: "/module/gutters/draw?m=m1" })]);
    expect(placeActions("lead", on, { role: "director" }, undefined, data)).toEqual([]);
  });
  it("M8b: something drawn on the lead's measurement → also «Смета из замера» (the canvas makes or updates it)", async () => {
    const { placeActions } = await import("../src/modules/registry");
    const ctx = { role: "sales" as const, leadId: "l1" };
    const data = { gutters: { ...g([{ leadId: "l1" }]), elements: [{ ...E, measurementId: "m0" }] } };
    expect(placeActions("lead", on, ctx, undefined, data).map((a) => [a.labelKey, a.href])).toEqual([
      ["mod.gutters.measureOpen", "/module/gutters/draw?m=m0"],
      ["mod.gutters.est.fromLead", "/module/gutters/draw?m=m0&estimate=1"],
    ]);
  });
  it("property: its own measurements; home: «Замерить здесь» — a new draft; nothing while the module is not active", async () => {
    const { placeActions } = await import("../src/modules/registry");
    const data = { gutters: g([{ propertyId: "p1" }]) };
    expect(placeActions("property", on, { role: "sales", propertyId: "p1" }, undefined, data)[0]).toMatchObject({ href: "/module/gutters/draw?m=m0" });
    expect(placeActions("property", on, { role: "sales", propertyId: "p2" }, undefined, data)[0]).toMatchObject({ href: "/module/gutters/draw?property=p2" });
    expect(placeActions("home", on, { role: "tech" })).toEqual([
      expect.objectContaining({ id: "here", labelKey: "mod.gutters.measureHere", href: "/module/gutters/draw" }),
      // «Замеры» (founder 09.11): every measurement, the drafts too
      expect.objectContaining({ id: "list", labelKey: "mod.gutters.list.action", href: "/module/gutters/list" }),
    ]);
    expect(placeActions("home", { modules: {} }, { role: "tech" })).toEqual([]);
  });
  it("«Замеры» is a tab (bottom tabs, side menu) only while the module is usable — for every role", async () => {
    const { moduleTabs } = await import("../src/modules/registry");
    for (const role of ["director", "dispatcher", "sales", "tech"] as const) {
      expect(moduleTabs(on, role)).toEqual([expect.objectContaining({ tabId: "module-gutters-list", labelKey: "mod.gutters.list.tab", href: "/module/gutters/list" })]);
    }
    expect(moduleTabs({ modules: {} }, "director")).toEqual([]);
    expect(moduleTabs({ modules: { gutters: { ...on.modules.gutters, enabled: false } } }, "director")).toEqual([]);
  });
  it("linkLead: the new lead takes the saved draft (one full write of the measurement, «Отменить» back); already on a lead or never saved — nothing", async () => {
    const { linkLead } = await import("../src/modules/gutters/data");
    const sent: { kind: string; payload: Record<string, unknown>; coalesceKey?: string }[] = [];
    let undone = 0;
    const s = {
      db: withGutterData(makeSeed(), putMeasurement({ ...M, leadId: null, label: "Draft" })),
      moduleOp: (_k: string, c: { kind: string; payload: Record<string, unknown>; apply: (d: never) => never; coalesceKey?: string }) => {
        sent.push({ kind: c.kind, payload: c.payload, coalesceKey: c.coalesceKey });
        s.db = c.apply(s.db as never);
        return () => void (undone += 1);
      },
    };
    const undo = linkLead(s as never, "m1", "lead-9");
    expect(sent).toEqual([{ kind: K.mSave, payload: { m: { id: "m1", label: "Draft", status: "draft", propertyId: null, leadId: "lead-9" } }, coalesceKey: "m1" }]);
    expect(gutterData(s.db).measurements[0]!.leadId).toBe("lead-9");
    undo!();
    expect(undone).toBe(1);
    expect(linkLead(s as never, "m1", "lead-10")).toBeNull(); // on a lead now
    expect(linkLead(s as never, "nope", "lead-10")).toBeNull();
    expect(sent).toHaveLength(1);
  });
});

describe("unit:gutterData — M5d: photos of a measurement and its element (spec 33 П21.10)", () => {
  const run = async (p: PromiseLike<{ error: unknown }>) => void (await p);
  const ctx = { companyId: "c1", userId: "u1", run };
  it("photo.add: a files row on the measurement and the element, a repeat changes nothing; photo.remove: deleted_at", async () => {
    await guttersOps({ kind: K.pAdd, payload: { f: { id: "f1", measurementId: "m1", elementId: "e1", uri: null } } }, ctx);
    await guttersOps({ kind: K.pAdd, payload: { f: { id: "f2", measurementId: "m1", elementId: null } } }, ctx);
    await guttersOps({ kind: K.pRemove, payload: { id: "f1" } }, ctx);
    expect(calls.map((c) => [c.table, c.verb])).toEqual([["files", "upsert"], ["files", "upsert"], ["files", "update"]]);
    expect(calls[0]).toMatchObject({ row: { id: "f1", company_id: "c1", kind: "photo", measurement_id: "m1", element_id: "e1" }, opts: { onConflict: "id", ignoreDuplicates: true } });
    expect(calls[1]).toMatchObject({ row: { id: "f2", measurement_id: "m1", element_id: null } });
    expect(calls[2]!.eq).toEqual([["id", "f1"], ["company_id", "c1"]]);
  });
  it("photo.add with a photo on the phone: the core's upload runs (a photo gone from the phone → marked failed, not retried)", async () => {
    await guttersOps({ kind: K.pAdd, payload: { f: { id: "f3", measurementId: "m1", uri: "nope://gone.jpg" } } }, ctx);
    expect(calls.map((c) => [c.table, c.verb])).toEqual([["files", "upsert"], ["files", "update"]]);
    expect(calls[1]!.row).toEqual({ upload_status: "failed" });
  });
  it("a broken photo change: PermanentError, nothing sent", async () => {
    for (const payload of [{}, { f: { id: "x" } }, { f: { measurementId: "m1" } }]) await expect(guttersOps({ kind: K.pAdd, payload }, ctx)).rejects.toMatchObject({ name: "PermanentError" });
    await expect(guttersOps({ kind: K.pRemove, payload: {} }, ctx)).rejects.toMatchObject({ name: "PermanentError" });
    expect(calls).toEqual([]);
  });
  it("photosOf / addPhoto / removePhoto: on the phone at once in DB.files; the measurement's own vs an element's", async () => {
    const { addPhoto, photosOf, removePhoto } = await import("../src/modules/gutters/data");
    let db = makeSeed();
    const sent: { kind: string; payload: Record<string, unknown>; made?: string[] }[] = [];
    const store = {
      get db() { return db; },
      moduleOp: (_m: string, ch: { kind: string; payload: Record<string, unknown>; apply: (d: typeof db) => typeof db; made?: string[] }) => {
        const before = db;
        db = ch.apply(db);
        sent.push(ch);
        return () => { db = before; };
      },
    };
    addPhoto(store, { id: "p1", measurementId: "m1", at: "2026-11-08T10:00:00Z", uri: "file:///a.jpg" });
    addPhoto(store, { id: "p2", measurementId: "m1", elementId: "e1", at: "2026-11-08T10:01:00Z" });
    addPhoto(store, { id: "p3", measurementId: "m2", at: "2026-11-08T10:02:00Z" });
    expect(photosOf(db, "m1").map((f) => f.id)).toEqual(["p1"]);
    expect(photosOf(db, "m1", "e1").map((f) => f.id)).toEqual(["p2"]);
    expect(photosOf(db, "m1")[0]).toMatchObject({ kind: "photo", uri: "file:///a.jpg" });
    expect(sent[0]).toMatchObject({ kind: K.pAdd, payload: { f: { id: "p1", measurementId: "m1", elementId: null, uri: "file:///a.jpg" } }, made: ["p1"] });
    const undo = removePhoto(store, "p2") as () => void;
    expect(photosOf(db, "m1", "e1")).toEqual([]);
    undo();
    expect(photosOf(db, "m1", "e1").map((f) => f.id)).toEqual(["p2"]);
  });
  it("the queue: a newer write of an element never jumps ahead of a photo that names it (real UUIDs)", async () => {
    const { coalesceAt } = await import("../src/data/outboxCoalesce");
    const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const MID = U(1), A = U(2), F = U(3);
    const ME = { userId: "u1", companyId: "c1" };
    const save = (x: number) => ({ k: "module.op", module: "gutters", kind: K.eSave, payload: { e: { ...E, id: A, measurementId: MID, geom: { a: [0, 0], b: [x, 0] } } }, coalesceKey: A, made: [A] }) as Op;
    const photo = { k: "module.op", module: "gutters", kind: K.pAdd, payload: { f: { id: F, measurementId: MID, elementId: A } }, made: [F] } as Op;
    const it_ = (id: string, o: Op) => ({ id, op: o, at: "2026-11-08T00:00:00Z", tries: 0, owner: ME });
    // the element's save, then its photo: a later save of the element goes to the end, after the photo
    expect(coalesceAt([it_("a", save(10)), it_("p", photo)] as never[], save(20), ME, null)).toBe(-1);
    // without a photo after it, it merges as before
    expect(coalesceAt([it_("a", save(10))] as never[], save(20), ME, null)).toBe(0);
  });
});

describe("how the drawing was measured (docs/specs/33-gutters-canvas.md П20.16)", () => {
  it("a row without accuracy (an old phone, an old server row) is rough; tape stays tape; written only when the phone has it", async () => {
    const { measurementFromRow, measurementToDb } = await import("../src/modules/gutters/data");
    expect(measurementFromRow({ id: "m1", status: "draft" })!.accuracy).toBe("rough");
    expect(measurementFromRow({ id: "m1", status: "draft", accuracy: "tape" })!.accuracy).toBe("tape");
    expect(measurementFromRow({ id: "m1", status: "draft", accuracy: "laser" })!.accuracy).toBe("rough");
    // an old local copy without the field never overwrites the server's 'tape' (security review #474 №1): no column at all
    expect("accuracy" in measurementToDb({ id: "m1", label: null, status: "draft", propertyId: null, leadId: null }, "c1")).toBe(false);
    expect(measurementToDb({ id: "m1", label: null, status: "draft", propertyId: null, leadId: null, accuracy: "tape" }, "c1").accuracy).toBe("tape");
  });
});
