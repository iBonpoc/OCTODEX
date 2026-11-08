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
    expect(r).toEqual({ totalCents: 200, unpriced: 1, gutterFt: "2" });
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
  it("nothing drawn → $0", () => expect(gutterPreview([], {})).toEqual({ totalCents: 0, unpriced: 0, gutterFt: "0" }));
});
