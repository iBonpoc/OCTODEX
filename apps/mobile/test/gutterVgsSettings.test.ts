/**
 * V1 (docs/specs/33-gutters-parts.md П18.15): the company's fastener choices in the module settings — spike length by
 * gutter size, the kits' wood screw and washer, the anchor, sealant by color — read safely and sent to the engine; the
 * prices list follows the sealant choice. Sizes only, never a brand; defaults «проверить».
 */
import { describe, expect, it } from "vitest";
import { computeGutterParts, DEFAULT_SPIKE_LENGTH_IN } from "@octo/estimating-engine";
import { matchAttrs, materialRows } from "../src/modules/gutters/prices";
import { readUse, SPIKE_SIZES, toRulesOverride } from "../src/modules/gutters/settings";

describe("readUse: fasteners", () => {
  it("defaults: spike lengths of the engine, #10 × 1½″ without a washer, any anchor, one plain sealant", () => {
    const u = readUse({});
    expect(u.spikeLenIn).toEqual(Object.fromEntries(SPIKE_SIZES.map((s) => [s, DEFAULT_SPIKE_LENGTH_IN[s]])));
    expect([u.woodScrew, u.washer, u.anchor, u.sealantByColor]).toEqual(["10x1.5", false, "masonry", false]);
  });
  it("only the listed values; anything else falls back (an older or a broken setting)", () => {
    const u = readUse({ use: { spikeLenIn: { "5": "6.5", "6": "99", "7": 9 }, woodScrew: "10x3", washer: "yes", anchor: "1/4x1", sealantByColor: true } });
    expect(u.spikeLenIn["5"]).toBe("6.5");
    expect(u.spikeLenIn["6"]).toBe(DEFAULT_SPIKE_LENGTH_IN["6"]);
    expect(u.spikeLenIn["7"]).toBe(DEFAULT_SPIKE_LENGTH_IN["7"]);
    expect([u.woodScrew, u.washer, u.anchor, u.sealantByColor]).toEqual(["10x1.5", false, "1/4x1", true]);
  });
});

describe("toRulesOverride → the engine", () => {
  const raw = { use: { spikeLenIn: { "6": "7.5" }, woodScrew: "10x2", washer: true, anchor: "3/16x7/8", sealantByColor: true } };
  it("the choices reach the engine's rules", () => {
    const o = toRulesOverride(raw);
    expect(o.kitLengthIn?.spike?.["6"]).toBe("7.5");
    expect(o.woodScrew).toEqual({ screw: "10x2", washer: true });
    expect([o.anchor, o.sealantByColor]).toEqual(["3/16x7/8", true]);
  });
  it("a spike job: the 6″ gutter's spike is 7.5″", () => {
    const run = { id: "1", lengthIn: 240, profile: "k" as const, size: "6", material: "alu_032", color: "white", story: 1, hanger: "spike", ends: [{ kind: "cap" }, { kind: "cap" }] as [{ kind: "cap" }, { kind: "cap" }], houseSide: "R" as const };
    const { parts } = computeGutterParts({ runs: [run], corners: [], downspouts: [] }, toRulesOverride(raw));
    expect(parts.find((p) => p.attrs.part === "spike")!.attrs.lengthIn).toBe("7.5");
  });
  it("the prices list: one plain sealant by default, in the joint's color when the company turns it on (screws are purchase only)", () => {
    const sealant = (r: unknown) => materialRows(r).map((x) => matchAttrs(x.part)).filter((a) => a.part === "sealant");
    expect(sealant({})).toEqual([{ part: "sealant" }]);
    expect(sealant(raw)).toEqual([{ part: "sealant", color: "white" }]);
  });
});
