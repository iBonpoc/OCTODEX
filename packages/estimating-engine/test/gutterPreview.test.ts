import { describe, expect, it } from "vitest";
import { gutterPreview } from "../src/gutterPreview.js";
import { computeGutterParts, type PartQty } from "../src/gutterParts.js";

/** docs/specs/33-gutters-canvas.md П20.2 №3: the $ under the drawing — parts × a rate per section and unit, in cents. */
const part = (o: Partial<PartQty>): PartQty => ({ key: "k", section: "gutter", qty: "1", unit: "ft", use: "estimate", kind: "material", attrs: {}, ...o });

describe("gutterPreview", () => {
  it("sums qty × rate in whole cents (half up), decimal not float", () => {
    const r = gutterPreview([part({ qty: "40.5" }), part({ key: "c", section: "corners_caps", unit: "ea", qty: "3" })], { "gutter.ft": 1199, "corners_caps.ea": 2500 });
    expect(r.totalCents).toBe(Math.round(40.5 * 1199) + 7500); // 48559.5 → 48560 + 7500
    expect(r.totalCents).toBe(56060);
    expect(r.gutterFt).toBe("40.5");
  });
  it("0.1 + 0.2 style quantities stay exact", () => {
    expect(gutterPreview([part({ qty: "0.1" }), part({ qty: "0.2" })], { "gutter.ft": 1000 }).totalCents).toBe(300);
  });
  it("supplier-only parts are left out; a part with no rate is counted as unpriced, not $0", () => {
    const r = gutterPreview([part({ use: "purchase", qty: "42" }), part({ section: "guards", qty: "10" }), part({ use: "both", qty: "2" })], { "gutter.ft": 100 });
    expect(r).toEqual({ totalCents: 200, unpriced: 1, gutterFt: "2", listed: 0 });
  });
  it("labor counts like material", () => {
    expect(gutterPreview([part({ section: "labor", kind: "labor", qty: "40" })], { "labor.ft": 300 }).totalCents).toBe(12000);
  });
  it("a real measurement: 40 ft run, one downspout — total is the sum of its estimate parts", () => {
    const { parts } = computeGutterParts({
      runs: [{ id: "1", profile: "k", size: "5", material: "aluminum", gauge: ".027", color: "white", story: 1, hanger: "hidden", lengthIn: 480, ends: [{ kind: "cap" }, { kind: "cap" }], houseSide: "R" }],
      corners: [],
      downspouts: [{ id: "d", runId: "1", shape: "rect", size: "2x3", material: "aluminum", color: "white", bottom: { kind: "extension" } }],
    });
    const rates = Object.fromEntries(parts.map((p) => [`${p.section}.${p.unit}`, 100]));
    const r = gutterPreview(parts, rates);
    expect(r.unpriced).toBe(0);
    expect(r.gutterFt).toBe("40");
    expect(r.totalCents).toBe(parts.filter((p) => p.use !== "purchase").reduce((s, p) => s + Number(p.qty) * 100, 0));
  });
  it("nothing drawn → $0", () => expect(gutterPreview([], {})).toEqual({ totalCents: 0, unpriced: 0, gutterFt: "0", listed: 0 }));
  describe("the company's price list first (M7d, spec 33 П22.10)", () => {
    const gut = part({ key: "g", qty: "40.5", attrs: { part: "gutter" } });
    const lab = part({ key: "l", section: "labor", kind: "labor", qty: "40.5", attrs: { work: "install", story: "2" } });
    it("a listed part takes its own price (qty × cents, half up), the rest the rate", () => {
      const r = gutterPreview([gut, lab], { "gutter.ft": 1000, "labor.ft": 300 }, (p) => (p.attrs.work === "install" ? 455 : undefined));
      // 40.5 × 1000 = 40500; 40.5 × 455 = 18427.5 → sum 58927.5 → 58928
      expect(r).toMatchObject({ totalCents: 58928, listed: 1, unpriced: 0 });
    });
    it("a list price of 0 is a price ($0), not «no price»", () => {
      expect(gutterPreview([gut], {}, () => 0)).toMatchObject({ totalCents: 0, listed: 1, unpriced: 0 });
    });
    it("a broken price (fraction of a cent, negative, NaN) is not used: the rate, or «no price»", () => {
      for (const bad of [12.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(gutterPreview([gut], { "gutter.ft": 100 }, () => bad)).toMatchObject({ totalCents: 4050, listed: 0 });
        expect(gutterPreview([gut], {}, () => bad)).toMatchObject({ totalCents: 0, listed: 0, unpriced: 1 });
      }
    });
    it("supplier-only parts are never priced, also from the list", () => {
      expect(gutterPreview([part({ use: "purchase" })], {}, () => 999)).toMatchObject({ totalCents: 0, listed: 0 });
    });
    it("many small prices add up in decimal: 3 × 0.1 ft × 333¢ = 99.9 → 100", () => {
      const p = part({ qty: "0.1" });
      expect(gutterPreview([p, { ...p, key: "b" }, { ...p, key: "c" }], {}, () => 333).totalCents).toBe(100);
    });
  });
});
