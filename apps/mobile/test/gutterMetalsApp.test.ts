/**
 * «Расход v2» PR-2 «Металлы и пайка» in the app (spec 33-gutters-consumption §5а): a copper fastener priced by the same item without a
 * metal (С7, no mark); the new parts and work have words; version 6 tells a copper draft «Расчёт изменился», never a sent or signed one,
 * and an aluminum draft is not told (С10).
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("../src/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import { computeGutterParts, DEFAULT_TAX, type CustomLine, type PartQty } from "@octo/estimating-engine";
import type { CatalogItem, DB, Estimate, EstimateDoc } from "../src/data/types";
import { findItem, LABOR_PARTS, PART_WORDS, WORK_WORDS } from "../src/modules/gutters/prices";
import { linesFromParts, type ModuleLine } from "../src/modules/gutters/estimate";
import { engineChangedFor } from "../src/modules/gutters/estimateLink";
import { toElements } from "../src/modules/gutters/canvas/model";
import { toMeasurement, type Drawing } from "../src/modules/gutters/geometry";

const screw = (id: string, attrs: Record<string, string>): CatalogItem => ({ id, kind: "material", name: `Screw ${id}`, unit: "ea", priceCents: 10, attributes: { part: "screw", screw: "10x1.5", ...attrs } });
const copperScrew = { key: "screw.copper.10x15", section: "consumables", qty: "4", unit: "ea", use: "purchase", kind: "material", attrs: { part: "screw", metal: "copper", screw: "10x1.5" } } as unknown as PartQty;

describe("металл крепежа в прайсе (М8, С7)", () => {
  it("С7: медный винт без своей позиции берёт позицию того же винта без metal; своя медная — главнее; нержавеющая — не подходит", () => {
    expect(findItem([screw("plain", {})], copperScrew)?.id).toBe("plain");
    expect(findItem([screw("plain", {}), screw("cu", { metal: "copper" })], copperScrew)?.id).toBe("cu");
    expect(findItem([screw("ss", { metal: "stainless" })], copperScrew)).toBeUndefined();
    // the line takes the plain item's price, no «нет цены», no mark
    const l = linesFromParts([{ ...copperScrew, use: "both" } as PartQty], [screw("plain", {})], () => "Screw", () => "l1")[0]!;
    expect(l.unitPriceCents).toBe(10);
    expect(l.source?.noPrice).toBeUndefined();
  });
  it("новые деталь и работа названы словами и есть в прайсе работ", () => {
    expect(PART_WORDS.has("soldering_kit")).toBe(true);
    expect(WORK_WORDS.has("solder")).toBe(true);
    expect(LABOR_PARTS.some((p) => p.key === "labor.solder")).toBe(true);
  });
});

describe("версия 6: черновик меди получает «Расчёт изменился», отправленная и подписанная — нет, алюминий — нет (С10)", () => {
  const M = "m1";
  const drawing = (material: string): Drawing => ({
    runs: [{ id: "r1", a: [0, 0], b: [240, 0], attrs: { profile: "k", size: "6", material, ...(material === "copper" ? {} : { color: "white" }), story: 1, mount: "fascia", hanger: "hidden" } }],
    downspouts: [],
  });
  const dbOf = (d: Drawing) => ({ moduleData: { gutters: { measurements: [{ id: M, label: null, status: "ready", propertyId: null, leadId: "l" }], elements: toElements(d, M) } } }) as unknown as Partial<DB>;
  /** the estimate's lines as version 5 wrote them: copper had solder (lb) and flux, no kit and no soldering work */
  const v5Lines = (d: Drawing): ModuleLine[] => {
    const now = computeGutterParts(toMeasurement(d, { method: "cut" })).parts;
    const old = now.flatMap((p): PartQty[] =>
      p.key === "soldering_kit" ? [{ ...p, key: "solder", unit: "lb", attrs: { part: "solder" } }, { ...p, key: "flux", attrs: { part: "flux" } }] : p.key === "labor.solder" ? [] : [p],
    );
    return linesFromParts(old, [], (p) => p.key, (() => { let n = 0; return () => `l${++n}`; })(), "rev", M, "2026-11-12T10:00:00Z", "5");
  };
  const est = (lines: ModuleLine[], status: Estimate["status"]): Estimate =>
    ({ id: "e1", status, doc: { options: [{ id: "o1", name: "O", lines: lines as CustomLine[] }], settings: { discount: null, tax: DEFAULT_TAX, deposit: { kind: "none" } } } as EstimateDoc }) as unknown as Estimate;

  it("медь: черновик — «Расчёт изменился»; отправленная и подписанная — снимок, ничего не говорится", () => {
    const d = drawing("copper");
    const lines = v5Lines(d);
    expect(engineChangedFor(est(lines, "draft"), M, undefined, dbOf(d))).toBe(true);
    for (const s of ["sent", "approved"] as Estimate["status"][]) {
      const e = est(lines, s);
      const before = JSON.stringify(e.doc);
      expect(engineChangedFor(e, M, undefined, dbOf(d))).toBe(false);
      expect(JSON.stringify(e.doc)).toBe(before);
    }
  });
  it("алюминий: черновик версии 5 не меняется — ничего не говорится", () => {
    const d = drawing("alu_032");
    expect(engineChangedFor(est(v5Lines(d), "draft"), M, undefined, dbOf(d))).toBe(false);
  });
});
