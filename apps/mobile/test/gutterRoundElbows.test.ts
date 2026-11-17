/**
 * #871 (X-07) and «Расход v2» PR-1б (spec 33-gutters-consumption §2.1, §2.7, §2.15 №2): a round downspout without elbows of its own
 * gets one 75° elbow and a 2″ offset, never «A». The app's panel and the engine say the same default; an estimate made before keeps
 * its lines until «Обновить» (a snapshot), and «Обновить» brings the 75°; a company that priced its 45° (or the old «A») elbow keeps
 * that price on the 75° one until it prices its own.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import { computeGutterParts, ENGINE_VERSION, type MeasuredRun, type MeasurementInput, type PartQty } from "@octo/estimating-engine";
import { DS_KINDS, ELBOW_STYLES, elbowCounts } from "../src/modules/gutters/canvas/attrs";
import type { CatalogItem } from "../src/data/types";
import { optionTotals, newDoc } from "../src/features/estimateDoc";
import { linesFromParts, resyncLines } from "../src/modules/gutters/estimate";
import { findItem, matchAttrs, missingItems, partName, priceFromOtherDegree } from "../src/modules/gutters/prices";
import { tFor } from "../src/i18n/translate";

const run = (id: string): MeasuredRun => ({ id, profile: "k" as const, size: "6", material: "alu_032", color: "white", story: 1, hanger: "hidden", ends: [{ kind: "cap" }, { kind: "cap" }], houseSide: "R" as const, lengthIn: 240 });
const job = (shape: "rect" | "round"): MeasurementInput => ({
  runs: [run("1")],
  corners: [],
  downspouts: [{ id: "d", runId: "1", shape, size: shape === "round" ? "3" : "3x4", material: "alu", color: "white", bottom: { kind: "extension" } }],
});
const elbows = (ps: readonly PartQty[]) => ps.filter((p) => p.attrs.part === "elbow");

describe("the panel and the engine say the same default (#871, «Расход v2»)", () => {
  it("what a downspout with no elbows of its own shows is what the engine counts, for every kind: ready elbows as parts, bends on site as «Гиб по месту»", () => {
    for (const k of DS_KINDS) {
      const ds = { ...job(k.shape).downspouts[0]!, dsStyle: k.style };
      const shown = Object.entries(elbowCounts({ shape: k.shape, dsStyle: k.style })).filter(([, q]) => q > 0);
      const ps = computeGutterParts({ ...job(k.shape), downspouts: [ds] }).parts;
      const counted = elbows(ps).map((p) => [String(p.attrs.style), Number(p.qty)]);
      const bends = Number(ps.find((p) => p.key === "labor.bend")?.qty ?? 0);
      // a plain rectangular one is bent on site: its «A» are bends, not parts
      if (k.shape === "rect" && k.style === "plain") expect([counted, bends], k.key).toEqual([[], shown.reduce((n, [, q]) => n + q, 0)]);
      else expect([counted, bends], k.key).toEqual([shown, 0]);
    }
    // the founder's numbers (16.11): a plain rectangular one 3 bends on site, a corrugated one 3 × A, a round one 1 × 75°; an old
    // drawing without a kind — none (rule 16)
    expect(elbowCounts({ shape: "rect" })).toEqual({ A: 0, B: 0 });
    expect(elbowCounts({ shape: "rect", dsStyle: "plain" })).toEqual({ A: 3, B: 0 });
    expect(elbowCounts({ shape: "rect", dsStyle: "corrugated" })).toEqual({ A: 3, B: 0 });
    expect(elbowCounts({ shape: "round" })).toEqual({ "30": 0, "45": 0, "60": 0, "75": 1, "90": 0 });
    expect(elbowCounts({ shape: "round", dsStyle: "corrugated" })).toMatchObject({ "75": 1 });
  });
  it("the engine's round default is a style a round downspout offers; 30° is one of them (§2.1 п.7)", () => {
    expect(ELBOW_STYLES.round).toContain(String(elbows(computeGutterParts(job("round")).parts)[0]!.attrs.style));
    expect(ELBOW_STYLES.round).toEqual(["30", "45", "60", "75", "90"]);
  });
});

describe("an estimate made before keeps its lines until «Обновить» (snapshot, #871, «Расход v2»)", () => {
  const name = (p: PartQty) => partName(tFor("en"), p);
  let n = 0;
  const uid = () => `l${++n}`;
  // the parts of an old revision (parts version 4): the round downspout's elbows were 45°
  const fresh = computeGutterParts(job("round")).parts;
  const old = fresh.map((p) => (p.attrs.part === "elbow" ? { ...p, key: p.key.replace("elbow.75.", "elbow.45."), attrs: { ...p.attrs, style: "45" } } : p));
  const lineOf = (ls: { name: string; source?: { key?: string } }[], style: string) => ls.find((l) => l.source?.key?.includes("part=elbow") && l.source.key.includes(`style=${style}`));
  it("the stored lines are plain data: the engine's change does not touch them", () => {
    const stored = linesFromParts(old, [], name, uid, "r1", "m1");
    expect(lineOf(stored, "45")).toBeTruthy();
    expect(lineOf(stored, "75")).toBeUndefined();
    expect(ENGINE_VERSION).toBe("0.1.3");
  });
  it("«Обновить»: the 75° line comes, the 45° line goes, a price set by hand on another line stays", () => {
    const stored = linesFromParts(old, [], name, uid, "r1", "m1").map((l) => (l.source?.key?.includes("part=outlet") ? { ...l, unitPriceCents: 4321 } : l));
    const next = linesFromParts(fresh, [], name, uid, "r2", "m1");
    const after = resyncLines(stored, next);
    expect(lineOf(after, "75")).toBeTruthy();
    expect(lineOf(after, "45")).toBeUndefined();
    expect(after.find((l) => l.source?.key?.includes("part=outlet"))!.unitPriceCents).toBe(4321);
  });
  it("the new line says 75° in the name", () => {
    const l = lineOf(linesFromParts(fresh, [], name, uid, "r2", "m1"), "75")!;
    expect(l.name).toContain("75");
  });
});

describe("the money of the round elbow (#871, §2.7, rule 15)", () => {
  const fresh = computeGutterParts(job("round")).parts;
  const elbow = fresh.find((p) => p.attrs.part === "elbow")!;
  const item = (id: string, p: PartQty, priceCents: number, style?: string): CatalogItem => ({
    id, kind: "material", name: `Round elbow ${style ?? p.attrs.style}`, unit: p.unit, priceCents, costCents: priceCents, vendorTaxBps: 0, markupBps: 0,
    attributes: { ...matchAttrs(p), ...(style ? { style } : {}) },
  });
  let n = 0;
  const uid = () => `m${++n}`;
  const elbowLines = (catalog: CatalogItem[], parts: readonly PartQty[] = fresh) => linesFromParts(parts, catalog, (p) => partName(tFor("en"), p), uid, "r1", "m1").filter((l) => l.source?.key?.includes("part=elbow"));
  const sum = (lines: ReturnType<typeof elbowLines>) => optionTotals(newDoc(), { id: "o", name: "o", lines: lines as never }).groupSubtotals.material;

  it("the default is one 75° elbow: its own item gives its price — the material subtotal is 1 × price, in cents", () => {
    expect(elbow.attrs.style).toBe("75");
    const lines = elbowLines([item("i75", elbow, 1500)]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.unitPriceCents).toBe(1500);
    expect(lines[0]!.quantity).toBe("1");
    expect(lines[0]!.source!.noPrice).toBeUndefined();
    expect(sum(lines)).toBe(1500);
  });
  it("§2.7: a company that priced its 45° elbow keeps that price on the 75° one — not $0; the line is «another degree's price»", () => {
    const c45 = [item("i45", elbow, 1450, "45")];
    expect(findItem(c45, elbow)?.id).toBe("i45");
    expect(priceFromOtherDegree(c45, elbow)).toBe(true);
    const lines = elbowLines(c45);
    expect(lines[0]!.unitPriceCents).toBe(1450);
    expect(lines[0]!.source!.noPrice).toBeUndefined();
    expect(sum(lines)).toBe(1450);
  });
  it("…then the old «A» one (#871: priced before the 45° fix)", () => {
    const legacy = [item("iA", elbow, 1234, "A")];
    expect(findItem(legacy, elbow)?.id).toBe("iA");
    expect(sum(elbowLines(legacy))).toBe(1234);
  });
  it("its own 75° item wins over the 45° and the «A» ones; the 45° over the «A»", () => {
    const all = [item("iA", elbow, 1234, "A"), item("i45", elbow, 1450, "45"), item("i75", elbow, 1500)];
    expect(findItem(all, elbow)?.id).toBe("i75");
    expect(priceFromOtherDegree(all, elbow)).toBe(false);
    expect(sum(elbowLines(all))).toBe(1500);
    expect(findItem(all.slice(0, 2), elbow)?.id).toBe("i45");
  });
  it("only round elbows borrow, and only the 45° and «A» prices: a rectangular elbow never, a 90° price never lends", () => {
    const ribbed = job("rect");
    const rectElbow = computeGutterParts({ ...ribbed, downspouts: [{ ...ribbed.downspouts[0]!, dsStyle: "corrugated" }] }).parts.find((p) => p.attrs.part === "elbow")!;
    const round45 = { ...elbow, key: elbow.key.replace("elbow.75.", "elbow.45."), attrs: { ...elbow.attrs, style: "45" } };
    expect(findItem([item("iA", elbow, 1234, "A")], rectElbow)).toBeUndefined();
    expect(findItem([item("i90", elbow, 999, "90")], elbow)).toBeUndefined();
    // a 45° elbow does not borrow a 75° price (the fallback goes down to the old names only)
    expect(findItem([item("i75", elbow, 1500)], round45)).toBeUndefined();
    expect(findItem([item("iA", elbow, 1234, "A")], round45)?.id).toBe("iA");
    expect(priceFromOtherDegree([item("iA", elbow, 1234, "A")], rectElbow)).toBe(false);
  });
  it("«create the missing items» does not make a second item next to the 45° one it borrows", () => {
    const c45 = item("i45", elbow, 1450, "45");
    const rows = [{ key: elbow.key, part: elbow }] as never;
    expect(missingItems("c1", rows, [c45], (p) => partName(tFor("en"), p))).toEqual([]);
    expect(missingItems("c1", rows, [], (p) => partName(tFor("en"), p))).toHaveLength(1);
  });
  it("«Обновить»: the 75° line gets the 45° price, a hand-set price on another line stays", () => {
    const old = fresh.map((p) => (p.attrs.part === "elbow" ? { ...p, key: p.key.replace("elbow.75.", "elbow.45."), attrs: { ...p.attrs, style: "45" } } : p));
    const catalog = [item("i45", elbow, 1450, "45")];
    const stored = linesFromParts(old, catalog, (p) => partName(tFor("en"), p), uid, "r1", "m1").map((l) => (l.source?.key?.includes("part=outlet") ? { ...l, unitPriceCents: 4321 } : l));
    const next = linesFromParts(fresh, catalog, (p) => partName(tFor("en"), p), uid, "r2", "m1");
    const after = resyncLines(stored, next);
    const e = after.find((l) => l.source?.key?.includes("part=elbow"))!;
    expect(e.unitPriceCents).toBe(1450);
    expect(e.source!.key).toContain("style=75");
    expect(after.find((l) => l.source?.key?.includes("part=outlet"))!.unitPriceCents).toBe(4321);
  });
});
