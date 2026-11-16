/**
 * (ENGINE_VERSION below is the gutter parts rule's version, GUTTER_PARTS_VERSION: the core's own ENGINE_VERSION does not mark estimates)
 * #1165 (found on the review of #1161): an estimate whose lines were computed by an older engine says «Расчёт изменился —
 * обновите». The version is in the line's `source` (a line without one is not flagged — nobody knows).
 * #1776 (director №13, 16.11): only a draft is told, and only when «Обновить» would change its lines; a sent estimate stays as it
 * went to the client, a signed one is never changed.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("../src/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import { computeGutterParts, DEFAULT_TAX, GUTTER_PARTS_VERSION as ENGINE_VERSION, type CustomLine, type PartQty } from "@octo/estimating-engine";
import type { CatalogItem, Estimate, EstimateDoc } from "../src/data/types";
import { linesFromParts, resyncLines, type ModuleLine } from "../src/modules/gutters/estimate";
import { engineChangedFor, engineOlder, engineStaleMeasurements, estimateAction } from "../src/modules/gutters/estimateLink";
import { measurementState } from "../src/modules/gutters/measurements";
import { fromElements, toElements } from "../src/modules/gutters/canvas/model";
type DsPatch = { shape?: string; size?: string; dsStyle?: string; elbows?: { style: string; qty: number }[] };
import { toMeasurement } from "../src/modules/gutters/geometry";
import { readRules, toRulesOverride } from "../src/modules/gutters/settings";
import { linesNowOf } from "../src/modules/gutters/estimateLink";
import { laborRows, materialRows, missingItems, sampleJob } from "../src/modules/gutters/prices";

const C = "11111111-1111-4111-8111-111111111111";
const name = (p: PartQty) => `${p.attrs.part ?? p.attrs.work ?? p.key}`;
let n = 0;
const uid = () => `l${++n}`;
const parts = computeGutterParts(sampleJob({})).parts;
const catalog: CatalogItem[] = missingItems(C, [...materialRows({}), ...laborRows()], [], name).map((it) => ({ ...it, placeholder: false, priceCents: 1234, ...(it.kind === "material" ? { costCents: 1234, vendorTaxBps: 0, markupBps: 0 } : {}) }));
const M = "m1";
const linesAt = (v?: string) => linesFromParts(parts, catalog, name, uid, "rev1", M, "2026-11-12T10:00:00Z", v);
const estimate = (lines: readonly (CustomLine | ModuleLine)[], status: Estimate["status"] = "draft"): Estimate =>
  ({ id: "e1", status, doc: { options: [{ id: "o1", name: "O", lines: lines as CustomLine[] }], settings: { discount: null, tax: DEFAULT_TAX, deposit: { kind: "none" } } } as EstimateDoc }) as unknown as Estimate;
const m = { id: M, status: "ready" as const, leadId: "l", propertyId: null };

describe("engine versions", () => {
  it("older by number, not by text: 0.1.3 < 0.1.10 < 0.2.0; equal or newer is not older", () => {
    expect(engineOlder("0.1.3", "0.1.10")).toBe(true);
    expect(engineOlder("0.1.10", "0.2.0")).toBe(true);
    expect(engineOlder("0.0.9", "0.1.0")).toBe(true);
    expect(engineOlder("0.1.3", "0.1.3")).toBe(false);
    expect(engineOlder("0.2.0", "0.1.9")).toBe(false);
    expect(engineOlder("1", "1.0.1")).toBe(true);
  });
  it("no version, or one that cannot be read, is not older (an old line: nobody knows)", () => {
    for (const v of [undefined, null, "", "x", "0.1", "v1", 3]) expect(engineOlder(v as never, "9.9.9"), String(v)).toBe(v === "0.1");
  });
  it("«Смета» writes the current version into every line it makes", () => {
    const ls = linesAt(ENGINE_VERSION);
    expect(ls.length).toBeGreaterThan(0);
    for (const l of ls) expect((l.source as { engineVersion?: string }).engineVersion).toBe(ENGINE_VERSION);
    for (const l of linesAt()) expect((l.source as { engineVersion?: string }).engineVersion).toBeUndefined();
  });
});

describe("an estimate of an older engine", () => {
  const old = (v: string) => estimate(linesAt(v) as ModuleLine[]);
  it("the measurement's state says engineChanged for an older version, not for the same or none", () => {
    expect(measurementState({ estimates: [old("0.0.1")] }, m, true)).toMatchObject({ state: "estimate", engineChanged: true, changed: false });
    expect(measurementState({ estimates: [old(ENGINE_VERSION)] }, m, true).engineChanged).toBe(false);
    expect(measurementState({ estimates: [estimate(linesAt() as ModuleLine[])] }, m, true).engineChanged).toBe(false);
    expect(measurementState({ estimates: [] }, m, true).engineChanged).toBe(false);
  });
  it("a signed one is not told (#1776: never changed, nothing to update) and never offered an update", () => {
    const signed = estimate(linesAt("0.0.1") as ModuleLine[], "approved");
    expect(measurementState({ estimates: [signed] }, m, true)).toMatchObject({ state: "signed", engineChanged: false });
    expect(estimateAction({ estimates: [signed] }, m, true)).toMatchObject({ kind: "open", signed: true });
  });
  it("a sent one is not told and not offered «Обновить» for the engine (#1776): it stays as it went to the client", () => {
    for (const st of ["sent"] as const) {
      const e = estimate(linesAt("0.0.1") as ModuleLine[], st);
      expect(engineChangedFor(e, M), st).toBe(false);
      expect(measurementState({ estimates: [e] }, m, true).engineChanged, st).toBe(false);
      expect(estimateAction({ estimates: [e] }, m, true), st).toEqual({ kind: "open", estimateId: "e1" });
    }
  });
  it("the estimate button says «Обновить» for an older engine though the drawing is as it was; «Открыть» for the same", () => {
    expect(estimateAction({ estimates: [old("0.0.1")] }, m, true)).toEqual({ kind: "update", estimateId: "e1" });
    expect(estimateAction({ estimates: [old(ENGINE_VERSION)] }, m, true)).toEqual({ kind: "open", estimateId: "e1" });
  });
  it("only the measurement's own lines count (another measurement's old line does not flag this one)", () => {
    const other = linesFromParts(parts, catalog, name, uid, "rev2", "m2", "2026-11-12T10:00:00Z", "0.0.1") as ModuleLine[];
    const e = estimate([...(linesAt(ENGINE_VERSION) as ModuleLine[]), ...other]);
    expect(engineChangedFor(e, M)).toBe(false);
    expect(engineChangedFor(e, "m2")).toBe(true);
  });
  it("engineStaleMeasurements: the estimate is still the measurement's, the version older (a newer estimate took over → not this one's)", () => {
    const e = old("0.0.1");
    const db = { estimates: [e], moduleData: { gutters: { measurements: [{ id: M, status: "ready" }], elements: [{ id: "x", measurementId: M, kind: "run", geom: { a: [0, 0], b: [120, 0] }, attrs: {} }] } } } as never;
    expect(engineStaleMeasurements(db, e).map((x) => x.id)).toEqual([M]);
    expect(engineStaleMeasurements(db, e, "0.0.1")).toEqual([]); // the same engine: nothing
  });
  it("a copy of the same part (split by hand) gets the current version too: the note goes after «Обновить» (review of #1212)", () => {
    const e = old("0.0.1");
    const lines = e.doc!.options[0]!.lines as ModuleLine[];
    const copy = { ...lines[0]!, id: "copy1", quantity: "5" } as ModuleLine; // the same key: the person's own copy
    const out = resyncLines([...lines, copy], linesAt(ENGINE_VERSION) as ModuleLine[]);
    expect(out.some((l) => l.id === "copy1")).toBe(true);
    for (const l of out) expect((l.source as { engineVersion?: string }).engineVersion, l.name).toBe(ENGINE_VERSION);
    expect(engineChangedFor(estimate(out), M)).toBe(false);
  });
  it("«Обновить» brings the current version, also on a line kept by hand but no longer computed", () => {
    const e = old("0.0.1");
    const lines = e.doc!.options[0]!.lines as ModuleLine[];
    lines[0] = { ...lines[0]!, quantity: "99" } as ModuleLine; // a hand change
    const next = linesAt(ENGINE_VERSION).slice(1) as ModuleLine[]; // the first part is not computed any more
    const out = resyncLines(lines, next);
    for (const l of out) expect((l.source as { engineVersion?: string }).engineVersion, l.name).toBe(ENGINE_VERSION);
  });
});

describe("the note on the estimate (module.estimateNotes)", () => {
  it("an older rule gives the engine note; a drawing changed after the estimate gives only the drawing's (not two buttons that do the same)", async () => {
    const gutters = (await import("../src/modules/gutters/module")).default;
    const e = estimate(linesAt("0.0.1") as ModuleLine[]);
    const mk = (status: "ready" | "draft") => ({ estimates: [e], moduleData: { gutters: { measurements: [{ id: M, status }], elements: [{ id: "x", measurementId: M, kind: "run", geom: {}, attrs: {} }] } } }) as never;
    const ready = gutters.estimateNotes!(e, mk("ready"), undefined);
    expect(ready.map((x) => x.id)).toEqual(["engine"]);
    const draft = gutters.estimateNotes!(e, mk("draft"), undefined);
    expect(draft.map((x) => x.id)).toEqual(["stale"]);
  });
});

describe("#1776: the engine's note only where «Обновить» changes the lines, on a draft", () => {
  // one 20 ft gutter and one downspout of a kind; the lines as the engine before #1776 wrote them (a plain one had 3 × A)
  const drawing = (ds: DsPatch) => fromElements([
    { id: "r1", measurementId: M, kind: "run", geom: { a: [0, 0], b: [240, 0] }, attrs: { story: 1 } },
    { id: "d1", measurementId: M, kind: "downspout", geom: { runId: "r1", atIn: 120 }, attrs: ds },
  ] as never);
  const linesOf = (d: ReturnType<typeof drawing>, v: string) => {
    const parts = computeGutterParts(toMeasurement(d as never, { method: readRules(undefined).corner }), toRulesOverride(undefined)).parts;
    return linesFromParts(parts, catalog, name, uid, "rev1", M, "2026-11-12T10:00:00Z", v) as ModuleLine[];
  };
  const db = (d: ReturnType<typeof drawing>, e: Estimate) => ({ estimates: [e], moduleData: { gutters: { measurements: [{ id: M, status: "ready" }], elements: toElements(d as never, M) } } }) as never;
  // what version 3 counted: a plain one without elbows had 3 × A — the same as one with 3 × A given now
  const v3 = (ds: DsPatch) => (ds.elbows || ds.shape === "round" || ds.dsStyle === "corrugated" ? linesOf(drawing(ds), "3") : linesOf(drawing({ ...ds, elbows: [{ style: "A", qty: 3 }] }), "3"));
  const cases: [string, DsPatch, boolean][] = [
    ["a plain one without elbows: 3 × A go, the estimate is told", {}, true],
    ["a corrugated one: the same 3 × A — not told", { dsStyle: "corrugated" }, false],
    ["a round one: the same 3 × 45° — not told", { shape: "round", size: "3" }, false],
    ["a plain one with elbows set by hand: kept — not told", { elbows: [{ style: "A", qty: 2 }, { style: "B", qty: 1 }] }, false],
  ];
  for (const [what, ds, told] of cases) {
    it(what, () => {
      const e = estimate(v3(ds));
      const d = drawing(ds);
      expect(engineChangedFor(e, M, ENGINE_VERSION, db(d, e))).toBe(told);
      expect(measurementState(db(d, e), m, true).engineChanged).toBe(told);
      expect(estimateAction(db(d, e), m, true)).toEqual({ kind: told ? "update" : "open", estimateId: "e1" });
      expect(engineStaleMeasurements(db(d, e), e).length).toBe(told ? 1 : 0);
    });
  }
  it("«как будет» is what «Обновить» writes: after it the note is gone, and the plain one has no elbow line", () => {
    const d = drawing({});
    const e = estimate(v3({}));
    const out = resyncLines(e.doc!.options[0]!.lines as ModuleLine[], linesOf(d, ENGINE_VERSION));
    const after = estimate(out);
    expect(engineChangedFor(after, M, ENGINE_VERSION, db(d, after))).toBe(false);
    expect([...linesNowOf(db(d, after), M).keys()].some((k) => k.includes("part=elbow"))).toBe(false);
    expect(out.some((l) => (l.source as { key?: string }).key?.includes("part=elbow") && !(l.source as { gone?: boolean }).gone)).toBe(false);
  });
  it("a sent estimate with the plain one: not told, its lines (3 × A) stay as they went", () => {
    const e = estimate(v3({}), "sent");
    const d = drawing({});
    expect(engineChangedFor(e, M, ENGINE_VERSION, db(d, e))).toBe(false);
    expect(estimateAction(db(d, e), m, true)).toEqual({ kind: "open", estimateId: "e1" });
    expect(e.doc!.options[0]!.lines.some((l) => (l as ModuleLine).source?.key.includes("part=elbow") && (l as ModuleLine).source?.qty === "3")).toBe(true);
  });
  it("an emptied drawing: nothing said («Обновить» makes no lines of it, as the drawing's own note)", () => {
    const e = estimate(v3({}));
    const empty = { estimates: [e], moduleData: { gutters: { measurements: [{ id: M, status: "ready" }], elements: [] } } } as never;
    expect(engineChangedFor(e, M, ENGINE_VERSION, empty)).toBe(false);
    expect(engineStaleMeasurements(empty, e)).toEqual([]);
  });
  it("the company's own rules: an estimate counted with them, the same rules now — nothing said; the engine's defaults are not used", () => {
    const settings = { rules: { corner: "strip", wastePct: 15 } };
    const d = drawing({ dsStyle: "corrugated" });
    const parts = computeGutterParts(toMeasurement(d as never, { method: readRules(settings).corner }), toRulesOverride(settings)).parts;
    const e = estimate(linesFromParts(parts, catalog, name, uid, "rev1", M, "2026-11-12T10:00:00Z", "3") as ModuleLine[]);
    const withCo = { estimates: [e], company: { modules: { gutters: { settings } } }, moduleData: { gutters: { measurements: [{ id: M, status: "ready" }], elements: toElements(d as never, M) } } } as never;
    expect(engineChangedFor(e, M, ENGINE_VERSION, withCo)).toBe(false);
  });
  it("two options: told when one of them would change; a line kept by hand («gone») and «3» vs «3.0000» are not changes", () => {
    const d = drawing({ dsStyle: "corrugated" });
    const same = linesOf(d, "3");
    const differ = v3({});
    const two = { ...estimate(same), doc: { ...estimate(same).doc!, options: [{ id: "o1", name: "A", lines: same }, { id: "o2", name: "B", lines: differ }] } } as unknown as Estimate;
    expect(engineChangedFor(two, M, ENGINE_VERSION, db(d, two))).toBe(true);
    const both = { ...two, doc: { ...two.doc!, options: [{ id: "o1", name: "A", lines: same }, { id: "o2", name: "B", lines: same }] } } as unknown as Estimate;
    expect(engineChangedFor(both, M, ENGINE_VERSION, db(d, both))).toBe(false);
    const fmt = same.map((l) => ({ ...l, source: { ...l.source!, qty: Number(l.source!.qty).toFixed(4) } })) as ModuleLine[];
    const gone = [...fmt, { ...fmt[0]!, id: "kept", source: { ...fmt[0]!.source!, key: "ea|part=old", gone: true as const } }] as ModuleLine[];
    expect(engineChangedFor(estimate(gone), M, ENGINE_VERSION, db(d, estimate(gone)))).toBe(false);
  });
});
