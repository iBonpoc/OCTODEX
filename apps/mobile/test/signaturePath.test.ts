/**
 * Signature paths in one box, 400 × 160 (the PDF's viewBox; founder 07.11: on 820/1280 the right part of a signature
 * fell outside the PDF). A client's signature is legally meaningful: only the scale changes, evenly on both axes —
 * every point stays, nothing is smoothed or dropped.
 */
import { describe, expect, it } from "vitest";
import { SIG_BOX, fitSignature, normalizeSignature, signatureBounds } from "../src/features/signaturePath";

const nums = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number);

describe("normalizeSignature (on save)", () => {
  it("a phone field (≤ 400 × 160) is saved as drawn — old phone signatures look the same", () => {
    const d = "M10.0 20.0 L300.5 140.2 ";
    expect(normalizeSignature(d, 358, 160)).toBe(d);
  });
  it("a wide field (700 × 160) is scaled evenly into the box: every point × the same factor, none dropped", () => {
    const d = "M20.0 80.0 L350.0 40.0 L690.0 120.0 ";
    const out = normalizeSignature(d, 700, 160);
    const a = nums(d), b = nums(out);
    expect(b).toHaveLength(a.length);
    const k = SIG_BOX.w / 700;
    b.forEach((v, i) => expect(v).toBeCloseTo(a[i]! * k, 2));
    expect(out.match(/[ML]/g)).toEqual(d.match(/[ML]/g));
  });
  it("a tall field fits by height", () => {
    const out = normalizeSignature("M0 0 L300 320 ", 300, 320);
    expect(signatureBounds(out).maxY).toBeCloseTo(160, 2);
    expect(signatureBounds(out).maxX).toBeCloseTo(150, 2);
  });
});

describe("fitSignature (on show — also mends old wide signatures)", () => {
  it("inside the box: unchanged", () => {
    expect(fitSignature("M1 2 L399 159 ")).toBe("M1 2 L399 159 ");
  });
  it("an old path from a 700-px field: scaled evenly to fit 400 × 160, proportions kept", () => {
    const d = "M20.0 80.0 L350.0 40.0 L690.0 120.0 ";
    const out = fitSignature(d);
    const b = signatureBounds(out);
    expect(b.maxX).toBeLessThanOrEqual(SIG_BOX.w);
    expect(b.maxY).toBeLessThanOrEqual(SIG_BOX.h);
    const k = SIG_BOX.w / 690; // the widest point decides; one factor for both axes
    nums(out).forEach((v, i) => expect(v).toBeCloseTo(nums(d)[i]! * k, 1)); // rounded to 0.01 px
  });
  it("an empty path stays empty", () => {
    expect(fitSignature("")).toBe("");
  });
});
