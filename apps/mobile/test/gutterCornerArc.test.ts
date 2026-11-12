/**
 * #818 / founder 12.11: the angle at a corner is marked as in a geometry drawing — a dash-dot arc across it — and a picked
 * gutter's joint has a ring (the handle to drag it). Scene data: the painter only draws them.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { drawing as DT } from "@octo/design-tokens";
import { buildScene, fitView } from "../src/modules/gutters/canvas/scene";
import type { Drawing, P } from "../src/modules/gutters/geometry";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const L: Drawing = { runs: [{ id: "A", a: [0, 0], b: [600, 0], attrs }, { id: "B", a: [600, 0], b: [600, 400], attrs }], downspouts: [] };
const vp = { w: 390, h: 600 };
const opts = (d: Drawing, selected: string | null = null) => ({ view: fitView(d.runs.flatMap((r) => [r.a, r.b]), vp, 40), viewport: vp, fontSize: 14, padX: 4, gap: 4, dsPad: 7, dsText: (n: number) => `D${n}`, storyText: (n: number) => `эт ${n}`, selected });

describe("the arc of an angle", () => {
  it("a right angle: an arc of radius r from one gutter's direction to the other's, both ends on the circle round the joint", () => {
    const k = buildScene(L, opts(L)).corners[0]!;
    expect(k.arc).not.toBeNull();
    const { from, to, r } = k.arc!;
    expect(Math.hypot(from[0] - k.at[0], from[1] - k.at[1])).toBeCloseTo(r, 6);
    expect(Math.hypot(to[0] - k.at[0], to[1] - k.at[1])).toBeCloseTo(r, 6);
    // along the two gutters: one end of the arc to the left of the joint (gutter A runs left), the other below it (B goes down on screen)
    const u0: P = [from[0] - k.at[0], from[1] - k.at[1]], u1: P = [to[0] - k.at[0], to[1] - k.at[1]];
    expect(Math.abs(u0[0] * u1[0] + u0[1] * u1[1])).toBeLessThan(1e-6); // 90° between them
    expect(r).toBeGreaterThanOrEqual(DT.dsR);
  });
  it("the sweep follows the turn: mirrored sides give the other sweep", () => {
    const M: Drawing = { runs: [{ id: "A", a: [0, 0], b: [600, 0], attrs }, { id: "B", a: [600, 0], b: [600, -400], attrs }], downspouts: [] };
    const a = buildScene(L, opts(L)).corners[0]!.arc!;
    const b = buildScene(M, opts(M)).corners[0]!.arc!;
    expect(a.sweep).not.toBe(b.sweep);
  });
  it("a side too short on the screen for the arc: none (the mark would be a blob)", () => {
    const S: Drawing = { runs: [{ id: "A", a: [0, 0], b: [20000, 0], attrs }, { id: "B", a: [20000, 0], b: [20000, 3], attrs: { ...attrs } }], downspouts: [] };
    const sc = buildScene(S, opts(S));
    expect(sc.corners.every((c) => !c.arc || c.arc.r >= DT.dsR)).toBe(true);
  });
});

describe("the ring on a picked gutter's joint (the handle)", () => {
  it("only when one of its two gutters is picked", () => {
    expect(buildScene(L, opts(L, null)).corners[0]!.handle).toBe(false);
    expect(buildScene(L, opts(L, "A")).corners[0]!.handle).toBe(true);
    expect(buildScene(L, opts(L, "B")).corners[0]!.handle).toBe(true);
    expect(buildScene(L, opts(L, "nothing")).corners[0]!.handle).toBe(false);
  });
});
