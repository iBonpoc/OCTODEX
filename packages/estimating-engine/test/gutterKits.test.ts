import { describe, it, expect } from "vitest";
import { DEFAULT_GUARD_KITS, DEFAULT_HANGER_BY_MOUNT, DEFAULT_HANGER_KITS, DEFAULT_JOINTS, DEFAULT_WALL_KITS, DEFAULT_WALL_KIT_BY_WALL, GUTTER_MOUNTS } from "../src/gutterKits.js";
import { computeGutterParts, defaultHangerKit, resolveGutterRules, type GutterProfile } from "../src/gutterParts.js";

/** docs/specs/33-gutters-parts.md П18.6–П18.8: the default kits are complete and well formed. */

const PROFILES: GutterProfile[] = ["k", "half_round", "euro", "fascia", "box"];

describe("default kits", () => {
  it("every hanger kit: spacing > 0, at least one part, every part > 0", () => {
    for (const [id, k] of Object.entries(DEFAULT_HANGER_KITS)) {
      expect(k.spacingIn, id).toBeGreaterThan(0);
      expect(k.parts.length, id).toBeGreaterThan(0);
      for (const p of k.parts) expect(p.per, `${id}.${p.part}`).toBeGreaterThan(0);
      // the client sees exactly one part of a kit: the hanger itself
      expect(k.parts.filter((p) => p.use === "both").length, id).toBe(1);
    }
  });
  it("the founder's list is there (07.11)", () => {
    for (const id of ["hidden", "hidden_noscrew", "hidden_clip", "hidden_boss", "hidden_hd", "hangfast", "spike", "rafter", "roof_bar", "wrap_around", "tbar_strap", "hr_shank_fascia", "hr_shank_rafter", "hr_shank_sheathing", "hr_shank_crown", "hr_shank_angled"]) {
      expect(DEFAULT_HANGER_KITS[id], id).toBeDefined();
    }
    for (const id of ["ds_strap", "coil_strap", "sickle_hook", "u_bracket", "conductor_band", "brick_hook", "hinged_hook", "pipe_cleat"]) {
      expect(DEFAULT_WALL_KITS[id], id).toBeDefined();
    }
  });
  it("every profile × roof edge has a default kit that exists", () => {
    for (const p of PROFILES) for (const m of GUTTER_MOUNTS) {
      const id = defaultHangerKit(p, m);
      expect(DEFAULT_HANGER_BY_MOUNT[p]?.[m], `${p}.${m}`).toBe(id);
      expect(DEFAULT_HANGER_KITS[id], `${p}.${m}`).toBeDefined();
    }
    expect(defaultHangerKit("half_round", "rafter")).toBe("hr_shank_rafter");
  });
  it("every shape × wall default points to a wall kit; every wall kit part > 0", () => {
    for (const [shape, walls] of Object.entries(DEFAULT_WALL_KIT_BY_WALL)) for (const [wall, id] of Object.entries(walls)) {
      expect(DEFAULT_WALL_KITS[id], `${shape}.${wall}`).toBeDefined();
    }
    for (const [id, k] of Object.entries(DEFAULT_WALL_KITS)) for (const p of k.parts) expect(p.per, `${id}.${p.part}`).toBeGreaterThan(0);
  });
  it("guards: piece length > 0; joints: no negative counts", () => {
    for (const k of Object.values(DEFAULT_GUARD_KITS)) expect(k.pieceIn).toBeGreaterThan(0);
    for (const j of Object.values(DEFAULT_JOINTS)) {
      expect(j.rivets).toBeGreaterThanOrEqual(0);
      expect(j.sealant).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("company kits merge with the defaults", () => {
  it("an own kit is added, the defaults stay, an own spacing wins", () => {
    const rules = resolveGutterRules({ hangerKits: { own: { spacingIn: 30, parts: [{ part: "hanger", per: 1, byKit: true, bySize: true, use: "both" }] } } });
    expect(rules.hangerKits.hidden).toBeDefined();
    const { parts } = computeGutterParts(
      { runs: [{ id: "1", profile: "k", size: "6", material: "aluminum", story: 1, lengthIn: 480, hanger: "own", ends: [{ kind: "cap" }, { kind: "cap" }], houseSide: "R" }], corners: [], downspouts: [] },
      { hangerKits: rules.hangerKits },
    );
    expect(parts.find((p) => p.key === "hanger.own.k.6")?.qty).toBe("16");
  });
});
