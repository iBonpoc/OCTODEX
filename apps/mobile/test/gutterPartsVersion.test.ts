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

/** #1355: the version of the parts rule goes up with the new waste and corner defaults; the old estimates are NOT recounted silently — they are told */
describe("#1355: the parts version went up, old estimates are told, never recounted", () => {
  const LAST = "1"; // what the lines of an estimate made before #1355 carry
  const old = (status: Estimate["status"] = "draft") => estimate(linesAt(LAST) as ModuleLine[], status);
  it("the parts version is 2 (waste 10 %, an outside corner 14″)", () => {
    expect(ENGINE_VERSION).toBe("2");
    expect(engineOlder(LAST)).toBe(true);
  });
  it("an estimate made before it says «Расчёт изменился», and its lines are exactly what they were (no silent recount)", () => {
    const e = old();
    const before = JSON.stringify(e.doc!.options[0]!.lines);
    expect(engineChangedFor(e, M)).toBe(true);
    expect(measurementState({ estimates: [e] }, m, true)).toMatchObject({ engineChanged: true });
    expect(estimateAction({ estimates: [e] }, m, true)).toEqual({ kind: "update", estimateId: "e1" }); // offered, not done
    expect(JSON.stringify(e.doc!.options[0]!.lines)).toBe(before); // asking changed nothing
  });
  it("a signed estimate is only told: «Открыть», never «Обновить»", () => {
    expect(estimateAction({ estimates: [old("approved")] }, m, true)).toMatchObject({ kind: "open", signed: true });
  });
  it("only after the person's «Обновить» the lines take the current version", () => {
    const lines = old().doc!.options[0]!.lines as ModuleLine[];
    const out = resyncLines(lines, linesAt(ENGINE_VERSION) as ModuleLine[]);
    expect(engineChangedFor(estimate(out), M)).toBe(false);
  });
});
