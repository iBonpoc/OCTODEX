import { describe, it, expect } from "vitest";
import { resolveGutterRules, computeGutterParts, defaultElbowsFor, bendOf, fieldBendOf, dsRoundedIn, defaultOffsetsFor, sizeGutterRun, pitchFactor, downspoutLengthIn, downspoutSticks, purchaseQty, DEFAULT_GUTTER_RULES, type MeasuredRun, type MeasuredDownspout, type MeasurementInput, type PartQty } from "../src/gutterParts.js";

/** docs/specs/33-gutters-module.md §9 S5g — parts from a measurement, lengths in inches. */

const run = (o: Partial<MeasuredRun> & { id: string; lengthIn: number }): MeasuredRun => ({
  profile: "k", size: "6", material: "alu_032", color: "white", story: 1, hanger: "hidden",
  ends: [{ kind: "cap" }, { kind: "cap" }], houseSide: "R", ...o,
});
// a rectangular one comes with its 3 × A given (the cases below count with them; since #1776 a plain one has none by default —
// the default itself is tested with `elbows: undefined`)
const ds = (o: Partial<MeasuredDownspout> & { id: string; runId: string }): MeasuredDownspout => ({
  shape: "rect", size: "3x4", material: "alu", color: "white", bottom: { kind: "extension" }, ...(o.shape === "round" ? {} : { elbows: [{ style: "A", qty: 3 }] }), ...o,
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

  it("gutter: client sees installed feet, supplier gets coil with a fixed 10 ft of waste, whole feet (#1355: was 5 %, then 10 %)", () => {
    expect(q(parts, "gutter.k.6.alu_032.white")).toBe("40");
    expect(q(parts, "coil.k.6.alu_032.white")).toBe("50"); // 40 ft + 10 ft
    expect(parts.find((p) => p.key === "coil.k.6.alu_032.white")!.use).toBe("purchase");
  });
  it("hidden hangers every 24 in; a left and a right end cap", () => {
    expect(q(parts, "hanger.hidden.aluminum.k.6")).toBe("21");
    expect(q(parts, "endcap.L.k.6.alu_032.white")).toBe("1");
    expect(q(parts, "endcap.R.k.6.alu_032.white")).toBe("1");
  });
  it("downspout: 10 ft per story, bought in 10 ft sticks, 2 wall straps per 10 ft with screws (wood wall), outlet, 3 A elbows, extension", () => {
    expect(q(parts, "ds.rect.3x4.alu.white")).toBe("10");
    expect(q(parts, "dsstick.rect.3x4.alu.white")).toBe("1");
    // П18.7: the strap is a kit — strap + 2 wall screws + 2 downspout screws
    expect(q(parts, "ds_strap.aluminum.rect.3x4")).toBe("2");
    expect(q(parts, "screw.10x15")).toBe("4");
    expect(q(parts, "screw.8x05")).toBe("4");
    expect(q(parts, "outlet.k.6.alu_032.white.rect.3x4")).toBe("1");
    expect(q(parts, "elbow.A.rect.3x4.alu.white")).toBe("3");
    expect(q(parts, "bottom.extension.rect.3x4")).toBe("1");
  });
  it("labor is separate lines: install by story, downspout by story, tear-off (founder О4)", () => {
    expect(q(parts, "labor.install.story1")).toBe("40");
    expect(q(parts, "labor.downspout.story1")).toBe("1");
    expect(q(parts, "labor.tearoff")).toBe("40");
    expect(parts.filter((p) => p.kind === "labor").every((p) => p.section === "labor" && p.use === "estimate")).toBe(true);
  });
  it("consumables by joint (П18.8): rivets caps 2×2 + outlet 4 + 5 downspout joints × 2 = 18, painted to the color; 3 sealant points → 1 tube; no field cut → no paint", () => {
    expect(q(parts, "sealant")).toBe("1");
    expect(q(parts, "rivet.42.aluminum.painted.white")).toBe("18");
    expect(keys(parts).some((k) => k.startsWith("paint."))).toBe(false);
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
  const two = (method: "cut" | "strip" | "prefab"): MeasurementInput => ({
    runs: [
      run({ id: "1", lengthIn: 240, ends: [{ kind: "cap" }, { kind: "corner", cornerId: "c" }] }),
      run({ id: "2", lengthIn: 240, ends: [{ kind: "corner", cornerId: "c" }, { kind: "cap" }] }),
    ],
    corners: [{ id: "c", kind: "out", method, profile: "k", size: "6", material: "alu_032", color: "white", story: 1 }],
    downspouts: [ds({ id: "d", runId: "1" })],
  });
  it("cut corner: no strip miter (П18.3 №8), corner-cut labor, +14 in (an OUTSIDE corner, #1355) of gutter, +10 ft of waste, 6 rivets, a touch-up can", () => {
    const { parts } = computeGutterParts(two("cut"));
    expect(q(parts, "stripmiter.k.6.alu_032.white")).toBeUndefined();
    expect(q(parts, "labor.corner_cut")).toBe("1");
    // caps 4 + corner 6 + outlet 4 + downspout 10
    expect(q(parts, "rivet.42.aluminum.painted.white")).toBe("24");
    expect(q(parts, "paint.white")).toBe("1");
    expect(q(parts, "corner.out.k.6.alu_032.white")).toBeUndefined();
    expect(q(parts, "gutter.k.6.alu_032.white")).toBe("40");
    // (480 + 14 + 120) / 12 = 51.17 → 52
    expect(q(parts, "coil.k.6.alu_032.white")).toBe("52");
  });
  it("strip corner: a strip miter to buy, cut labor, +14 in (outside), 8 rivets, a touch-up can", () => {
    const { parts } = computeGutterParts(two("strip"));
    expect(q(parts, "stripmiter.k.6.alu_032.white")).toBe("1");
    expect(q(parts, "labor.corner_cut")).toBe("1");
    expect(q(parts, "coil.k.6.alu_032.white")).toBe("52");
    expect(q(parts, "rivet.42.aluminum.painted.white")).toBe("26");
    expect(q(parts, "paint.white")).toBe("1");
  });
  it("ready-made corner: one corner part, no extra gutter, no cut labor, 8 rivets, no paint", () => {
    const { parts } = computeGutterParts(two("prefab"));
    expect(q(parts, "corner.out.k.6.alu_032.white")).toBe("1");
    expect(q(parts, "labor.corner_cut")).toBeUndefined();
    expect(q(parts, "coil.k.6.alu_032.white")).toBe("50"); // (480 + 120) / 12
    expect(q(parts, "rivet.42.aluminum.painted.white")).toBe("26");
    expect(q(parts, "paint.white")).toBeUndefined();
  });
  it("bay miter", () => {
    const i = two("prefab");
    i.corners[0] = { ...i.corners[0]!, kind: "bay" };
    expect(q(computeGutterParts(i).parts, "corner.bay.k.6.alu_032.white")).toBe("1");
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
    expect(q(parts, "elbow.75.round.3.copper.-")).toBe("2");
    expect(q(parts, "elbow.90.round.3.copper.-")).toBe("1");
    expect(parts.find((p) => p.key === "offset.7.round.3.copper.-")!.attrs.custom).toBe("1");
    expect(parts.find((p) => p.key === "offset.2.round.3.copper.-")!.attrs.custom).toBeUndefined();
    expect(q(parts, "funnel.round.3.copper.-")).toBe("1");
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
  it("0% waste and sectional gutters: 10 ft sections, a slip joint at each section joint", () => {
    const { parts } = computeGutterParts(
      { runs: [run({ id: "1", lengthIn: 300 })], corners: [], downspouts: [ds({ id: "d", runId: "1" })] },
      { wasteFt: 0, seamless: false },
    );
    expect(q(parts, "section.k.6.alu_032.white")).toBe("3");
    expect(q(parts, "coil.k.6.alu_032.white")).toBeUndefined();
    expect(q(parts, "slipjoint.k.6.alu_032.white")).toBe("2");
    // rivets: caps 4 + 2 section joints × 4 + outlet 4 + downspout 10
    expect(q(parts, "rivet.42.aluminum.painted.white")).toBe("26");
  });
  it("company spacing by kit: spike every 30 in → 16 spikes and 16 ferrules", () => {
    const { parts } = computeGutterParts({ runs: [run({ id: "1", lengthIn: 480, hanger: "spike" })], corners: [], downspouts: [] }, { hangerSpacingIn: { spike: 30 } });
    expect(q(parts, "spike.aluminum.k.6")).toBe("17");
    expect(q(parts, "ferrule.aluminum.k.6")).toBe("17");
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

/* ---------------- docs/specs/33-gutters-parts.md П18.11 ---------------- */

const one = (r: Partial<MeasuredRun>, d: Partial<MeasuredDownspout>[] = [], over?: Parameters<typeof computeGutterParts>[1]) =>
  computeGutterParts({ runs: [run({ id: "1", lengthIn: 480, ...r })], corners: [], downspouts: d.map((x, i) => ds({ id: `d${i}`, runId: "1", ...x })) }, over);

describe("П18: stock — material, gauge, finish; coil blank", () => {
  it("gauge is its own key segment and attribute; the coil line carries the blank width", () => {
    const { parts } = one({ material: "aluminum", gauge: ".032", finish: "painted" });
    expect(q(parts, "gutter.k.6.aluminum.032.white")).toBe("40");
    const coil = parts.find((p) => p.key === "coil.k.6.aluminum.032.white")!;
    expect(coil.qty).toBe("50"); // 40 ft + 10 ft
    expect(coil.attrs).toMatchObject({ gauge: ".032", finish: "painted", blankIn: "15", buy: "coil" });
  });
  it(".027 and .032 of one color are two coil lines", () => {
    const { parts } = computeGutterParts({
      runs: [run({ id: "1", lengthIn: 240, material: "aluminum", gauge: ".027" }), run({ id: "2", lengthIn: 240, material: "aluminum", gauge: ".032" })],
      corners: [],
      downspouts: [],
    });
    // 20 ft each; the fixed 10 ft of waste is for EVERY gutter stock (founder 14.11): each coil line gets it
    expect(q(parts, "coil.k.6.aluminum.027.white")).toBe("30");
    expect(q(parts, "coil.k.6.aluminum.032.white")).toBe("30");
  });
  it("5 in K coil is 11 7/8 wide; half round has no blank by default", () => {
    expect(one({ size: "5" }).parts.find((p) => p.key.startsWith("coil."))!.attrs.blankIn).toBe("11.875");
    expect(one({ profile: "half_round" }).parts.find((p) => p.key.startsWith("coil."))!.attrs.blankIn).toBeUndefined();
  });
});

describe("П18.6: hanger kits", () => {
  it("hidden without a screw takes a #10 speed screw each", () => {
    const { parts } = one({ hanger: "hidden_noscrew" });
    expect(q(parts, "hanger.hidden_noscrew.aluminum.k.6")).toBe("21");
    expect(q(parts, "screw.10x15")).toBe("21");
  });
  it("spike and ferrule in pairs", () => {
    const { parts } = one({ hanger: "spike" });
    expect(q(parts, "spike.aluminum.k.6")).toBe("21");
    expect(q(parts, "ferrule.aluminum.k.6")).toBe("21");
    expect(q(parts, "hanger.spike.k.6")).toBeUndefined();
  });
  it("#766: a hanger every 24 in and one at each end: floor(length / spacing) + 1", () => {
    const n = (lengthIn: number, rules = {}) => q(computeGutterParts({ runs: [run({ id: "1", lengthIn })], corners: [], downspouts: [] }, rules).parts, "hanger.hidden.aluminum.k.6");
    expect(n(480)).toBe("21"); // 40 ft
    expect(n(492)).toBe("21"); // 41 ft
    expect(n(468)).toBe("20"); // 39 ft
    expect(n(24)).toBe("2"); // 2 ft: one at each end
    expect(n(12)).toBe("1"); // shorter than the spacing: one
  });
  it("a run of length 0 has no hanger; the old rule key hangerExtraPerRun in stored rules is ignored without an error", () => {
    const n = (lengthIn: number, rules = {}) => q(computeGutterParts({ runs: [run({ id: "1", lengthIn })], corners: [], downspouts: [] }, rules).parts, "hanger.hidden.aluminum.k.6");
    expect(n(0)).toBeUndefined();
    expect(resolveGutterRules({ hangerExtraPerRun: 1 } as never).hangerAtEnds).toBe(true);
    expect(n(480, { hangerExtraPerRun: 0 })).toBe("21");
  });
  it("the company can switch the end hanger off (ceil(length / spacing)) and a run's own spacing wins (snow, wind)", () => {
    expect(q(one({}, [], { hangerAtEnds: false }).parts, "hanger.hidden.aluminum.k.6")).toBe("20");
    expect(q(one({ hangerSpacingIn: 18 }).parts, "hanger.hidden.aluminum.k.6")).toBe("27");
  });
  it("tile: T-bar strap with screws and a tile labor line", () => {
    const { parts } = one({ hanger: "tbar_strap" });
    expect(q(parts, "hanger.tbar_strap.aluminum.k.6")).toBe("21");
    expect(q(parts, "screw.10x15")).toBe("42");
    expect(q(parts, "labor.tile")).toBe("40");
  });
  it("wedges: one under every hanger", () => {
    expect(q(one({ wedges: true }).parts, "wedge.k.6")).toBe("21");
  });
  it("an unknown kit is advice and one hanger part by 24 in, not a crash", () => {
    const r = one({ hanger: "nope" });
    expect(q(r.parts, "hanger.nope.k.6")).toBe("21");
    expect(r.advice).toContainEqual({ code: "hanger_kit_unknown", runId: "1", hanger: "nope" });
  });
});

describe("П18: half round, copper", () => {
  const hr = (hanger: string) => one({ profile: "half_round", material: "copper", color: undefined, lengthIn: 240, hanger });
  it("shank #10 on fascia + circle + bolt + 2 screws; caps without a side; solder instead of sealant; copper rivets", () => {
    const { parts } = hr("hr_shank_fascia");
    expect(q(parts, "shank.copper.half_round.10.6")).toBe("11");
    expect(q(parts, "circle.copper.half_round.6")).toBe("11");
    expect(q(parts, "bolt.10-24x075")).toBe("11");
    expect(q(parts, "screw.10x15")).toBe("22");
    expect(q(parts, "endcap.-.half_round.6.copper.-")).toBe("2");
    expect(keys(parts).some((k) => k.startsWith("endcap.L") || k.startsWith("endcap.R"))).toBe(false);
    expect(q(parts, "solder")).toBe("1");
    expect(parts.find((p) => p.key === "solder")!.unit).toBe("lb");
    expect(q(parts, "flux")).toBe("1");
    expect(q(parts, "sealant")).toBeUndefined();
    expect(q(parts, "rivet.42.copper.mill.-")).toBe("4");
  });
  it("shank #11 on rafters", () => {
    expect(q(hr("hr_shank_rafter").parts, "shank.copper.half_round.11.6")).toBe("11");
  });
  it("sectional half round: sections with 10 ft of waste, slip joints", () => {
    const { parts } = computeGutterParts({ runs: [run({ id: "1", lengthIn: 300, profile: "half_round" })], corners: [], downspouts: [] }, { seamless: false });
    expect(q(parts, "section.half_round.6.alu_032.white")).toBe("4"); // (300 + 120) / 120 = 3.5
    expect(q(parts, "slipjoint.half_round.6.alu_032.white")).toBe("2");
  });
  it("D end section with an outlet replaces the end cap and the outlet at that end", () => {
    const r = one({ profile: "half_round", lengthIn: 120 }, [{ shape: "round", size: "3", endOutlet: "end" }]);
    expect(q(r.parts, "endoutlet.half_round.6.alu_032.white.round.3")).toBe("1");
    expect(q(r.parts, "endcap.-.half_round.6.alu_032.white")).toBe("1");
    expect(keys(r.parts).some((k) => k.startsWith("outlet."))).toBe(false);
    const bad = computeGutterParts({ runs: [run({ id: "1", lengthIn: 120, ends: [{ kind: "cap" }, { kind: "join" }] })], corners: [], downspouts: [ds({ id: "d", runId: "1", endOutlet: "end" })] });
    expect(bad.advice).toContainEqual({ code: "end_outlet_not_cap", downspoutId: "d" });
  });
});

describe("П18: downspouts — style, sticks with offcuts, extension", () => {
  it("corrugated is its own downspout and elbow", () => {
    const { parts } = one({}, [{ dsStyle: "corrugated" }]);
    expect(q(parts, "ds.rect.3x4.corrugated.alu.white")).toBe("10");
    expect(q(parts, "elbow.A.rect.3x4.corrugated.alu.white")).toBe("3");
  });
  it("offcuts are shared first fit decreasing", () => {
    expect(downspoutSticks([144, 144, 144], 120)).toBe(4);
    expect(downspoutSticks([72, 72, 72], 120)).toBe(3);
    expect(downspoutSticks([144, 144, 144], 120, false)).toBe(6);
    expect(downspoutSticks([96, 24, 48, 72], 120)).toBe(2);
    const { parts } = one({}, [{ heightIn: 144 }, { heightIn: 144 }, { heightIn: 144 }]);
    expect(q(parts, "dsstick.rect.3x4.alu.white")).toBe("4");
    expect(q(one({}, [{ heightIn: 144 }, { heightIn: 144 }, { heightIn: 144 }], { dsShareOffcuts: false }).parts, "dsstick.rect.3x4.alu.white")).toBe("6");
  });
  it("company extension adds to every downspout", () => {
    const { parts } = one({}, [{}], { dsExtensionIn: 12 });
    // 132″ in the estimate goes up to 20 ft (Д1, each downspout up to 10 ft); the sticks take the 132″ as they are
    expect(q(parts, "ds.rect.3x4.alu.white")).toBe("20");
    expect(q(one({}, [{}], { dsExtensionIn: 12, dsRoundUpFt: 1 }).parts, "ds.rect.3x4.alu.white")).toBe("11");
    expect(q(parts, "dsstick.rect.3x4.alu.white")).toBe("2");
  });
  it("downspout joints with screws instead of rivets", () => {
    const { parts } = one({}, [{}], { dsJoin: "screw" });
    expect(q(parts, "rivet.42.aluminum.painted.white")).toBe("8");
    expect(q(parts, "screw.8x05")).toBe("14");
  });
});

describe("П18.7: downspout wall fasteners by wall", () => {
  it("brick: brick hooks in the mortar, no screws", () => {
    const { parts } = one({}, [{ wall: "brick" }]);
    expect(q(parts, "brick_hook.aluminum.rect.3x4")).toBe("2");
    expect(q(parts, "ds_strap.aluminum.rect.3x4")).toBeUndefined();
    expect(q(parts, "screw.10x15")).toBeUndefined();
  });
  it("stucco: straps with masonry anchors", () => {
    const { parts } = one({}, [{ wall: "stucco" }]);
    expect(q(parts, "ds_strap.aluminum.rect.3x4")).toBe("2");
    expect(q(parts, "anchor.masonry")).toBe("4");
    expect(q(parts, "screw.10x15")).toBe("4");
  });
  it("straps cut from flat coil: 2 × 16 in → 3 ft", () => {
    const { parts } = one({}, [{ wall: "coil_strap" }]);
    expect(q(parts, "flat_coil")).toBe("3");
    expect(parts.find((p) => p.key === "flat_coil")!.unit).toBe("ft");
  });
  it("round on wood: hinged hooks; a 2nd story downspout gets 4", () => {
    expect(q(one({}, [{ shape: "round", size: "3" }]).parts, "hinged_hook.aluminum.round.3")).toBe("2");
    expect(q(one({ story: 2 }, [{}]).parts, "ds_strap.aluminum.rect.3x4")).toBe("4");
  });
  it("an unknown wall is advice", () => {
    expect(one({}, [{ wall: "glass" }]).advice).toContainEqual({ code: "wall_kit_unknown", downspoutId: "d0", wall: "glass" });
  });
});

describe("П18: adapters, heads, Y", () => {
  it("reducer, conductor head, diverter, eave box, colored splash block, drain pipe adapter", () => {
    const { parts } = one({}, [
      { reducers: [{ to: "2x3", qty: 1 }], head: "conductor", diverter: true, eaveBox: "closed", bottom: { kind: "splash_block", color: "green" } },
      { bottom: { kind: "drain", lengthIn: 120, pipe: "4" } },
    ]);
    expect(q(parts, "reducer.2x3.rect.3x4.alu.white")).toBe("1");
    expect(q(parts, "conductorhead.rect.3x4.alu.white")).toBe("1");
    expect(q(parts, "funnel.rect.3x4.alu.white")).toBeUndefined();
    expect(q(parts, "diverter.rect.3x4.alu.white")).toBe("1");
    expect(q(parts, "eavebox.closed.rect.3x4.alu.white")).toBe("1");
    expect(q(parts, "bottom.splash_block.rect.3x4.green")).toBe("1");
    expect(q(parts, "bottom.drain_adapter.rect.3x4.4")).toBe("1");
  });
  it("a Y joins two downspouts; different sizes are advice", () => {
    const base = { runs: [run({ id: "1", lengthIn: 480 })], corners: [] };
    const same = computeGutterParts({ ...base, downspouts: [ds({ id: "a", runId: "1" }), ds({ id: "b", runId: "1" })], wyes: [{ id: "y", dsIds: ["a", "b"] }] });
    expect(q(same.parts, "wye.rect.3x4.alu.white")).toBe("1");
    expect(same.advice).toEqual([]);
    const diff = computeGutterParts({ ...base, downspouts: [ds({ id: "a", runId: "1", size: "2x3" }), ds({ id: "b", runId: "1" })], wyes: [{ id: "y", dsIds: ["a", "b"] }, { id: "z", dsIds: ["a", "x"] }] });
    expect(diff.advice).toContainEqual({ code: "wye_sizes_differ", wyeId: "y" });
    expect(diff.advice).toContainEqual({ code: "wye_downspout_missing", wyeId: "z" });
  });
});

describe("П18: guards in pieces, expansion joints", () => {
  it("client sees feet, the supplier gets pieces per run, screws per piece", () => {
    const m = one({ guardsIn: 120, guardType: "micromesh" });
    expect(q(m.parts, "guard.micromesh.k.6")).toBe("10");
    expect(q(m.parts, "guardpiece.micromesh.k.6")).toBe("3");
    expect(q(m.parts, "screw.8x05")).toBe("9");
    expect(q(one({ guardsIn: 120, guardType: "screen" }).parts, "guardpiece.screen.k.6")).toBe("2");
    const two = computeGutterParts({ runs: [run({ id: "1", lengthIn: 60, guardsIn: 60, guardType: "micromesh" }), run({ id: "2", lengthIn: 60, guardsIn: 60, guardType: "micromesh" })], corners: [], downspouts: [] });
    expect(q(two.parts, "guardpiece.micromesh.k.6")).toBe("4");
    expect(one({ guardsIn: 120, guardType: "leafx" }).advice).toContainEqual({ code: "guard_kit_unknown", runId: "1", guard: "leafx" });
  });
  it("expansion joint as a part when the company wants it", () => {
    expect(q(one({ lengthIn: 660 }, [{}]).parts, "expjoint.k.6.alu_032.white")).toBeUndefined();
    expect(q(one({ lengthIn: 660 }, [{}], { expansionJointPart: true }).parts, "expjoint.k.6.alu_032.white")).toBe("1");
  });
});

describe("П18.9: purchase units (core C3 pack_size)", () => {
  it("VGS shapes: coil by the pound, boxes, bags, spikes per pound", () => {
    const cases: [string | number, string | number, string][] = [
      [42, "2.6", "17"], [42, "2.0", "21"], [42, "2.2", "20"], [42, "1.7", "25"], [42, "1.3", "33"], [42, 1, "42"],
      [7, 30, "1"], [20, 500, "1"], [18, 100, "1"], [20, 6, "4"], [0, 10, "0"],
    ];
    for (const [qty, pack, want] of cases) expect(purchaseQty(qty, pack).toString()).toBe(want);
  });
  it("a pack size of zero is an error", () => {
    expect(() => purchaseQty(1, 0)).toThrow();
  });
});

/* ---------------- review of PR «M1 детали»: every case failed before the fix ---------------- */

describe("bad input never gives Infinity or negative parts", () => {
  it("spacing 0 on a run falls back to the kit; company zeros fall back to the defaults", () => {
    const r = one({ hangerSpacingIn: 0 });
    expect(q(r.parts, "hanger.hidden.aluminum.k.6")).toBe("21");
    expect(r.advice).toContainEqual({ code: "input_fixed", id: "1", field: "hangerSpacingIn" });
    const z = one({}, [{}], { dsStickIn: 0, dsFastenerSpacingIn: 0, jointsPerSealantTube: 0, hangerSpacingIn: { hidden: 0 } });
    expect(q(z.parts, "dsstick.rect.3x4.alu.white")).toBe("1");
    expect(q(z.parts, "ds_strap.aluminum.rect.3x4")).toBe("2");
    expect(q(z.parts, "sealant")).toBe("1");
    expect(q(z.parts, "hanger.hidden.aluminum.k.6")).toBe("21");
    expect(z.parts.every((p) => /^\d+(\.\d+)?$/.test(p.qty))).toBe(true);
  });
  it("a negative length is 0 with advice; fractions are rounded to whole inches", () => {
    const r = one({ lengthIn: -24 });
    expect(r.parts.every((p) => !p.qty.startsWith("-"))).toBe(true);
    expect(q(r.parts, "gutter.k.6.alu_032.white")).toBeUndefined();
    expect(r.advice).toContainEqual({ code: "input_fixed", id: "1", field: "lengthIn" });
    expect(q(one({ lengthIn: 479.6 }).parts, "gutter.k.6.alu_032.white")).toBe("40");
  });
  it("undefined in an override keeps the default", () => {
    expect(q(one({}, [], { wasteFt: undefined, dsStickIn: undefined }).parts, "coil.k.6.alu_032.white")).toBe("50");
  });
  it("purchaseQty refuses a negative quantity; downspoutSticks a bad stick", () => {
    expect(() => purchaseQty(-1, 10)).toThrow();
    expect(() => downspoutSticks([120], 0)).toThrow();
  });
});

describe("partial company overrides merge by field", () => {
  it("joints: changing endcap rivets keeps its sealant", () => {
    const { parts } = one({}, [{}], { joints: { endcap: { rivets: 3 } } });
    expect(q(parts, "rivet.42.aluminum.painted.white")).toBe("20");
    expect(q(parts, "sealant")).toBe("1");
  });
  it("wall table: changing wood keeps stucco", () => {
    const over = { wallKitByWall: { rect: { wood: "u_bracket" } } };
    expect(q(one({}, [{}], over).parts, "u_bracket.aluminum.rect.3x4")).toBe("2");
    expect(q(one({}, [{ wall: "stucco" }], over).parts, "ds_strap.aluminum.rect.3x4")).toBe("2");
  });
});

describe("shared screws stay in one section", () => {
  it("#8 screws from guards, wall straps and downspout joints: one line in consumables, whatever came first", () => {
    const a = one({ guardsIn: 120, guardType: "micromesh" }, [{}], { dsJoin: "screw" });
    const b = one({}, [{}], { dsJoin: "screw" });
    expect(a.parts.find((p) => p.key === "screw.8x05")!.section).toBe("consumables");
    expect(b.parts.find((p) => p.key === "screw.8x05")!.section).toBe("consumables");
    // guards 9 + straps 4 + joints 10
    expect(q(a.parts, "screw.8x05")).toBe("23");
  });
});

describe("fittings carry metal and color", () => {
  it("a copper and an aluminum 3 in round downspout do not share elbows, outlets or hangers", () => {
    const { parts } = computeGutterParts({
      runs: [run({ id: "1", lengthIn: 240 }), run({ id: "2", lengthIn: 240, profile: "k", material: "copper", color: undefined })],
      corners: [],
      downspouts: [ds({ id: "a", runId: "1", shape: "round", size: "3", material: "aluminum", color: undefined }), ds({ id: "b", runId: "2", shape: "round", size: "3", material: "copper", color: undefined })],
    });
    // a round downspout without elbows of its own: one 75° elbow and one 2″ offset (§2.15 №2) — «A» is a rectangular elbow (#871)
    expect(q(parts, "elbow.75.round.3.aluminum.-")).toBe("1");
    expect(q(parts, "elbow.75.round.3.copper.-")).toBe("1");
    expect(q(parts, "offset.2.round.3.aluminum.-")).toBe("1");
    expect(q(parts, "offset.2.round.3.copper.-")).toBe("1");
    expect(q(parts, "outlet.k.6.copper.-.round.3")).toBe("1");
    expect(q(parts, "hanger.hidden.copper.k.6")).toBe("11");
    expect(q(parts, "hinged_hook.copper.round.3")).toBe("2");
  });
});

describe("edge cases", () => {
  it("guards without a type use the company's default kit", () => {
    const r = one({ guardsIn: 120 });
    expect(q(r.parts, "guardpiece.micromesh.k.6")).toBe("3");
    expect(r.advice.some((a) => a.code === "guard_kit_unknown")).toBe(false);
  });
  it("two end outlets on one end: the second gets an ordinary outlet and advice", () => {
    const r = one({ profile: "half_round", lengthIn: 240 }, [{ shape: "round", size: "3", endOutlet: "end" }, { shape: "round", size: "3", endOutlet: "end" }]);
    expect(q(r.parts, "endoutlet.half_round.6.alu_032.white.round.3")).toBe("1");
    expect(q(r.parts, "outlet.half_round.6.alu_032.white.round.3")).toBe("1");
    expect(r.advice).toContainEqual({ code: "end_outlet_taken", downspoutId: "d1" });
  });
  it("a coil strap for a size without a strip length is advice", () => {
    expect(one({}, [{ size: "4x5", wall: "coil_strap" }]).advice).toContainEqual({ code: "strip_size_unknown", downspoutId: "d0", size: "4x5" });
  });
  it("a Y on one downspout twice is advice, not a part", () => {
    const r = computeGutterParts({ runs: [run({ id: "1", lengthIn: 480 })], corners: [], downspouts: [ds({ id: "a", runId: "1" })], wyes: [{ id: "y", dsIds: ["a", "a"] }] });
    expect(keys(r.parts).some((k) => k.startsWith("wye."))).toBe(false);
    expect(r.advice).toContainEqual({ code: "wye_same_downspout", wyeId: "y" });
  });
});

describe("consumable rules a company can change", () => {
  it("stucco: #8 screws into the downspout too", () => {
    expect(q(one({}, [{ wall: "stucco" }]).parts, "screw.8x05")).toBe("4");
  });
  it("more than 8 sealant points → 2 tubes; points per tube is a setting", () => {
    // 4 prefab corners (8) + 2 caps (2) + 1 outlet (1) = 11 points
    const runs = [0, 1, 2, 3, 4].map((i) => run({ id: `r${i}`, lengthIn: 120, ends: [i === 0 ? { kind: "cap" } : { kind: "corner", cornerId: `c${i}` }, i === 4 ? { kind: "cap" } : { kind: "corner", cornerId: `c${i + 1}` }] }));
    const corners = [1, 2, 3, 4].map((i) => ({ id: `c${i}`, kind: "out" as const, method: "prefab" as const, profile: "k" as const, size: "6", material: "alu_032", color: "white", story: 1 }));
    const input = { runs, corners, downspouts: [ds({ id: "d", runId: "r0" })] };
    expect(q(computeGutterParts(input).parts, "sealant")).toBe("2");
    expect(q(computeGutterParts(input, { jointsPerSealantTube: 12 }).parts, "sealant")).toBe("1");
  });
  it("two painted colors with cut corners → two cans; touch-up off → none", () => {
    const input: MeasurementInput = {
      runs: [run({ id: "1", lengthIn: 120 }), run({ id: "2", lengthIn: 120, color: "brown" })],
      corners: [
        { id: "a", kind: "out", method: "cut", profile: "k", size: "6", material: "alu_032", color: "white", story: 1 },
        { id: "b", kind: "out", method: "cut", profile: "k", size: "6", material: "alu_032", color: "brown", story: 1 },
      ],
      downspouts: [],
    };
    expect(q(computeGutterParts(input).parts, "paint.white")).toBe("1");
    expect(q(computeGutterParts(input).parts, "paint.brown")).toBe("1");
    expect(keys(computeGutterParts(input, { touchUpPaint: false }).parts).some((k) => k.startsWith("paint."))).toBe(false);
  });
  it("soldered materials are a setting: copper with sealant when the company does not solder", () => {
    const { parts } = one({ profile: "half_round", material: "copper", color: undefined, hanger: "hr_shank_fascia" }, [], { solderedMaterials: [] });
    expect(q(parts, "sealant")).toBe("1");
    expect(q(parts, "solder")).toBeUndefined();
  });
});

describe("elbows by default follow the shape (#871, X-07) and the style (#1776)", () => {
  // `job("rect")` is a plain one, `job("ribbed")` a corrugated one; neither has elbows of its own unless `extra` gives them
  const job = (shape: "rect" | "ribbed" | "round", extra: Partial<MeasuredDownspout> = {}): MeasurementInput => ({
    runs: [run({ id: "1", lengthIn: 240 })],
    corners: [],
    downspouts: [ds({ id: "d", runId: "1", elbows: undefined, ...(shape === "round" ? { shape: "round", size: "3" } : shape === "ribbed" ? { dsStyle: "corrugated" } : {}), ...extra })],
  });
  const elbowKeys = (i: MeasurementInput, rules?: Parameters<typeof computeGutterParts>[1]) => computeGutterParts(i, rules).parts.filter((p) => p.attrs.part === "elbow").map((p) => `${p.key}=${p.qty}`);
  it("round without elbows: 1 × 75° and a 2″ offset (§2.15 №2), no «A» anywhere", () => {
    expect(elbowKeys(job("round"))).toEqual(["elbow.75.round.3.alu.white=1"]);
    expect(computeGutterParts(job("round")).parts.filter((p) => p.attrs.part === "offset").map((p) => `${p.key}=${p.qty}`)).toEqual(["offset.2.round.3.alu.white=1"]);
    expect(keys(computeGutterParts(job("round")).parts).some((k) => k.startsWith("elbow.A.round"))).toBe(false);
  });
  it("a plain rectangular one without elbows: none (founder 16.11: «у прямого водостока стандартно колен 0», #1776)", () => {
    expect(elbowKeys(job("rect"))).toEqual([]);
    expect(elbowKeys(job("rect", { dsStyle: "plain" }))).toEqual([]);
  });
  it("a corrugated rectangular one without elbows: 3 × A («у ребристого 3 штуки A»)", () => {
    expect(elbowKeys(job("ribbed"))).toEqual(["elbow.A.rect.3x4.corrugated.alu.white=3"]);
  });
  it("a plain one without elbows has fewer downspout joints: the rivets count only the pieces that are there", () => {
    const rivets = (ps: PartQty[]) => ps.filter((p) => p.attrs.part === "rivet").reduce((n, p) => n + Number(p.qty), 0);
    const plain = computeGutterParts(job("rect")).parts, given = computeGutterParts(job("rect", { elbows: [{ style: "A", qty: 3 }] })).parts;
    expect(rivets(given)).toBeGreaterThan(rivets(plain));
  });
  it("defaultElbowsFor: one rule for the engine and the app", () => {
    // an old drawing without a kind: no elbows, as before (rule 16)
    expect(defaultElbowsFor({ shape: "rect" })).toEqual([]);
    // a plain one is bent on site: 3 bends, shown as «A»; made ready by hand — no elbows of its own, none
    expect(defaultElbowsFor({ shape: "rect", dsStyle: "plain" })).toEqual([{ style: "A", qty: 3 }]);
    expect(defaultElbowsFor({ shape: "rect", dsStyle: "plain", elbowBend: "ready" })).toEqual([]);
    expect(defaultElbowsFor({ shape: "rect", dsStyle: "corrugated" })).toEqual([{ style: "A", qty: 3 }]);
    expect(defaultElbowsFor({ shape: "round" })).toEqual([{ style: "75", qty: 1 }]);
    expect(defaultElbowsFor({ shape: "round", dsStyle: "corrugated" })).toEqual([{ style: "75", qty: 1 }]);
  });
  it("the corrugated default stays its own: the round one has its own default, a plain one is bent on site", () => {
    // the round one does not take the corrugated number any more (founder 16.11 «колено только одно»)
    expect(elbowKeys(job("round"), { defaultElbows: [{ style: "A", qty: 5 }] })).toEqual(["elbow.75.round.3.alu.white=1"]);
    expect(elbowKeys(job("ribbed"), { defaultElbows: [{ style: "A", qty: 5 }] })).toEqual(["elbow.A.rect.3x4.corrugated.alu.white=5"]);
    // the corrugated default is not the plain one's
    expect(elbowKeys(job("rect"), { defaultElbows: [{ style: "A", qty: 5 }] })).toEqual([]);
    // a plain one made ready by hand takes the company's plain default
    expect(elbowKeys(job("rect", { dsStyle: "plain", elbowBend: "ready" }), { defaultElbowsPlain: [{ style: "B", qty: 1 }] })).toEqual(["elbow.B.rect.3x4.plain.alu.white=1"]);
  });
  it("a round default of its own wins; zero elbows is none", () => {
    expect(elbowKeys(job("round"), { defaultElbowsRound: [{ style: "90", qty: 2 }] })).toEqual(["elbow.90.round.3.alu.white=2"]);
    expect(elbowKeys(job("round"), { defaultElbowsRound: [{ style: "45", qty: 0 }] })).toEqual([]);
  });
  it("elbows given by the drawing are not touched (rect A/B, round 75/90)", () => {
    expect(elbowKeys(job("rect", { elbows: [{ style: "A", qty: 2 }, { style: "B", qty: 1 }] }))).toEqual(["elbow.A.rect.3x4.alu.white=2", "elbow.B.rect.3x4.alu.white=1"]);
    // a plain one with elbows given keeps them; a corrugated one with none given («0») keeps none
    expect(elbowKeys(job("rect", { elbows: [{ style: "A", qty: 3 }] }))).toEqual(["elbow.A.rect.3x4.alu.white=3"]);
    expect(elbowKeys(job("ribbed", { elbows: [{ style: "A", qty: 0 }] }))).toEqual([]);
    expect(elbowKeys(job("round", { elbows: [{ style: "75", qty: 2 }, { style: "90", qty: 1 }] }))).toEqual(["elbow.75.round.3.alu.white=2", "elbow.90.round.3.alu.white=1"]);
  });
  it("mixed shapes on one job: each has its own", () => {
    const i: MeasurementInput = { runs: [run({ id: "1", lengthIn: 240 }), run({ id: "2", lengthIn: 240 })], corners: [], downspouts: [ds({ id: "a", runId: "1", elbows: undefined }), ds({ id: "b", runId: "2", shape: "round", size: "3" }), ds({ id: "c", runId: "2", elbows: undefined, dsStyle: "corrugated" })] };
    expect(elbowKeys(i).sort()).toEqual(["elbow.75.round.3.alu.white=1", "elbow.A.rect.3x4.corrugated.alu.white=3"]);
  });
  it("the joints count the round one's elbow and offset as pieces, like the A ones of a corrugated one", () => {
    const a = computeGutterParts(job("ribbed")).parts, b = computeGutterParts(job("round")).parts;
    const rivets = (ps: PartQty[]) => ps.filter((p) => p.attrs.part === "rivet").map((p) => p.qty).join();
    // three ready A elbows are three pieces; one elbow and one offset are two — the same as three ready A minus one
    expect(rivets(b)).toBe(rivets(computeGutterParts(job("ribbed", { elbows: [{ style: "A", qty: 2 }] })).parts));
    expect(rivets(a)).not.toBe(rivets(b));
  });
});

describe("#1355: waste (a fixed length for every stock) and the allowance of a field-cut corner", () => {
  const corner = (kind: "out" | "in" | "bay", method: "cut" | "strip" | "prefab" = "cut"): MeasurementInput => ({
    runs: [
      run({ id: "1", lengthIn: 240, ends: [{ kind: "cap" }, { kind: "corner", cornerId: "c" }] }),
      run({ id: "2", lengthIn: 240, ends: [{ kind: "corner", cornerId: "c" }, { kind: "cap" }] }),
    ],
    corners: [{ id: "c", kind, method, profile: "k", size: "6", material: "alu_032", color: "white", story: 1 }],
    downspouts: [],
  });
  type Over = Parameters<typeof computeGutterParts>[1];
  const coil = (i: MeasurementInput, over?: Over) => q(computeGutterParts(i, over).parts, "coil.k.6.alu_032.white");
  it("defaults: a fixed 10 ft of waste, an outside corner 14″, an inside corner 6″", () => {
    expect(DEFAULT_GUTTER_RULES.wasteFt).toBe(10);
    expect(DEFAULT_GUTTER_RULES.cutCornerOutAllowanceIn).toBe(14);
    expect(DEFAULT_GUTTER_RULES.cutCornerAllowanceIn).toBe(6);
  });
  it("10 ft of waste is the same on 40 ft and on 300 ft (the founder: «на 300 фит мне не надо 30 фит запас»)", () => {
    const len = (n: number): MeasurementInput => ({ runs: [run({ id: "1", lengthIn: n * 12 })], corners: [], downspouts: [] });
    expect(coil(len(40))).toBe("50");
    expect(coil(len(300))).toBe("310");
  });
  it("an outside cut corner takes 14″, an inside one 6″, a bay 6″ (480″ of gutter + 10 ft of waste)", () => {
    expect(coil(corner("out"))).toBe("52"); // (480 + 14 + 120) / 12 = 51.17
    expect(coil(corner("in"))).toBe("51"); // (480 + 6 + 120) / 12 = 50.5
    expect(coil(corner("bay"))).toBe("51");
  });
  it("a strip corner takes the same allowance by kind; a ready-made corner takes none, whatever its kind", () => {
    expect(coil(corner("out", "strip"))).toBe("52");
    expect(coil(corner("in", "strip"))).toBe("51");
    expect(coil(corner("out", "prefab"))).toBe("50"); // (480 + 120) / 12
    expect(coil(corner("in", "prefab"))).toBe("50");
  });
  it("the allowance is the company's: separate numbers for the two kinds", () => {
    expect(coil(corner("out"), { cutCornerOutAllowanceIn: 0 })).toBe("50");
    expect(coil(corner("out"), { cutCornerAllowanceIn: 30 })).toBe("52"); // the inside number does not move an outside corner
    expect(coil(corner("in"), { cutCornerOutAllowanceIn: 24 })).toBe("51");
    expect(coil(corner("in"), { cutCornerAllowanceIn: 24 })).toBe("52"); // (480 + 24 + 120) / 12 = 52
  });
  it("«Без запаса»: 0 ft — the purchase is the installed length plus the corners, whole feet; the client's line never had waste", () => {
    expect(coil(corner("out"), { wasteFt: 0 })).toBe("42"); // (480 + 14) / 12 = 41.17
    expect(coil(corner("out", "prefab"), { wasteFt: 0 })).toBe("40");
    const { parts } = computeGutterParts(corner("out"), { wasteFt: 0 });
    expect(q(parts, "gutter.k.6.alu_032.white")).toBe("40");
    expect(computeGutterParts(corner("out")).parts.find((p) => p.key === "gutter.k.6.alu_032.white")!.qty).toBe("40"); // the estimate line is the same with and without waste
  });
  it("the fixed waste is for EVERY gutter stock («на каждый вид желоба берём 10 фит запас»): each colour, profile and size is bought with it", () => {
    const two: MeasurementInput = { runs: [run({ id: "1", lengthIn: 600, color: "white" }), run({ id: "2", lengthIn: 240, color: "black" }), run({ id: "3", lengthIn: 240, size: "5" })], corners: [], downspouts: [] };
    const r = computeGutterParts(two).parts;
    expect(q(r, "coil.k.6.alu_032.white")).toBe("60"); // 50 ft + 10 ft
    expect(q(r, "coil.k.6.alu_032.black")).toBe("30"); // 20 ft + 10 ft
    expect(q(r, "coil.k.5.alu_032.white")).toBe("30"); // another size is another stock
    const none = computeGutterParts(two, { wasteFt: 0 }).parts;
    expect(q(none, "coil.k.6.alu_032.black")).toBe("20");
    expect(q(none, "coil.k.5.alu_032.white")).toBe("20");
  });
  it("waste is on the gutter only: hangers, caps, screws, rivets and sticks do not change with it", () => {
    const keysOf = (over?: Over) => computeGutterParts(corner("out"), over).parts.filter((p) => !p.key.startsWith("coil.")).map((p) => `${p.key}=${p.qty}`).sort();
    expect(keysOf({ wasteFt: 0 })).toEqual(keysOf({ wasteFt: 50 }));
  });
  it("sectional gutters take the same waste in sections: (480 + 120) / 120 = 5", () => {
    const sec = (over?: Over) => q(computeGutterParts(corner("out", "prefab"), { seamless: false, ...over }).parts, "section.k.6.alu_032.white");
    expect(sec()).toBe("5");
    expect(sec({ wasteFt: 0 })).toBe("4");
  });
  it("a saved company without the new fields gets 14″ for an outside corner and a fixed 10 ft; its own inside value stays", () => {
    const r = resolveGutterRules({ cutCornerAllowanceIn: 9 });
    expect(r.cutCornerOutAllowanceIn).toBe(14);
    expect(r.cutCornerAllowanceIn).toBe(9);
    expect(r).toMatchObject({ wasteFt: 10 });
    expect(resolveGutterRules({ cutCornerOutAllowanceIn: -1 }).cutCornerOutAllowanceIn).toBe(14); // not a number of inches: the default
    expect(resolveGutterRules({ cutCornerOutAllowanceIn: 20 }).cutCornerOutAllowanceIn).toBe(20);
    expect(resolveGutterRules({ wasteFt: -3 })).toMatchObject({ wasteFt: 10 }); // nonsense is the default
  });
});

/* ---------------- «Расход v2» PR-1б: bends on site, the round default, the estimate's downspout (spec 33-gutters-consumption) ---------------- */

describe("«Расход v2» PR-1б: bendOf (§2.1 п.2)", () => {
  it("its own word wins; else a plain rectangular one without elbows of its own is bent on site; else ready", () => {
    expect(bendOf({ shape: "rect", dsStyle: "plain" })).toBe("field");
    expect(bendOf({ shape: "rect", dsStyle: "plain", elbowBend: "ready" })).toBe("ready");
    expect(bendOf({ shape: "rect", dsStyle: "corrugated", elbowBend: "field" })).toBe("field");
    // elbows set by hand without a word: ready, as they were (rule 16)
    expect(bendOf({ shape: "rect", dsStyle: "plain", elbows: [{ style: "A", qty: 3 }] })).toBe("ready");
    // an old drawing without a kind: ready (rule 16 — its sum does not change)
    expect(bendOf({ shape: "rect" })).toBe("ready");
    expect(bendOf({ shape: "rect", dsStyle: "corrugated" })).toBe("ready");
    expect(bendOf({ shape: "round", dsStyle: "plain" })).toBe("ready");
  });
});

describe("«Расход v2» PR-1б: Д1 — the estimate's downspout up to 10 ft, each on its own; the sticks as they are", () => {
  const job = (dss: Partial<MeasuredDownspout>[], over?: Parameters<typeof computeGutterParts>[1]) =>
    computeGutterParts({ runs: [run({ id: "1", lengthIn: 480, story: 2 })], corners: [], downspouts: dss.map((x, i) => ds({ id: `d${i}`, runId: "1", ...x })) }, over).parts;
  it("22 ft → 30 ft in the estimate; 3 sticks of 10 ft from 22 ft", () => {
    const ps = job([{ heightIn: 264 }]);
    expect(q(ps, "ds.rect.3x4.alu.white")).toBe("30");
    expect(q(ps, "dsstick.rect.3x4.alu.white")).toBe("3");
    const why = ps.find((p) => p.key === "ds.rect.3x4.alu.white")!.why!;
    expect(why).toEqual({ rule: "ds_round_up", params: { downspouts: 1, lengthIn: 264, stepFt: 10, ft: 30 }, setting: "dsRoundUpFt" });
  });
  it("the sticks come from the real lengths, not the rounded ones: two of 22 ft → 60 ft in the estimate, 5 sticks (from 30 ft each — 6)", () => {
    const ps = job([{ heightIn: 264 }, { heightIn: 264 }]);
    expect(q(ps, "ds.rect.3x4.alu.white")).toBe("60");
    expect(q(ps, "dsstick.rect.3x4.alu.white")).toBe("5");
    expect(ps.find((p) => p.key === "dsstick.rect.3x4.alu.white")!.use).toBe("purchase");
  });
  it("each downspout on its own: 22 ft + 12 ft → 30 + 20 = 50 ft (not 34 → 40)", () => {
    const ps = job([{ heightIn: 264 }, { heightIn: 144 }]);
    expect(q(ps, "ds.rect.3x4.alu.white")).toBe("50");
    expect(ps.find((p) => p.key === "ds.rect.3x4.alu.white")!.why!.params).toMatchObject({ downspouts: 2, lengthIn: 408, ft: 50 });
  });
  it("a corrugated one of 2 stories with ready elbows: 20 ft, nothing to round — the reason still holds the line's feet", () => {
    const ps = job([{ dsStyle: "corrugated" }]);
    expect(q(ps, "ds.rect.3x4.corrugated.alu.white")).toBe("20");
    expect(ps.find((p) => p.key === "ds.rect.3x4.corrugated.alu.white")!.why!.params).toMatchObject({ downspouts: 1, lengthIn: 240, ft: 20 });
  });
  it("the reason adds up to the line: 240″ and 264″ of one kind → 50 ft, «2 downspouts, 504″, 50 ft» (§2.13)", () => {
    const ps = job([{ heightIn: 240 }, { heightIn: 264 }]);
    expect(q(ps, "ds.rect.3x4.alu.white")).toBe("50");
    expect(ps.find((p) => p.key === "ds.rect.3x4.alu.white")!.why!.params).toEqual({ downspouts: 2, lengthIn: 504, stepFt: 10, ft: 50 });
  });
  it("Н8: the step is 1, 5 or 10 ft; a blank field (0) or another number is the default 10 — never «not rounded» by mistake", () => {
    expect(q(job([{ heightIn: 264 }], { dsRoundUpFt: 5 }), "ds.rect.3x4.alu.white")).toBe("25");
    expect(q(job([{ heightIn: 264 }], { dsRoundUpFt: 0 }), "ds.rect.3x4.alu.white")).toBe("30");
    expect(q(job([{ heightIn: 264 }], { dsRoundUpFt: 7 }), "ds.rect.3x4.alu.white")).toBe("30");
    // whole feet: no reason (nothing to say beyond the feet)
    expect(job([{ heightIn: 264 }], { dsRoundUpFt: 1 }).find((p) => p.key === "ds.rect.3x4.alu.white")!.why).toBeUndefined();
  });
  it("a plain one of 2 stories, bent on site by default: 240″ + 3 × 6″ = 258″ → 30 ft (step 10), 22 ft (step 1); 3 sticks; straps from 240″", () => {
    const plain = { dsStyle: "plain" as const, elbows: undefined };
    const ps = job([plain]);
    expect(q(ps, "ds.rect.3x4.plain.alu.white")).toBe("30");
    expect(q(job([plain], { dsRoundUpFt: 1 }), "ds.rect.3x4.plain.alu.white")).toBe("22");
    expect(q(ps, "dsstick.rect.3x4.plain.alu.white")).toBe("3");
    // the wall fasteners count the wall, not the bends: 240″ at 60″ → 4 (from 258″ it would be 5)
    expect(ps.find((p) => p.why?.rule === "ds_straps_per_ds")!.why!.params).toMatchObject({ lengthIn: 240, straps: 4 });
  });
});

describe("«Расход v2» PR-1б: Д5 — the default elbows by kind", () => {
  const parts = (d: Partial<MeasuredDownspout>) => computeGutterParts({ runs: [run({ id: "1", lengthIn: 240 })], corners: [], downspouts: [ds({ id: "d", runId: "1", ...d })] }).parts;
  const elbows = (ps: PartQty[]) => ps.filter((p) => p.attrs.part === "elbow" || p.attrs.part === "offset").map((p) => `${p.key}=${p.qty}`);
  it("plain without elbows: no elbow lines, +18″ of downspout", () => {
    const ps = parts({ dsStyle: "plain", elbows: undefined });
    expect(elbows(ps)).toEqual([]);
    expect(ps.find((p) => p.key === "ds.rect.3x4.plain.alu.white")!.why!.params.lengthIn).toBe(138);
  });
  it("rectangular without a kind and without elbows: none, as before (rule 16)", () => {
    expect(elbows(parts({ elbows: undefined }))).toEqual([]);
    expect(q(parts({ elbows: undefined }), "labor.bend")).toBeUndefined();
  });
  it("plain with 3 × A set by hand, no word: 3 ready elbows", () => {
    expect(elbows(parts({ dsStyle: "plain", elbows: [{ style: "A", qty: 3 }] }))).toEqual(["elbow.A.rect.3x4.plain.alu.white=3"]);
  });
  it("round: 1 × 75° and 1 × 2″ (a stocked one: no «custom»)", () => {
    const ps = parts({ shape: "round", size: "3" });
    expect(elbows(ps)).toEqual(["elbow.75.round.3.alu.white=1", "offset.2.round.3.alu.white=1"]);
    expect(ps.find((p) => p.key === "offset.2.round.3.alu.white")!.attrs.custom).toBeUndefined();
  });
  it("round: the company's own default (45°) and an offset it does not stock (3″ — custom)", () => {
    const ps = computeGutterParts({ runs: [run({ id: "1", lengthIn: 240 })], corners: [], downspouts: [ds({ id: "d", runId: "1", shape: "round", size: "3" })] },
      { defaultElbowsRound: [{ style: "45", qty: 1 }], defaultOffsetsRound: [{ lengthIn: 3, qty: 1 }] }).parts;
    expect(elbows(ps)).toEqual(["elbow.45.round.3.alu.white=1", "offset.3.round.3.alu.white=1"]);
    expect(ps.find((p) => p.key === "offset.3.round.3.alu.white")!.attrs.custom).toBe("1");
  });
  it("round with offsets of its own: they, not the default", () => {
    expect(elbows(parts({ shape: "round", size: "3", offsets: [] }))).toEqual(["elbow.75.round.3.alu.white=1"]);
  });
});

describe("«Расход v2» PR-1б: Д6, Д7, Р4 — bends on site", () => {
  const parts = (d: Partial<MeasuredDownspout>, over?: Parameters<typeof computeGutterParts>[1]) =>
    computeGutterParts({ runs: [run({ id: "1", lengthIn: 240 })], corners: [], downspouts: [ds({ id: "d", runId: "1", dsStyle: "plain", ...d })] }, over).parts;
  const dsLine = (ps: PartQty[]) => ps.find((p) => p.key === "ds.rect.3x4.plain.alu.white")!;
  it("Д6: 1 story, 2 elbows on site → 120″ + 12″ = 132″ → 20 ft; 2 sticks; 2 bends; no elbow part, no piece", () => {
    const ps = parts({ elbowBend: "field", elbows: [{ style: "A", qty: 2 }] });
    expect(dsLine(ps).qty).toBe("20");
    expect(dsLine(ps).why!.params.lengthIn).toBe(132);
    expect(q(ps, "dsstick.rect.3x4.plain.alu.white")).toBe("2");
    expect(q(ps, "labor.bend")).toBe("2");
    expect(ps.find((p) => p.key === "labor.bend")!.why).toEqual({ rule: "bend_in_place", params: { downspouts: 1, bends: 2, perBendIn: 6, addedIn: 12 }, setting: "bendInBySize" });
    expect(ps.some((p) => p.attrs.part === "elbow")).toBe(false);
    // a bend is no piece: the joints are those of the same downspout made of 2 sticks with no elbows
    const rivets = (x: PartQty[]) => x.filter((p) => p.attrs.part === "rivet").map((p) => `${p.key}=${p.qty}`).join();
    expect(rivets(ps)).toBe(rivets(parts({ elbowBend: "ready", elbows: [], heightIn: 132 })));
  });
  it("Р4: plain without elbows → 3 bends; 2 elbows + 1 offset on site → 4", () => {
    expect(q(parts({ elbows: undefined }), "labor.bend")).toBe("3");
    expect(q(parts({ elbowBend: "field", elbows: [{ style: "A", qty: 2 }], offsets: [{ lengthIn: 2, qty: 1 }] }), "labor.bend")).toBe("4");
  });
  // the spec's «2″ and 4″ → +12″ + 16″ = +28″» slipped: by its own formula (+2 × 6″ + the offset's length) a 2″ one is +14″ — +30″ in all
  it("Д7: an offset on site is 2 bends and its length — 4″ × 1 → +16″; 2″ and 4″ → +14″ + 16″ = +30″, 4 bends; no offset parts", () => {
    const one = parts({ elbowBend: "field", elbows: [], offsets: [{ lengthIn: 4, qty: 1 }] });
    expect(q(one, "labor.bend")).toBe("2");
    expect(one.find((p) => p.key === "labor.bend")!.why!.params.addedIn).toBe(16);
    const two = parts({ elbowBend: "field", elbows: [], offsets: [{ lengthIn: 2, qty: 1 }, { lengthIn: 4, qty: 1 }] });
    expect(q(two, "labor.bend")).toBe("4");
    expect(dsLine(two).why!.params.lengthIn).toBe(150);
    expect(two.some((p) => p.attrs.part === "offset")).toBe(false);
  });
  it("Д7: ready offsets 2″ and 4″ → two offset lines, no bends", () => {
    const ps = parts({ elbowBend: "ready", elbows: [], offsets: [{ lengthIn: 2, qty: 1 }, { lengthIn: 4, qty: 1 }] });
    expect(ps.filter((p) => p.attrs.part === "offset").map((p) => p.key)).toEqual(["offset.2.rect.3x4.plain.alu.white", "offset.4.rect.3x4.plain.alu.white"]);
    expect(q(ps, "labor.bend")).toBeUndefined();
  });
  it("§2.15 №3: the inches of a bend are the company's, by size — 3×4, 3 bends → +18″; 3×4 at 8″ → +24″; a size not in the table — the default", () => {
    expect(dsLine(parts({ elbows: undefined })).why!.params.lengthIn).toBe(138);
    expect(dsLine(parts({ elbows: undefined }, { bendInBySize: { "3x4": 8 } })).why!.params.lengthIn).toBe(144);
    // the table is merged: 2x3 keeps its 6″ when the company changes 3x4
    expect(resolveGutterRules({ bendInBySize: { "3x4": 8 } }).bendInBySize).toEqual({ "2x3": 6, "3x4": 8, "4x5": 6 });
    const odd = computeGutterParts({ runs: [run({ id: "1", lengthIn: 240 })], corners: [], downspouts: [ds({ id: "d", runId: "1", dsStyle: "plain", size: "5x6", elbows: undefined })] }, { bendInDefault: 7 }).parts;
    expect(odd.find((p) => p.key === "ds.rect.5x6.plain.alu.white")!.why!.params.lengthIn).toBe(141);
    // a size named like an object's own word never reads the prototype: the default, not NaN
    const proto = computeGutterParts({ runs: [run({ id: "1", lengthIn: 240 })], corners: [], downspouts: [ds({ id: "d", runId: "1", dsStyle: "plain", size: "constructor", elbows: undefined })] }).parts;
    expect(proto.find((p) => p.key === "ds.rect.constructor.plain.alu.white")!.why!.params.lengthIn).toBe(138);
    // broken counts and lengths are none, never NaN
    const broken = computeGutterParts({ runs: [run({ id: "1", lengthIn: 240 })], corners: [], downspouts: [ds({ id: "d", runId: "1", dsStyle: "plain", elbowBend: "field", elbows: [{ style: "A", qty: Number.NaN }], offsets: [{ lengthIn: Number.NaN, qty: 1 }, { lengthIn: 4, qty: "x" as never }] })] }).parts;
    expect(q(broken, "labor.bend")).toBe("2");
    expect(broken.find((p) => p.key === "ds.rect.3x4.plain.alu.white")!.why!.params.lengthIn).toBe(132);
  });
  it("the company's bends of a plain one (Н2): 2 → +12″, 2 bends; 0 → none", () => {
    expect(q(parts({ elbows: undefined }, { fieldBends: 2 }), "labor.bend")).toBe("2");
    expect(q(parts({ elbows: undefined }, { fieldBends: 0 }), "labor.bend")).toBeUndefined();
  });
  it("a blank or broken setting is the default, never NaN (a field left empty is a number on the screen)", () => {
    const r = resolveGutterRules({ fieldBends: -1, bendInDefault: 1.5, dsRoundUpFt: Number.NaN, bendInBySize: { "3x4": -2 } } as never);
    expect([r.fieldBends, r.bendInDefault, r.dsRoundUpFt, r.bendInBySize["3x4"]]).toEqual([3, 6, 10, 6]);
    // broken round defaults: the defaults, not an empty list
    const rr = resolveGutterRules({ defaultOffsetsRound: [{ lengthIn: -2, qty: 1 }], defaultElbowsRound: [{ style: 75 as never, qty: 1 }] });
    expect([rr.defaultOffsetsRound, rr.defaultElbowsRound]).toEqual([[{ lengthIn: 2, qty: 1 }], [{ style: "75", qty: 1 }]]);
  });
  it("bends and the estimate's downspout are «use: estimate» — never in the supplier order (Т3)", () => {
    const ps = parts({ elbows: undefined });
    expect(ps.find((p) => p.key === "labor.bend")!.use).toBe("estimate");
    expect(dsLine(ps).use).toBe("estimate");
  });
});

describe("«Расход v2» PR-1б: the helpers the app reads", () => {
  it("fieldBendOf and dsRoundedIn", () => {
    expect(fieldBendOf({ shape: "rect", size: "3x4", dsStyle: "plain" })).toEqual({ bends: 3, perBendIn: 6, offsetIn: 0, addedIn: 18 });
    expect(fieldBendOf({ shape: "rect", size: "3x4", dsStyle: "corrugated" })).toEqual({ bends: 0, perBendIn: 6, offsetIn: 0, addedIn: 0 });
    expect(dsRoundedIn(264, 10)).toBe(360);
    expect(dsRoundedIn(240, 10)).toBe(240);
    expect(dsRoundedIn(258, 0)).toBe(258);
    expect(defaultOffsetsFor({ shape: "round" })).toEqual([{ lengthIn: 2, qty: 1 }]);
    expect(defaultOffsetsFor({ shape: "rect" })).toEqual([]);
  });
});
