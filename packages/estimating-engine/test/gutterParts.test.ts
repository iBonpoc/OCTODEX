import { describe, it, expect } from "vitest";
import { computeGutterParts, sizeGutterRun, pitchFactor, downspoutLengthIn, DEFAULT_GUTTER_RULES, type MeasuredRun, type MeasuredDownspout, type MeasurementInput, type PartQty } from "../src/gutterParts.js";

/** docs/specs/33-gutters-module.md §9 S5g — parts from a measurement, lengths in inches. */

const run = (o: Partial<MeasuredRun> & { id: string; lengthIn: number }): MeasuredRun => ({
  profile: "k", size: "6", material: "alu_032", color: "white", story: 1, hanger: "hidden",
  ends: [{ kind: "cap" }, { kind: "cap" }], houseSide: "R", ...o,
});
const ds = (o: Partial<MeasuredDownspout> & { id: string; runId: string }): MeasuredDownspout => ({
  shape: "rect", size: "3x4", material: "alu", color: "white", bottom: { kind: "extension" }, ...o,
});
const q = (parts: PartQty[], key: string) => parts.find((p) => p.key === key)?.qty;
const keys = (parts: PartQty[]) => parts.map((p) => p.key);

describe("computeGutterParts — one straight run", () => {
  const input: MeasurementInput = {
    runs: [run({ id: "1", lengthIn: 480, tearOff: true })],
    corners: [],
    downspouts: [ds({ id: "d1", runId: "1" })],
  };
  const { parts, advice } = computeGutterParts(input);

  it("gutter: client sees installed feet, supplier gets coil with 5% waste, whole feet", () => {
    expect(q(parts, "gutter.k.6.alu_032.white")).toBe("40");
    expect(q(parts, "coil.k.6.alu_032.white")).toBe("42");
    expect(parts.find((p) => p.key === "coil.k.6.alu_032.white")!.use).toBe("purchase");
  });
  it("hidden hangers every 24 in; a left and a right end cap", () => {
    expect(q(parts, "hanger.hidden.k.6")).toBe("20");
    expect(q(parts, "endcap.L.k.6.alu_032.white")).toBe("1");
    expect(q(parts, "endcap.R.k.6.alu_032.white")).toBe("1");
  });
  it("downspout: 10 ft per story, bought in 10 ft sticks, 2 straps per stick, outlet, 3 A elbows, extension", () => {
    expect(q(parts, "ds.rect.3x4.alu.white")).toBe("10");
    expect(q(parts, "dsstick.rect.3x4.alu.white")).toBe("1");
    expect(q(parts, "dsstrap.rect.3x4")).toBe("2");
    expect(q(parts, "outlet.k.6.rect.3x4")).toBe("1");
    expect(q(parts, "elbow.A.rect.3x4.white")).toBe("3");
    expect(q(parts, "bottom.extension.rect.3x4")).toBe("1");
  });
  it("labor is separate lines: install by story, downspout by story, tear-off (founder О4)", () => {
    expect(q(parts, "labor.install.story1")).toBe("40");
    expect(q(parts, "labor.downspout.story1")).toBe("1");
    expect(q(parts, "labor.tearoff")).toBe("40");
    expect(parts.filter((p) => p.kind === "labor").every((p) => p.section === "labor" && p.use === "estimate")).toBe(true);
  });
  it("consumables: joints = 2 caps + 1 outlet → 1 sealant tube, 18 rivets", () => {
    expect(q(parts, "sealant")).toBe("1");
    expect(q(parts, "rivets")).toBe("18");
  });
  it("sections come in the founder's order and there is no advice", () => {
    const order = ["gutter", "corners_caps", "fasteners", "downspouts", "adapters", "guards", "ds_bottom", "consumables", "labor"];
    const seen = parts.map((p) => order.indexOf(p.section));
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    expect(advice).toEqual([]);
  });
  it("keys are stable: the same measurement gives the same keys and quantities", () => {
    expect(computeGutterParts(input).parts).toEqual(parts);
  });
});

describe("end caps follow the house side", () => {
  it("house on the left mirrors which end is the left cap; a corner end has no cap", () => {
    const { parts } = computeGutterParts({
      runs: [run({ id: "1", lengthIn: 120, houseSide: "L", ends: [{ kind: "cap" }, { kind: "corner", cornerId: "c" }] })],
      corners: [{ id: "c", kind: "out", method: "prefab", profile: "k", size: "6", material: "alu_032", color: "white", story: 1 }],
      downspouts: [],
    });
    expect(q(parts, "endcap.L.k.6.alu_032.white")).toBe("1");
    expect(q(parts, "endcap.R.k.6.alu_032.white")).toBeUndefined();
    const right = computeGutterParts({ runs: [run({ id: "1", lengthIn: 120, ends: [{ kind: "cap" }, { kind: "join" }] })], corners: [], downspouts: [] }).parts;
    expect(q(right, "endcap.R.k.6.alu_032.white")).toBe("1");
  });
});

describe("corners: cut on site vs ready-made", () => {
  const two = (method: "cut" | "prefab"): MeasurementInput => ({
    runs: [
      run({ id: "1", lengthIn: 240, ends: [{ kind: "cap" }, { kind: "corner", cornerId: "c" }] }),
      run({ id: "2", lengthIn: 240, ends: [{ kind: "corner", cornerId: "c" }, { kind: "cap" }] }),
    ],
    corners: [{ id: "c", kind: "out", method, profile: "k", size: "6", material: "alu_032", color: "white", story: 1 }],
    downspouts: [ds({ id: "d", runId: "1" })],
  });
  it("cut corner: strip miter to buy, corner-cut labor, +6 in of gutter before waste", () => {
    const { parts } = computeGutterParts(two("cut"));
    expect(q(parts, "stripmiter.k.6.alu_032.white")).toBe("1");
    expect(q(parts, "labor.corner_cut")).toBe("1");
    expect(q(parts, "corner.out.k.6.alu_032.white")).toBeUndefined();
    expect(q(parts, "gutter.k.6.alu_032.white")).toBe("40");
    // (480 + 6) × 1.05 / 12 = 42.525 → 43
    expect(q(parts, "coil.k.6.alu_032.white")).toBe("43");
  });
  it("ready-made corner: one corner part, no extra gutter, no cut labor", () => {
    const { parts } = computeGutterParts(two("prefab"));
    expect(q(parts, "corner.out.k.6.alu_032.white")).toBe("1");
    expect(q(parts, "labor.corner_cut")).toBeUndefined();
    expect(q(parts, "coil.k.6.alu_032.white")).toBe("42");
  });
  it("splash guard on an inside corner", () => {
    const i = two("prefab");
    i.corners[0] = { ...i.corners[0]!, kind: "in", splashGuard: true };
    expect(q(computeGutterParts(i).parts, "splashguard.k.6")).toBe("1");
  });
});

describe("downspouts", () => {
  it("2nd story: 20 ft, 2 sticks, labor at story 2; own height wins", () => {
    const base = { runs: [run({ id: "1", lengthIn: 360, story: 2 })], corners: [] };
    const a = computeGutterParts({ ...base, downspouts: [ds({ id: "d", runId: "1" })] }).parts;
    expect(q(a, "ds.rect.3x4.alu.white")).toBe("20");
    expect(q(a, "dsstick.rect.3x4.alu.white")).toBe("2");
    expect(q(a, "labor.downspout.story2")).toBe("1");
    expect(q(a, "labor.install.story2")).toBe("30");
    const b = computeGutterParts({ ...base, downspouts: [ds({ id: "d", runId: "1", heightIn: 250 })] }).parts;
    expect(q(b, "dsstick.rect.3x4.alu.white")).toBe("3");
  });
  it("onto the lower roof from the 2nd story: one story long, splash pan; from the 1st story — advice", () => {
    const up = ds({ id: "d", runId: "1", bottom: { kind: "lower_roof" } });
    expect(downspoutLengthIn(up, 2, DEFAULT_GUTTER_RULES)).toBe(120);
    const r = computeGutterParts({ runs: [run({ id: "1", lengthIn: 120, story: 2 })], corners: [], downspouts: [up] });
    expect(q(r.parts, "bottom.splash_pan")).toBe("1");
    const low = computeGutterParts({ runs: [run({ id: "1", lengthIn: 120 })], corners: [], downspouts: [up] });
    expect(low.advice).toContainEqual({ code: "lower_roof_from_first_story", downspoutId: "d" });
  });
  it("round with elbows by angle, offsets (custom marked), funnel, screen, drain with pipe", () => {
    const { parts } = computeGutterParts({
      runs: [run({ id: "1", lengthIn: 120, profile: "half_round", material: "copper", color: undefined })],
      corners: [],
      downspouts: [ds({ id: "d", runId: "1", shape: "round", size: "3", material: "copper", color: undefined, elbows: [{ style: "75", qty: 2 }, { style: "90", qty: 1 }], offsets: [{ lengthIn: 2, qty: 1 }, { lengthIn: 7, qty: 1 }], funnel: true, outletScreen: true, bottom: { kind: "drain", lengthIn: 60 } })],
    });
    expect(q(parts, "elbow.75.round.3.-")).toBe("2");
    expect(q(parts, "elbow.90.round.3.-")).toBe("1");
    expect(parts.find((p) => p.key === "offset.7.round.3")!.attrs.custom).toBe("1");
    expect(parts.find((p) => p.key === "offset.2.round.3")!.attrs.custom).toBeUndefined();
    expect(q(parts, "funnel.round.3")).toBe("1");
    expect(q(parts, "outletscreen.round.3")).toBe("1");
    expect(q(parts, "bottom.drain.round.3")).toBe("5");
    expect(q(parts, "bottom.drain_adapter.round.3")).toBe("1");
    // copper has no color
    expect(parts.find((p) => p.key.startsWith("gutter."))!.attrs.color).toBeUndefined();
  });
  it("rain chain instead of a downspout", () => {
    const { parts, advice } = computeGutterParts({ runs: [run({ id: "1", lengthIn: 120 })], corners: [], downspouts: [], chains: [{ id: "ch", runId: "1", story: 1 }] });
    expect(q(parts, "rainchain")).toBe("10");
    expect(q(parts, "rainchain_adapter.k.6")).toBe("1");
    expect(advice).toEqual([]);
  });
  it("a downspout on a missing run is advice, not a crash", () => {
    const r = computeGutterParts({ runs: [], corners: [], downspouts: [ds({ id: "d", runId: "x" })] });
    expect(r.advice).toEqual([{ code: "downspout_without_run", downspoutId: "d" }]);
  });
});

describe("rules a company can change", () => {
  it("0% waste and sectional gutters: 10 ft sections and section joints", () => {
    const { parts } = computeGutterParts(
      { runs: [run({ id: "1", lengthIn: 300 })], corners: [], downspouts: [ds({ id: "d", runId: "1" })] },
      { wastePct: 0, seamless: false },
    );
    expect(q(parts, "section.k.6.alu_032.white")).toBe("3");
    expect(q(parts, "coil.k.6.alu_032.white")).toBeUndefined();
    // joints: 2 section joints + 2 caps + 1 outlet = 5 → 30 rivets
    expect(q(parts, "rivets")).toBe("30");
  });
  it("hanger spacing by kind", () => {
    const { parts } = computeGutterParts({ runs: [run({ id: "1", lengthIn: 480, hanger: "spike" })], corners: [], downspouts: [] }, { hangerSpacingIn: { spike: 30 } as never });
    expect(q(parts, "hanger.spike.k.6")).toBe("16");
  });
  it("guards on part of a run", () => {
    const { parts } = computeGutterParts({ runs: [run({ id: "1", lengthIn: 480, guardsIn: 120, guardType: "micromesh" })], corners: [], downspouts: [] });
    expect(q(parts, "guard.micromesh.k.6")).toBe("10");
  });
});

describe("advice (hints, never blocks)", () => {
  it("long run for one downspout, expansion joint on long aluminum, run without a downspout", () => {
    const { advice } = computeGutterParts({
      runs: [run({ id: "1", lengthIn: 660 }), run({ id: "2", lengthIn: 120 })],
      corners: [],
      downspouts: [ds({ id: "d", runId: "1" })],
    });
    expect(advice).toContainEqual({ code: "run_long_for_downspouts", runId: "1", lengthIn: 660, downspouts: 1 });
    expect(advice).toContainEqual({ code: "expansion_joint", runId: "1", joints: 1 });
    expect(advice).toContainEqual({ code: "run_without_downspout", runId: "2" });
  });
});

describe("sizing (spec П4, worked example 1,800 sq ft, 6/12, Los Angeles)", () => {
  it("pitch factors", () => {
    expect(["2", "4", "6", "10", "12"].map((r) => pitchFactor(r).toString())).toEqual(["1", "1.05", "1.1", "1.2", "1.3"]);
  });
  it("code basis 2.0 in/hr: whole roof fits 5 in K", () => {
    const a = sizeGutterRun({ planAreaSqFt: 1800, risePer12: 6, rainInHr: "2.0", runLengthIn: 480 });
    expect(a.load.toString()).toBe("3960");
    expect(a.gutter).toBe("k5");
  });
  it("SMACNA 5-minute basis ~8 in/hr: whole roof fits nothing; one eave of 900 sq ft needs 6 in K", () => {
    expect(sizeGutterRun({ planAreaSqFt: 1800, risePer12: 6, rainInHr: 8, runLengthIn: 480 }).gutter).toBeNull();
    const eave = sizeGutterRun({ planAreaSqFt: 900, risePer12: 6, rainInHr: 8, runLengthIn: 480 });
    expect(eave.load.toString()).toBe("7920");
    expect(eave.gutter).toBe("k6");
    // 990 adjusted sq ft: 2 × 2x3 or 1 × 3x4
    expect(eave.downspouts).toEqual({ "2x3": 2, "3x4": 1 });
  });
  it("a 60 ft run needs at least 2 downspouts by length", () => {
    expect(sizeGutterRun({ planAreaSqFt: 300, risePer12: 4, rainInHr: 2, runLengthIn: 720 }).downspouts["3x4"]).toBe(2);
  });
});
