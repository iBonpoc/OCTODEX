import { describe, it, expect } from "vitest";
import { computeGutterQuantities, segmentLengthsFt, corners, freeEndsByRun, feetPerPixel, calibrate, type GutterInput } from "../src/gutters.js";
import { buildGutterLines, buildGbbOptions } from "../src/gutterEstimate.js";
import { computeOption, type TaxContext } from "../src/estimate.js";
import { BOOK, EXAMPLE_A, EXAMPLE_B, EXAMPLE_C } from "./fixtures.js";

const CA: TaxContext = { mode: "included_in_price", enabled: false, rateBps: 0, includePurchaseTaxInCost: false };
const nums = (r: Record<string, { toString(): string }>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.toString()]));

describe("PRD 06 §7.9 — geometry", () => {
  it("G1: segments 50 and 30 ft, one 90° corner", () => {
    const pts: [number, number][] = [[0, 0], [200, 0], [200, 120]];
    expect(segmentLengthsFt(pts, "0.25").map(String)).toEqual(["50", "30"]);
    const c = corners(pts, "right");
    expect(c).toHaveLength(1);
    expect(c[0]!.turnDeg).toBe(90);
  });
  it("G2: calibration 160 px = 20 ft", () => {
    const s = calibrate(20, 160);
    expect(s.toString()).toBe("0.125");
    expect(segmentLengthsFt([[0, 0], [400, 0]], s)[0]!.toString()).toBe("50");
  });
  it("G3: Web Mercator scale at LA, zoom 20", () => {
    const f = feetPerPixel("34.05", 20, 1).toNumber();
    expect(Math.abs(f - 0.4058) / 0.4058).toBeLessThan(0.005);
  });
  it("G4: 10° turn has no miter; 45° turn is a bay miter of 135°", () => {
    const a = 10 * Math.PI / 180, b = 45 * Math.PI / 180;
    expect(corners([[0, 0], [100, 0], [100 + 100 * Math.cos(a), 100 * Math.sin(a)]], "right")).toHaveLength(0);
    const c = corners([[0, 0], [100, 0], [100 + 100 * Math.cos(b), 100 * Math.sin(b)]], "right");
    expect(c[0]!.angleDeg).toBe(135);
  });
  it("G5: U-shape → 2 outside; closed square → 4 outside; L-notch → 1 inside", () => {
    expect(corners([[0, 0], [100, 0], [100, 100], [0, 100]], "right").map(c => c.kind)).toEqual(["out", "out"]);
    expect(corners([[0, 0], [100, 0], [100, 100], [0, 100]], "right", true).map(c => c.kind)).toEqual(["out", "out", "out", "out"]);
    expect(corners([[0, 0], [100, 0], [100, 50], [150, 50]], "right").map(c => c.kind)).toEqual(["out", "in"]);
  });
  it("G6: two runs with ends 1.2 ft apart form a joint: 2 end caps instead of 4", () => {
    const ends = freeEndsByRun([
      { id: "A", points: [[0, 0], [50, 0]] },
      { id: "B", points: [[51.2, 0], [51.2, 40]] },
    ], 1);
    expect(ends.A! + ends.B!).toBe(2);
  });
  it("G7: 148′ 7½″ rounds up to 149.0 LF at 0.5 ft", () => {
    const q = computeGutterQuantities({ runs: [{ id: "R", story: 1, profile: "K6", gauge: ".032", color: "W", segmentsFt: ["148.625"] }], miters: [], downspouts: [] });
    expect(q.runLf.R!.toString()).toBe("149");
  });
  it("G8: property story height override", () => {
    const q = computeGutterQuantities({
      runs: [
        { id: "R1", story: 1, profile: "K6", gauge: ".032", color: "W", segmentsFt: [20] },
        { id: "R2", story: 2, profile: "K6", gauge: ".032", color: "W", segmentsFt: [20] },
      ],
      miters: [],
      downspouts: [{ runId: "R1", size: "3x4" }, { runId: "R2", size: "3x4" }],
      property: { storyHeightsOverrideFt: { 1: 12 } },
    });
    expect(q.downspoutLengthsFt.map(String)).toEqual(["12", "20"]);
    expect(q.dsSticks).toBe(2 + 2);
  });
  it("G9: story 5 without custom height is an error", () => {
    const q = computeGutterQuantities({ runs: [{ id: "R", story: 5, profile: "K6", gauge: ".032", color: "W", segmentsFt: [20] }], miters: [], downspouts: [{ runId: "R", size: "3x4" }] });
    expect(q.errors[0]).toMatch(/этажа 5 нет в таблице/);
    expect(q.downspoutLengthsFt).toHaveLength(0);
  });
  it("G10: custom elbows 2×A + 1×B", () => {
    const q = computeGutterQuantities({
      runs: [{ id: "R", story: 1, profile: "K6", gauge: ".032", color: "W", segmentsFt: [20] }], miters: [],
      downspouts: [{ runId: "R", size: "3x4", elbows: [{ style: "a", qty: 2 }, { style: "b", qty: 1 }] }],
    });
    expect(q.elbows).toEqual({ "a.3x4": 2, "b.3x4": 1 });
  });
});

describe("PRD 06 example A", () => {
  const q = computeGutterQuantities(EXAMPLE_A);
  it("quantities", () => {
    expect(nums(q.gutterLf)).toEqual({ "K6|.032": "140" });
    expect([q.mitersOut, q.endCaps.K6, q.outlets["3x4"], q.elbows["a.3x4"]]).toEqual([1, 4, 4, 12]);
    expect(q.downspoutLf["3x4"]!.toString()).toBe("40");
    expect([q.hangers.hidden, q.sealantTubes, q.screwBoxes, q.dsSticks]).toEqual([70, 2, 1, 4]);
    expect(q.coilLf).toEqual({ "15|.032|Musket Brown": 147 });
  });
  it("price $2,217.00, cost $859.30, margin 61.2% (TX3)", () => {
    const r = computeOption(buildGutterLines(q, BOOK), CA);
    expect([r.total, r.cost, r.margin, r.marginPct]).toEqual([221700, 85930, 135770, "61.2"]);
  });
  it("TX2: with purchase tax in cost → $898.02, 59.5%", () => {
    const r = computeOption(buildGutterLines(q, BOOK), { ...CA, includePurchaseTaxInCost: true });
    expect([r.cost, r.margin, r.marginPct]).toEqual([89802, 131898, "59.5"]);
  });
  it("A0: waste 0% → coil 140 LF, cost $849.50", () => {
    const q0 = computeGutterQuantities({ ...EXAMPLE_A, constants: { coilWastePct: 0 } });
    expect(q0.coilLf["15|.032|Musket Brown"]).toBe(140);
    const r = computeOption(buildGutterLines(q0, BOOK), CA);
    expect([r.total, r.cost]).toEqual([221700, 84950]);
  });
});

describe("PRD 06 example B (G/B/B, T12)", () => {
  it("quantities", () => {
    const q = computeGutterQuantities(EXAMPLE_B);
    expect(nums(q.gutterLf)).toEqual({ "K6|.032": "129.5" });
    expect(nums(q.storyFeeLf)).toEqual({ 2: "105.5" });
    expect(q.hangers.strap_tile).toBe(65);
    expect([q.sealantTubes, q.screwBoxes, q.dsSticks]).toEqual([2, 1, 7]);
    expect(q.coilLf).toEqual({ "15|.032|Musket Brown": 111, "15|.032|White": 26 });
  });
  it("totals $2,816.75 / $3,215.75 / $5,028.75; guards are an add-on in Good/Better", () => {
    const opts = buildGbbOptions(EXAMPLE_B, BOOK);
    const totals = opts.map(o => computeOption(o.lines, CA).total);
    expect(totals).toEqual([281675, 321575, 502875]);
    const withAddon = opts[1]!.lines.map(l => (l.isOptional ? { ...l, selected: true } : l));
    expect(computeOption(withAddon, CA).total).toBe(321575 + 181300);
  });
});

describe("PRD 06 example C (3 stories + custom height)", () => {
  it("quantities and total $2,693.00", () => {
    const q = computeGutterQuantities(EXAMPLE_C as GutterInput);
    expect(q.downspoutLf["3x4"]!.toString()).toBe("109");
    expect([q.dsSticks, q.elbows["a.3x4"], q.endCaps.K6, q.hangers.hidden, q.sealantTubes, q.screwBoxes]).toEqual([13, 9, 2, 40, 1, 1]);
    expect(q.coilLf).toEqual({ "15|.032|White": 84 });
    expect(computeOption(buildGutterLines(q, BOOK), CA).total).toBe(269300);
  });
});
