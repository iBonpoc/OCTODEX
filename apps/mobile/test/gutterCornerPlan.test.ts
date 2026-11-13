import { describe, expect, it } from "vitest";
import { angleArc, cutPoint, fmtDeg, legsAngleDeg, type Leg, type V } from "../src/modules/gutters/canvas/cornerPlan";
import { cutAngleDeg } from "../src/modules/gutters/geometry";

/** #1276: the corner sheet's drawing — the cut line follows the cut angle of the table */
const unit = (deg: number): V => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
/** two legs from the origin, `theta` degrees between them; the faces stand on the outer side of the angle */
const legs = (theta: number): { a: Leg; b: Leg } => {
  const ua = unit(0), ub = unit(theta);
  // the normal of a leg towards the face = away from the other leg
  const na: V = [-ub[0] + ua[0] * (ub[0] * ua[0] + ub[1] * ua[1]), -ub[1] + ua[1] * (ub[0] * ua[0] + ub[1] * ua[1])];
  const nb: V = [-ua[0] + ub[0] * (ua[0] * ub[0] + ua[1] * ub[1]), -ua[1] + ub[1] * (ua[0] * ub[0] + ua[1] * ub[1])];
  const norm = (v: V): V => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
  return { a: { u: ua, n: norm(na) }, b: { u: ub, n: norm(nb) } };
};

describe("the cut line of the corner drawing", () => {
  for (const theta of [90, 135, 100, 60]) {
    it(`${theta}° between the walls: the cut is ${cutAngleDeg(180 - theta)}° off the square end of a gutter`, () => {
      const { a, b } = legs(theta);
      const m = cutPoint([0, 0], a, b, 5);
      const toMiter: V = [m[0] / Math.hypot(...m), m[1] / Math.hypot(...m)];
      const acute = Math.min(legsAngleDeg(toMiter, a.u), 180 - legsAngleDeg(toMiter, a.u)); // the cut line against the gutter
      expect(Math.abs(90 - acute)).toBeCloseTo(cutAngleDeg(180 - theta), 5);
    });
  }
  it("the miter lies on the outer side: the faces meet beyond the corner, not inside the angle", () => {
    const { a, b } = legs(90);
    const m = cutPoint([0, 0], a, b, 5);
    expect(m[0] < 0 && m[1] < 0).toBe(true);
    expect(Math.hypot(...m)).toBeCloseTo(5 * Math.SQRT2, 5);
  });
});

describe("the arc across the angle", () => {
  it("from one leg to the other, the short way; the degrees stand on the bisector past the arc", () => {
    const arc = angleArc([0, 0], unit(0), unit(90), 20, 10)!;
    expect(arc.from).toEqual([20, 0]);
    expect(arc.to[0]).toBeCloseTo(0, 9);
    expect(arc.to[1]).toBeCloseTo(20, 9);
    expect(arc.label[0]).toBeCloseTo(30 * Math.SQRT1_2, 9);
    expect(arc.label[1]).toBeCloseTo(30 * Math.SQRT1_2, 9);
    expect(arc.sweep).toBe(1);
    expect(angleArc([0, 0], unit(90), unit(0), 20, 10)!.sweep).toBe(0); // the other way round
  });
  it("legs on one line: no arc", () => {
    expect(angleArc([0, 0], unit(0), unit(180), 20, 10)).toBeNull();
    expect(angleArc([0, 0], unit(0), unit(0), 20, 10)).toBeNull();
  });
});

describe("the cut written as it is cut", () => {
  it("45°, 22½°, ½°", () => {
    expect(fmtDeg(45)).toBe("45");
    expect(fmtDeg(22.5)).toBe("22½");
    expect(fmtDeg(0.5)).toBe("½");
    expect(fmtDeg(cutAngleDeg(45))).toBe("22½");
    expect(fmtDeg(cutAngleDeg(90))).toBe("45");
  });
});
