/**
 * «Ничего молча» (spec 33-gutters-consumption §2.13, founder 16.11: «всё, что считается молча, должно как-то отображаться»):
 * every part the engine derives itself carries `why` (a rule of the closed list, its numbers, the setting); a part of the
 * drawing carries none. The gutter stock line carries its inches by where they come from (`coilBreakdown`, §2.12).
 * Nothing here changes a quantity (the parts version stays).
 */
import { describe, expect, it } from "vitest";
import { computeGutterParts, GUTTER_PARTS_VERSION, WHY_RULES, type MeasuredDownspout, type MeasuredRun, type MeasurementInput, type PartQty, type PartWhy } from "../src/gutterParts.js";

const run = (o: Partial<MeasuredRun> & { id: string; lengthIn: number }): MeasuredRun => ({
  profile: "k", size: "6", material: "alu_032", color: "white", story: 1, hanger: "hidden",
  ends: [{ kind: "cap" }, { kind: "cap" }], houseSide: "R", ...o,
});
const ds = (o: Partial<MeasuredDownspout> & { id: string; runId: string }): MeasuredDownspout => ({
  shape: "rect", size: "3x4", material: "alu", color: "white", bottom: { kind: "extension" }, elbows: [{ style: "A", qty: 3 }], ...o,
});

/**
 * What a person draws or picks (spec §2.13 «с чертежа»): these come with no `why`. Explicit — a new derived part that is not
 * here and has no `why` fails the guard below.
 */
const FROM_DRAWING = new Set([
  "miter", "strip_miter", "elbow", "offset", "reducer", "funnel", "conductor_head", "diverter", "eave_box", "outlet_screen",
  "extension", "splash_block", "flex", "drain", "splash_pan", "lower_roof", "wye", "rain_chain",
]);
/** what a reason may carry, by rule (the spec's table §2.13, as the screen reads it) — a new number is a row there first */
const PARAMS: Partial<Record<string, string[]>> = {
  hangers_spacing: ["runs", "lengthIn", "spacingIn", "atEnds", "hangers"],
  guard_pieces: ["runs", "coveredIn", "pieceIn", "pieces"],
  expansion_joint: ["runs", "lengthIn", "everyIn", "joints"],
  ds_straps_per_ds: ["downspouts", "lengthIn", "everyIn", "straps"],
  ds_sticks: ["downspouts", "lengthIn", "stickIn", "shared", "sticks"],
  ds_joint_screws: ["joints", "perJoint", "screws"],
  kit_screws: ["part", "screw", "units", "perUnit", "screws"],
  kit_anchors: ["wall", "units", "perUnit", "anchors"],
  kit_per_hanger: ["part", "hangers", "per"],
  flat_coil_straps: ["straps", "perStrapIn", "ft"],
  flux_per_solder: ["lb", "perJob", "cans"],
  touch_up_per_color: ["color"],
  slip_joints: ["sections", "sectionIn", "joints"],
  outlet_per_ds: ["downspouts"],
  endcap_free_end: ["side", "ends"],
  splash_guard_inside: ["corners"],
  coil_reserve: ["runs", "reserveFt"],
  corner_allowance: ["outCount", "outIn", "inCount", "inIn"],
  adapter_per_bottom: ["part", "bottoms"],
  ds_round_up: ["downspouts", "lengthIn", "stepFt", "ft"],
  bend_in_place: ["downspouts", "bends", "perBendIn", "addedIn"],
  soldering_kit: ["points", "solderLb", "fluxCans", "gasCylinders", "abrasivePacks", "soda", "perLb"],
  solder_work: ["points"],
};
/** a line of the drawing whose quantity the engine changed says how («Расход v2»: the downspout rounded up, the bends on site) */
const DRAWN_WITH_REASON = new Set(["ds_round_up", "bend_in_place", "solder_work"]);
const JOINT_KEYS = ["sections", "perSection", "endcaps", "perEndcap", "outlets", "perOutlet", "dsJoints", "perDsJoint", "cutCorners", "perCutCorner", "stripCorners", "perStripCorner", "prefabCorners", "perPrefabCorner"];
PARAMS.rivets_per_joints = [...JOINT_KEYS, "rivets"];
PARAMS.sealant_points = [...JOINT_KEYS, "points", "perTube", "tubes"];
PARAMS.solder_points = [...JOINT_KEYS, "points", "perLb", "lb"];
const fromDrawing = (p: PartQty) => p.use === "estimate" || FROM_DRAWING.has(p.attrs.part ?? "");

/** a job with every kind of derived part the engine has today */
const rich = (): MeasurementInput => ({
  runs: [
    run({ id: "s", lengthIn: 120, hanger: "spike" }),
    run({ id: "u", lengthIn: 96, hanger: "no_such_kit" }),
    run({ id: "a", lengthIn: 480, ends: [{ kind: "cap" }, { kind: "corner", cornerId: "c1" }], guardsIn: 240, guardType: "micromesh" }),
    run({ id: "b", lengthIn: 1300, ends: [{ kind: "corner", cornerId: "c1" }, { kind: "corner", cornerId: "c2" }], wedges: true }),
    run({ id: "c", lengthIn: 240, ends: [{ kind: "corner", cornerId: "c2" }, { kind: "cap" }], material: "copper", color: undefined, profile: "half_round" }),
  ],
  corners: [
    { id: "c1", kind: "out", method: "cut", profile: "k", size: "6", material: "alu_032", color: "white", story: 1 },
    { id: "c2", kind: "in", method: "strip", profile: "k", size: "6", material: "alu_032", color: "white", story: 1, splashGuard: true },
  ],
  downspouts: [
    ds({ id: "d1", runId: "a" }),
    ds({ id: "d2", runId: "b", wall: "stucco" }),
    ds({ id: "d3", runId: "b", shape: "round", size: "3", elbows: undefined, wall: "wood" }),
    ds({ id: "d4", runId: "c", shape: "round", size: "3", material: "copper", color: undefined, endOutlet: "end" }),
  ],
  wyes: [{ id: "y", dsIds: ["d1", "d2"] }],
  chains: [{ id: "ch", runId: "a", story: 1 }],
});
const RULE_SETS = [undefined, { expansionJointPart: true, seamless: false }, { dsJoin: "screw" as const, wallKitByWall: { rect: { wood: "coil_strap" } }, sealantByColor: true }];

describe("every derived part says why (§2.13)", () => {
  for (const over of RULE_SETS) {
    it(`a rich job${over ? ` with ${JSON.stringify(over)}` : ""}: no part the engine added is silent`, () => {
      const { parts } = computeGutterParts(rich(), over as never);
      const silent = parts.filter((p) => !fromDrawing(p) && !p.why).map((p) => p.key);
      expect(silent).toEqual([]);
      // the drawing's own parts say nothing — but the ones whose quantity the engine changed (the rounded downspout, the bends)
      expect(parts.filter((p) => fromDrawing(p) && p.why && !DRAWN_WITH_REASON.has(p.why.rule)).map((p) => p.key)).toEqual([]);
    });
  }
  it("every reason is a rule of the closed list, its numbers are numbers or words, and it is never in attrs", () => {
    for (const over of RULE_SETS) {
      for (const p of computeGutterParts(rich(), over as never).parts) {
        const all = p.why ? [p.why, ...(p.why.also ?? [])] : [];
        for (const w of all) {
          expect(WHY_RULES, p.key).toContain(w.rule);
          for (const v of Object.values(w.params)) expect(["number", "string"], p.key).toContain(typeof v);
          const allowed = PARAMS[w.rule];
          if (allowed) expect(Object.keys(w.params).filter((k) => !allowed.includes(k)), `${p.key} ${w.rule}`).toEqual([]);
        }
        expect(Object.keys(p.attrs).some((k) => k === "why" || k === "coilBreakdown"), p.key).toBe(false);
      }
    }
  });
  it("the reasons cover what the job has: hangers, screws, anchors, straps, rivets, sealant, solder, paint, sticks, outlets, caps, guards", () => {
    const rules = new Set(computeGutterParts(rich()).parts.flatMap((p) => (p.why ? [p.why, ...(p.why.also ?? [])] : [])).map((w) => w.rule));
    for (const r of ["hangers_spacing", "kit_screws", "kit_anchors", "kit_per_hanger", "ds_straps_per_ds", "rivets_per_joints", "sealant_points", "solder_points", "soldering_kit", "touch_up_per_color", "ds_sticks", "outlet_per_ds", "endcap_free_end", "guard_pieces", "splash_guard_inside", "coil_reserve", "corner_allowance"])
      expect(rules, r).toContain(r);
  });
  it("the line's count is the reason's total: hangers, pieces, joints, straps, sticks, screws, rivets, tubes, pounds — never a recount", () => {
    const TOTAL: Record<string, string> = { hangers_spacing: "hangers", guard_pieces: "pieces", expansion_joint: "joints", ds_straps_per_ds: "straps", ds_sticks: "sticks", rivets_per_joints: "rivets", sealant_points: "tubes", solder_points: "lb", flat_coil_straps: "ft", slip_joints: "joints" };
    for (const over of RULE_SETS) for (const p of computeGutterParts(rich(), over as never).parts) {
      const w = p.why;
      if (!w || !TOTAL[w.rule]) continue;
      const sum = [w, ...(w.also ?? [])].filter((x) => x.rule === w.rule).reduce((n, x) => n + Number(x.params[TOTAL[w.rule]!] ?? 0), 0);
      expect(sum, `${p.key} ${w.rule}`).toBe(Number(p.qty));
    }
  });
  it("the parts version is 7 (G2; 6 was «Расход v2» PR-2, which changed what a copper or zinc drawing counts (the soldering kit and work, fasteners' metal, expansion joints by metal)", () => {
    expect(GUTTER_PARTS_VERSION).toBe("7");
  });
  it("a big drawing still fits the revision (the server takes elements + parts up to 512 KB): the parts of 200 runs and 200 downspouts stay under 384 KB", () => {
    const colors = ["white", "brown", "black", "almond", "bronze"];
    const i: MeasurementInput = {
      runs: Array.from({ length: 200 }, (_, k) => run({ id: `r${k}`, lengthIn: 240 + k, color: colors[k % 5], guardsIn: 120, guardType: "micromesh" })),
      corners: [],
      downspouts: Array.from({ length: 200 }, (_, k) => ds({ id: `d${k}`, runId: `r${k}`, color: colors[k % 5], size: k % 2 ? "2x3" : "3x4" })),
    };
    expect(JSON.stringify(computeGutterParts(i).parts).length).toBeLessThan(384 * 1024);
  });
});

describe("the numbers of a reason", () => {
  const one = (i: MeasurementInput, key: string, over?: object) => computeGutterParts(i, over as never).parts.find((p) => p.key === key)!;
  it("hangers: the drawn length, the spacing, one at each end; two runs of one hanger add their length and hangers, the spacing stays", () => {
    const i: MeasurementInput = { runs: [run({ id: "1", lengthIn: 240 }), run({ id: "2", lengthIn: 120 })], corners: [], downspouts: [] };
    const h = computeGutterParts(i).parts.find((p) => p.attrs.part === "hanger")!;
    // each run has its own (240 / 24 + 1 = 11, 120 / 24 + 1 = 6): the line is 17, not 360 / 24 + 1 — the reason says two runs
    expect(h.why).toMatchObject({ rule: "hangers_spacing", params: { runs: 2, lengthIn: 360, spacingIn: 24, atEnds: 1, hangers: 17 } });
    expect(Number(h.qty)).toBe(h.why!.params.hangers);
    expect(h.why!.also).toBeUndefined();
  });
  it("sealant: the points by joint kind make the tubes", () => {
    const i: MeasurementInput = { runs: [run({ id: "1", lengthIn: 240 })], corners: [], downspouts: [ds({ id: "d", runId: "1" })] };
    const s = computeGutterParts(i).parts.find((p) => p.attrs.part === "sealant")!;
    const w = s.why!;
    expect(w.rule).toBe("sealant_points");
    expect(w.params.endcaps).toBe(2);
    expect(w.params.outlets).toBe(1);
    expect(Number(s.qty)).toBe(Math.ceil(Number(w.params.points) / Number(w.params.perTube)));
    expect(w.params.tubes).toBe(Number(s.qty));
  });
  it("rivets: the joints by kind and their rate; the sum is the line", () => {
    const i: MeasurementInput = { runs: [run({ id: "1", lengthIn: 240 })], corners: [], downspouts: [ds({ id: "d", runId: "1" })] };
    const r = computeGutterParts(i).parts.find((p) => p.attrs.part === "rivet")!;
    expect(r.why!.rule).toBe("rivets_per_joints");
    expect(r.why!.params.rivets).toBe(Number(r.qty));
  });
  it("one screw line from two rules (the downspout's straps and the guard pieces): one line, both reasons, the screws add up to it", () => {
    const i: MeasurementInput = { runs: [run({ id: "1", lengthIn: 240, guardsIn: 240, guardType: "micromesh" })], corners: [], downspouts: [ds({ id: "d", runId: "1" })] };
    const sc = computeGutterParts(i).parts.find((p) => p.key === "screw.8x05" || (p.attrs.part === "screw" && p.attrs.screw === "8x0.5"))!;
    const all = [sc.why!, ...(sc.why!.also ?? [])];
    expect(all.length).toBeGreaterThan(1);
    expect(all.reduce((n, w) => n + Number(w.params.screws ?? 0), 0)).toBe(Number(sc.qty));
  });
  it("downspout sticks: the downspouts, their length, the stick, offcuts shared", () => {
    const i: MeasurementInput = { runs: [run({ id: "1", lengthIn: 240 })], corners: [], downspouts: [ds({ id: "a", runId: "1" }), ds({ id: "b", runId: "1" })] };
    const st = computeGutterParts(i).parts.find((p) => p.key.startsWith("dsstick."))!;
    expect(st.why).toMatchObject({ rule: "ds_sticks", params: { downspouts: 2, stickIn: 120, shared: 1, sticks: Number(st.qty) } });
  });
  it("straps cut from coil: the straps, inches a strap, the feet", () => {
    const i: MeasurementInput = { runs: [run({ id: "1", lengthIn: 240 })], corners: [], downspouts: [ds({ id: "d", runId: "1" })] };
    const f = one(i, computeGutterParts(i, { wallKitByWall: { rect: { wood: "coil_strap" } } } as never).parts.find((p) => p.attrs.part === "flat_coil")!.key, { wallKitByWall: { rect: { wood: "coil_strap" } } });
    expect(f.why).toMatchObject({ rule: "flat_coil_straps", params: { perStrapIn: 16, ft: Number(f.qty) } });
  });
});

describe("different rates of the corners (a company's joints): each kind its own numbers, the total right", () => {
  it("cut and ready-made corners with other sealant points: one group, the points and the tubes are the line's", () => {
    const i: MeasurementInput = {
      runs: [run({ id: "1", lengthIn: 240, ends: [{ kind: "corner", cornerId: "a" }, { kind: "corner", cornerId: "b" }] })],
      corners: [
        { id: "a", kind: "out", method: "cut", profile: "k", size: "6", material: "alu_032", color: "white", story: 1 },
        { id: "b", kind: "out", method: "prefab", profile: "k", size: "6", material: "alu_032", color: "white", story: 1 },
      ],
      downspouts: [],
    };
    const s = computeGutterParts(i, { joints: { corner_cut: { sealant: 3 }, corner_prefab: { sealant: 2 } }, jointsPerSealantTube: 4 } as never).parts.find((p) => p.attrs.part === "sealant")!;
    expect(s.why!.also).toBeUndefined();
    expect(s.why!.params).toMatchObject({ cutCorners: 1, perCutCorner: 3, prefabCorners: 1, perPrefabCorner: 2, points: 5, perTube: 4, tubes: 2 });
    expect(s.qty).toBe("2");
  });
});

describe("the gutter stock line: drawn + corners + reserve (§2.12)", () => {
  const job = (corner?: "out" | "in"): MeasurementInput => ({
    runs: [run({ id: "1", lengthIn: 264, ends: [{ kind: "cap" }, corner ? { kind: "corner", cornerId: "c" } : { kind: "cap" }] })],
    corners: corner ? [{ id: "c", kind: corner, method: "cut", profile: "k", size: "6", material: "alu_032", color: "white", story: 1 }] : [],
    downspouts: [],
  });
  const coil = (i: MeasurementInput, over?: object) => computeGutterParts(i, over as never).parts.find((p) => p.key.startsWith("coil."))!;
  it("one run of 22 ft and an outside corner: 264 + 14 + the reserve; the sum before rounding up is the line", () => {
    const c = coil(job("out"));
    expect(c.coilBreakdown).toEqual({ drawnIn: 264, cornersIn: 14, wasteIn: 120 });
    const sum = c.coilBreakdown!.drawnIn + c.coilBreakdown!.cornersIn + c.coilBreakdown!.wasteIn;
    expect(Number(c.qty)).toBe(Math.ceil(sum / 12));
    expect(c.why).toMatchObject({ rule: "coil_reserve", params: { runs: 1, reserveFt: 10 }, also: [{ rule: "corner_allowance", params: { outCount: 1, outIn: 14, inCount: 0 } }] });
  });
  it("the spec's case (reserve 3 ft — the company's number until PR-1 makes it the default): 264 / 14 / 36 → 314″ → 27 ft", () => {
    const c = coil(job("out"), { wasteFt: 3 });
    expect(c.coilBreakdown).toEqual({ drawnIn: 264, cornersIn: 14, wasteIn: 36 });
    expect(c.qty).toBe("27");
  });
  it("an inside corner: the inside allowance (6″ today; the spec's 7″ comes with PR-1); no corner: no corner reason", () => {
    expect(coil(job("in")).coilBreakdown!.cornersIn).toBe(6);
    const none = coil(job());
    expect(none.coilBreakdown!.cornersIn).toBe(0);
    expect(none.why!.also).toBeUndefined();
  });
  it("sections: the same breakdown on the section line", () => {
    const s = computeGutterParts(job("out"), { seamless: false } as never).parts.find((p) => p.key.startsWith("section."))!;
    expect(s.coilBreakdown).toEqual({ drawnIn: 264, cornersIn: 14, wasteIn: 120 });
  });
  it("two runs of one stock: their lengths add, two runs", () => {
    const i: MeasurementInput = { runs: [run({ id: "1", lengthIn: 264 }), run({ id: "2", lengthIn: 120 })], corners: [], downspouts: [] };
    const c = coil(i);
    expect(c.coilBreakdown!.drawnIn).toBe(384);
    expect((c.why as PartWhy).params.runs).toBe(2);
  });
});
