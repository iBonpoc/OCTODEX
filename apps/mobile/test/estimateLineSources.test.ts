/**
 * C4 (docs/specs/33-gutters-estimate.md П23.7): what a module wrote into an estimate line (`source`) is the company's.
 * It stays in the stored document (calc_inputs, storedDoc) — «Обновить смету» needs it after a reload — and never goes
 * to the client: clientDoc drops it in the app, app.client_doc on the server (core_rls T97).
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
import type { CatalogItem, EstimateDoc } from "../src/data/types";
import { clientDoc, lineMarks, storedDoc } from "../src/features/estimateDoc";
import { portalFromEstimate } from "../src/cloud/portal";
import { estimateHtml } from "../src/features/estimatePdf";
import { estimateMessage } from "../src/features/sendEstimate";
import { makeSeed } from "../src/data/seed";
import { linesFromParts, resyncLines, type ModuleLine } from "../src/modules/gutters/estimate";
import { laborRows, materialRows, missingItems, sampleJob } from "../src/modules/gutters/prices";

const C = "11111111-1111-4111-8111-111111111111";
const name = (p: PartQty) => `${p.attrs.part ?? p.attrs.work ?? p.key}`;
let n = 0;
const uid = () => `l${++n}`;
const parts = computeGutterParts(sampleJob({})).parts;
const list = (cents = 1234, placeholder = false): CatalogItem[] =>
  missingItems(C, [...materialRows({}), ...laborRows()], [], name).map((it) => ({
    ...it, placeholder, priceCents: cents, ...(it.kind === "material" ? { costCents: cents, vendorTaxBps: 0, markupBps: 0 } : {}),
  }));
const own: CustomLine = { id: "own1", name: "Haul away", group: "service", quantity: "1", unit: "ea", unitPriceCents: 5000 };
const docOf = (lines: readonly (CustomLine | ModuleLine)[]): EstimateDoc => ({
  options: [{ id: "o1", name: "Option", lines: lines as CustomLine[] }],
  settings: { discount: null, tax: DEFAULT_TAX, deposit: { kind: "none" } },
});
/** what estimate.save sends and the database keeps (calc_inputs), and what the app reads back — as JSON */
const roundTrip = (doc: EstimateDoc) => JSON.parse(JSON.stringify(storedDoc(doc))) as EstimateDoc;
const noCost = (d: EstimateDoc) => d.options[0]!.lines.map(({ unitCostCents: _c, ...l }) => l);

describe("C4: source строки модуля", () => {
  it("clientDoc (всё, что уходит клиенту из приложения) снимает source и себестоимость", () => {
    const doc = docOf([...linesFromParts(parts, list(), name, uid), own]);
    expect(JSON.stringify(doc)).toContain('"source"');
    const c = JSON.stringify(clientDoc(doc));
    expect(c).not.toContain('"source"');
    expect(c).not.toContain("unitCostCents");
    expect(c).not.toContain("testPrice");
    expect(c).not.toContain("noPrice");
  });

  it("в calc_inputs (storedDoc) source остаётся, себестоимости нет; своя строка — без source", () => {
    const doc = docOf([...linesFromParts(parts, list(), name, uid), own]);
    const back = roundTrip(doc);
    expect(JSON.stringify(back)).not.toContain("unitCostCents");
    expect(noCost(back)).toEqual(noCost(doc));
    expect(back.options[0]!.lines.filter((l) => l.source)).toHaveLength(doc.options[0]!.lines.length - 1);
    expect(back.options[0]!.lines.find((l) => l.id === "own1")!.source).toBeUndefined();
  });

  it("после круга через базу «Обновить смету» видит ручную правку и не трогает её", () => {
    const first = linesFromParts(parts, list(1234), name, uid);
    const edited = first.map((l, i) => (i === 0 ? { ...l, unitPriceCents: 9999 } : l));
    const back = roundTrip(docOf([...edited, own]));
    const next = linesFromParts(parts, list(1500), name, uid);
    const out = resyncLines(back.options[0]!.lines as ModuleLine[], next);
    expect(out[0]!.unitPriceCents).toBe(9999); // hand price kept
    expect(out[1]!.unitPriceCents).toBe(1500); // untouched line follows the price list
    expect(out.filter((l) => l.id === "own1")).toHaveLength(1);
  });

  it("в source только слова модуля и цена продажи — ни себестоимости, ни наценки, ни поставщика (её читает мастер)", () => {
    const priced = list(1000).map((it) => (it.kind === "material" ? { ...it, costCents: 400, vendorTaxBps: 1000, markupBps: 5000 } : it));
    const lines = linesFromParts(parts, priced, name, uid, "rev1");
    const allowed = new Set(["module", "key", "section", "qty", "priceCents", "name", "unit", "noPrice", "testPrice", "gone", "revisionId", "measurementId"]);
    for (const l of lines) {
      for (const k of Object.keys(l.source!)) expect(allowed.has(k), k).toBe(true);
      expect(l.source!.priceCents).toBe(l.unitPriceCents); // the sell price, the line's own
      if (l.unitCostCents !== undefined) expect(l.source!.priceCents).not.toBe(l.unitCostCents);
      expect(JSON.stringify(l.source)).not.toMatch(/cost|markup|vendor|supplier/i);
    }
  });

  it("битый source не даёт пометок (строка как своя)", () => {
    expect(lineMarks({ ...own, source: { module: 1 } as never })).toEqual([]);
    expect(lineMarks({ ...own, source: "x" as never })).toEqual([]);
  });

  it("все выходы к клиенту из приложения — /p/ в демо, PDF, письмо — без source и тестовых пометок", () => {
    const db = makeSeed();
    const e = db.estimates.find((x) => x.doc?.options?.length)!;
    const lines = linesFromParts(parts, list(0, true), name, (() => { let k = 0; return () => `pdf${++k}`; })());
    const withModule = { ...e, doc: docOf([...lines.map((l) => ({ ...l, name: "Gutter", source: { ...l.source!, name: "SECRET-MODULE-NAME" } })), own]) };
    const p = portalFromEstimate(db, withModule, "Co");
    expect(JSON.stringify(p.doc)).not.toContain('"source"');
    for (const out of [JSON.stringify(p), estimateHtml(p, { lang: "en" }), JSON.stringify(estimateMessage("en", { company: "Co", name: "Ann", totalCents: 100, link: "https://x" }))]) {
      expect(out).not.toContain("SECRET-MODULE-NAME");
      expect(out).not.toMatch(/testPrice|noPrice|"section"|revisionId/);
    }
  });
});

describe("C4: пометки строки (lineMarks)", () => {
  const [l] = linesFromParts(parts, list(1234), name, uid);
  const src = l!.source!;
  it("своя строка — без пометок; из замера — «Из замера»", () => {
    expect(lineMarks(own)).toEqual([]);
    expect(lineMarks(l as CustomLine)).toEqual(["module"]);
  });
  it("«Нет цены» — пока цена 0; поставили цену — пометка уходит", () => {
    const np = { ...l!, unitPriceCents: 0, source: { ...src, priceCents: 0, noPrice: true as const } } as CustomLine;
    expect(lineMarks(np)).toEqual(["module", "noPrice"]);
    expect(lineMarks({ ...np, unitPriceCents: 500 })).toEqual(["module"]);
  });
  it("«Тестовая цена» — пока цена та, что записал модуль; изменили руками — уходит", () => {
    const tp = { ...l!, source: { ...src, testPrice: true as const } } as CustomLine;
    expect(lineMarks(tp)).toEqual(["module", "testPrice"]);
    expect(lineMarks({ ...tp, unitPriceCents: src.priceCents + 1 })).toEqual(["module"]);
  });
  it("тестовая $0 — и «Нет цены», и «Тестовая цена» (то же, что скажет проверка перед отправкой)", () => {
    const both = linesFromParts(parts, list(0, true), name, uid)[0] as CustomLine;
    expect(lineMarks(both)).toEqual(["module", "noPrice", "testPrice"]);
    expect(lineMarks({ ...both, unitPriceCents: 700 })).toEqual(["module"]);
  });
  it("«Нет в замере» — у пропавшей правленой строки", () => {
    expect(lineMarks({ ...l!, source: { ...src, gone: true as const } } as CustomLine)).toEqual(["module", "gone"]);
  });
});
