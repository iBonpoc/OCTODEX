/**
 * #1165 (found on the review of #1161): an estimate whose lines were computed by an older engine says «Расчёт изменился —
 * обновите»; a signed one is only told. The version is in the line's `source` (a line without one is not flagged — nobody knows).
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("../src/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import { computeGutterParts, DEFAULT_TAX, ENGINE_VERSION, type CustomLine, type PartQty } from "@octo/estimating-engine";
import type { CatalogItem, Estimate, EstimateDoc } from "../src/data/types";
import { linesFromParts, resyncLines, type ModuleLine } from "../src/modules/gutters/estimate";
import { engineChangedFor, engineOlder, engineStaleMeasurements, estimateAction } from "../src/modules/gutters/estimateLink";
import { measurementState } from "../src/modules/gutters/measurements";
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
  it("a signed one is told, never offered an update", () => {
    const signed = estimate(linesAt("0.0.1") as ModuleLine[], "approved");
    expect(measurementState({ estimates: [signed] }, m, true)).toMatchObject({ state: "signed", engineChanged: true });
    expect(estimateAction({ estimates: [signed] }, m, true)).toMatchObject({ kind: "open", signed: true });
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
    const db = { estimates: [e], moduleData: { gutters: { measurements: [{ id: M, status: "ready" }], elements: [] } } } as never;
    expect(engineStaleMeasurements(db, e).map((x) => x.id)).toEqual([M]);
    expect(engineStaleMeasurements(db, e, "0.0.1")).toEqual([]); // the same engine: nothing
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
