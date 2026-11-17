/**
 * «Расход v2» PR-1б (spec 33-gutters-consumption §2.1–§2.3, §2.15 №1–6, Т1–Т3; К1): the money of a downspout bent on site and of
 * the estimate's downspout rounded up to 10 ft, to the cent; the parts version 5 tells a draft made by version 4 and never recounts
 * it by itself (a sent one is not told, a signed one only opened); `elbowBend` lives through saving and reading the drawing.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("../src/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import { computeGutterParts, DEFAULT_TAX, GUTTER_PARTS_VERSION, type CustomLine, type PartQty } from "@octo/estimating-engine";
import type { CatalogItem, Estimate, EstimateDoc } from "../src/data/types";
import { newDoc, optionTotals } from "../src/features/estimateDoc";
import { linesFromParts, resyncLines, type ModuleLine } from "../src/modules/gutters/estimate";
import { engineChangedFor, estimateAction } from "../src/modules/gutters/estimateLink";
import { fromElements, toElements } from "../src/modules/gutters/canvas/model";
import { toMeasurement } from "../src/modules/gutters/geometry";
import { readRules, toRulesOverride } from "../src/modules/gutters/settings";
import { dsLine, matchAttrs } from "../src/modules/gutters/prices";
import { tFor } from "../src/i18n/translate";
import { dsTotals, type SpecDs } from "../src/modules/gutters/view/spec";

const M = "m1";
const name = (p: PartQty) => `${p.attrs.part ?? p.attrs.work ?? p.key}`;
let n = 0;
const uid = () => `l${++n}`;
// a 20 ft gutter on the 2nd storey and one plain 3×4 downspout without elbows of its own: bent on site by default
const drawing = (ds: Record<string, unknown> = { dsStyle: "plain" }) => fromElements([
  { id: "r1", measurementId: M, kind: "run", geom: { a: [0, 0], b: [240, 0] }, attrs: { story: 2 } },
  { id: "d1", measurementId: M, kind: "downspout", geom: { runId: "r1", atIn: 120 }, attrs: { shape: "rect", size: "3x4", material: "aluminum", color: "white", ...ds } },
] as never);
const partsOf = (d: ReturnType<typeof drawing>, over: Record<string, unknown> = {}) =>
  computeGutterParts(toMeasurement(d as never, { method: readRules(undefined).corner }), { ...toRulesOverride(undefined), ...over }).parts;
const estimate = (lines: readonly ModuleLine[], status: Estimate["status"] = "draft"): Estimate =>
  ({ id: "e1", status, doc: { options: [{ id: "o1", name: "O", lines: lines as unknown as CustomLine[] }], settings: { discount: null, tax: DEFAULT_TAX, deposit: { kind: "none" } } } as EstimateDoc }) as unknown as Estimate;
const db = (d: ReturnType<typeof drawing>, e: Estimate) => ({ estimates: [e], moduleData: { gutters: { measurements: [{ id: M, status: "ready" }], elements: toElements(d as never, M) } } }) as never;
const m = { id: M, status: "ready" as const, leadId: "l", propertyId: null };

describe("the money of a downspout bent on site (Д1, Д6, Р4; rule 8 — the core's totals, in cents)", () => {
  const ps = partsOf(drawing());
  const ds = ps.find((p) => p.key.startsWith("ds."))!;
  const bend = ps.find((p) => p.key === "labor.bend")!;
  const item = (id: string, p: PartQty, priceCents: number): CatalogItem => ({
    id, kind: p.kind === "labor" ? "service" : "material", name: id, unit: p.unit, priceCents, ...(p.kind === "labor" ? {} : { costCents: priceCents, vendorTaxBps: 0, markupBps: 0 }), attributes: matchAttrs(p),
  } as CatalogItem);
  const lines = linesFromParts(ps, [item("ds", ds, 850), item("bend", bend, 1500)], name, uid, "r1", M) as ModuleLine[];
  const lineOf = (k: string) => lines.find((l) => l.source!.key.includes(k))!;
  it("2 storeys: 240″ + 3 bends × 6″ = 258″ → 30 ft at $8.50 = $255.00; «Гиб по месту» 3 × $15.00 = $45.00; no elbow line", () => {
    expect(lineOf("part=downspout").quantity).toBe("30");
    expect(lineOf("work=bend").quantity).toBe("3");
    expect(lines.some((l) => l.source!.key.includes("part=elbow"))).toBe(false);
    const t = optionTotals(newDoc(), { id: "o", name: "o", lines: lines as never });
    // the core's totals (rule 8): material $255.00, labor $45.00 — only the two priced lines carry money
    expect(t.groupSubtotals.material).toBe(25500);
    expect(t.groupSubtotals.labor).toBe(4500);
  });
  it("a company that bills whole feet (Н8 = 1): 258″ → 22 ft = $187.00", () => {
    const whole = linesFromParts(partsOf(drawing(), { dsRoundUpFt: 1 }), [item("ds", ds, 850)], name, uid, "r1", M) as ModuleLine[];
    expect(optionTotals(newDoc(), { id: "o", name: "o", lines: whole as never }).groupSubtotals.material).toBe(22 * 850);
  });
});

describe("Т1: the parts version 5 — told, never recounted by itself", () => {
  const d = drawing();
  // what version 4 counted for the plain one: no elbows, no bends, the feet as drawn (20 ft)
  const v4 = linesFromParts(partsOf(d, { fieldBends: 0, dsRoundUpFt: 0 }), [], name, uid, "rev1", M, "2026-11-16T10:00:00Z", "4") as ModuleLine[];
  it("the version is 5", () => expect(GUTTER_PARTS_VERSION).toBe("5"));
  it("a draft of version 4 says «Расчёт изменился», «Обновить» is offered, and asking changes nothing in it", () => {
    const e = estimate(v4);
    const before = JSON.stringify(e.doc);
    expect(engineChangedFor(e, M, GUTTER_PARTS_VERSION, db(d, e))).toBe(true);
    expect(estimateAction(db(d, e), m, true)).toEqual({ kind: "update", estimateId: "e1" });
    expect(JSON.stringify(e.doc)).toBe(before);
    expect(v4.find((l) => l.source!.key.includes("part=downspout"))!.quantity).toBe("20");
  });
  it("a sent one is not told and keeps its 20 ft; a signed one is only opened", () => {
    const sent = estimate(v4, "sent");
    expect(engineChangedFor(sent, M, GUTTER_PARTS_VERSION, db(d, sent))).toBe(false);
    expect(estimateAction(db(d, sent), m, true)).toEqual({ kind: "open", estimateId: "e1" });
    const signed = estimate(v4, "approved");
    expect(estimateAction(db(d, signed), m, true)).toMatchObject({ kind: "open", signed: true });
  });
  it("only the person's «Обновить» brings 30 ft and «Гиб по месту» 3; a price set by hand on another line stays", () => {
    const e = estimate(v4.map((l) => (l.source!.key.includes("part=outlet") ? { ...l, unitPriceCents: 4321 } : l)));
    const now = linesFromParts(partsOf(d), [], name, uid, "rev2", M, "2026-11-17T10:00:00Z", GUTTER_PARTS_VERSION) as ModuleLine[];
    const out = resyncLines(e.doc!.options[0]!.lines as ModuleLine[], now);
    expect(out.find((l) => l.source!.key.includes("part=downspout"))!.quantity).toBe("30");
    expect(out.find((l) => l.source!.key.includes("work=bend"))!.quantity).toBe("3");
    expect(out.find((l) => l.source!.key.includes("part=outlet"))!.unitPriceCents).toBe(4321);
    expect(engineChangedFor(estimate(out), M, GUTTER_PARTS_VERSION, db(d, estimate(out)))).toBe(false);
  });
  it("a drawing whose count did not change (a corrugated one of 20 ft) is not told by the new version", () => {
    const c = drawing({ dsStyle: "corrugated" });
    const e = estimate(linesFromParts(partsOf(c), [], name, uid, "rev1", M, "2026-11-16T10:00:00Z", "4") as ModuleLine[]);
    expect(engineChangedFor(e, M, GUTTER_PARTS_VERSION, db(c, e))).toBe(false);
  });
});

describe("rule 16: `elbowBend` lives through saving and reading, and an old app that copies the attributes keeps it", () => {
  it("saved and read back, the word reaches the engine: a plain one without elbows made «ready» has no bends, «field» has 3", () => {
    const ready = fromElements(toElements(drawing({ dsStyle: "plain", elbowBend: "ready" }) as never, M));
    expect(ready.downspouts[0]!.elbowBend).toBe("ready");
    expect(partsOf(ready).some((p) => p.key === "labor.bend")).toBe(false);
    const field = fromElements(toElements(drawing({ dsStyle: "corrugated", elbowBend: "field" }) as never, M));
    expect(partsOf(field).find((p) => p.key === "labor.bend")?.qty).toBe("3");
    expect(partsOf(field).some((p) => p.attrs.part === "elbow")).toBe(false);
  });
  it("an old phone that does not know it copies the attributes as they are (`{ ...attrs }`): the word stays", () => {
    const rows = toElements(drawing({ dsStyle: "plain", elbowBend: "field", elbows: [{ style: "A", qty: 2 }] }) as never, M);
    const oldPhone = rows.map((r) => ({ ...r, attrs: { ...(r.attrs as object) } }));
    expect(fromElements(oldPhone).downspouts[0]!.elbowBend).toBe("field");
  });
});

describe("the view says what the engine counts", () => {
  it("bent on site: «Гиб по месту × 3», not «Elbows»; ready: «Elbows A × 3»", () => {
    const t = tFor("ru");
    expect(dsLine(t, { shape: "rect", bent: true, elbows: [{ style: "A", qty: 3 }], offsets: [] })).toBe("Гиб по месту × 3");
    expect(dsLine(t, { shape: "rect", bent: true, elbows: [{ style: "A", qty: 2 }], offsets: [{ lengthIn: 4, qty: 1 }] })).toBe("Гиб по месту × 2 · Offset 4″ × 1");
    expect(dsLine(t, { shape: "rect", elbows: [{ style: "A", qty: 3 }], offsets: [] })).toContain("Elbows");
  });
  it("a bent one and a ready one of the same pipe are two kinds in the totals", () => {
    const one = (n: number, bent: boolean): SpecDs => ({ n, id: `d${n}`, story: 1, shape: "rect", size: "3x4", dsStyle: "plain", elbows: [{ style: "A", qty: 3 }], offsets: [], bottom: "none", lengthIn: 138, ...(bent ? { bent: true as const } : {}) } as SpecDs);
    const g = dsTotals([one(1, true), one(2, false), one(3, true)]);
    expect(g.map((x) => [x.ns, !!x.bent])).toEqual([[[1, 3], true], [[2], false]]);
  });
});
