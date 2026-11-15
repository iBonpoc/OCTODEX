/**
 * #1272 (founder 12.11: «не чувствую момента, когда можно тянуть»): a finger held still for the long-press time picks up what it is on
 * AT ONCE (light + the picked ring), before any move. `liftTarget` decides what it is on: a free end, a corner that can be moved, a
 * downspout; a joint of three ends, a line, the air — nothing.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { liftTarget } from "../src/modules/gutters/canvas/edit";
import { DEFAULT_DS_ATTRS } from "../src/modules/gutters/canvas/model";
import type { Drawing, DrawnDownspout, DrawnRun, P } from "../src/modules/gutters/geometry";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const run = (id: string, a: P, b: P): DrawnRun => ({ id, a, b, attrs });
const TOL = 20;

describe("liftTarget", () => {
  const one: Drawing = { runs: [run("a", [0, 0], [300, 0])], downspouts: [] };
  it("a free end → picked up (the ring is its gutter's); the middle of a line, the air → nothing", () => {
    expect(liftTarget(one, [300, 0], TOL)).toEqual({ kind: "end", id: "a", end: 1 });
    expect(liftTarget(one, [3, 4], TOL)).toEqual({ kind: "end", id: "a", end: 0 });
    expect(liftTarget(one, [150, 0], TOL)).toBeNull(); // a line
    expect(liftTarget(one, [150, 200], TOL)).toBeNull(); // the air
  });
  it("a corner that can be moved → picked up", () => {
    const L: Drawing = { runs: [run("a", [0, 0], [300, 0]), run("b", [300, 0], [300, 300])], downspouts: [] };
    expect(liftTarget(L, [300, 0], TOL)).toMatchObject({ kind: "corner", cornerId: "c:a:b" });
  });
  it("a joint of three ends is not picked up (nothing to move: the long press with a move says why)", () => {
    const T: Drawing = { runs: [run("a", [0, 0], [300, 300]), run("b", [300, 300], [600, 0]), run("c", [300, 300], [300, 700])], downspouts: [] };
    expect(liftTarget(T, [300, 300], TOL)).toBeNull();
  });
  it("a downspout → picked up", () => {
    const ds = { ...DEFAULT_DS_ATTRS, id: "d", runId: "a", atIn: 120 } as DrawnDownspout;
    expect(liftTarget({ ...one, downspouts: [ds] }, [120, 0], TOL)).toEqual({ kind: "ds", id: "d" });
  });
});

import { drawing as DT } from "@octo/design-tokens";
import { buildScene, fitView } from "../src/modules/gutters/canvas/scene";

describe("the lifted look (scene): the point itself is bigger, the free ends it can stick to are marked", () => {
  const two: Drawing = { runs: [run("a", [0, 0], [300, 0]), run("b", [500, 100], [800, 100])], downspouts: [] };
  const vp = { w: 390, h: 600 };
  const opts = (lift: Parameters<typeof buildScene>[1]["lift"]) => ({ view: fitView(two.runs.flatMap((r) => [r.a, r.b]), vp, 40), viewport: vp, fontSize: 14, padX: 4, gap: 4, dsPad: 7, dsText: (n: number) => `D${n}`, storyText: (n: number) => `эт ${n}`, lift });
  it("an end held: its cap is `lifted`; the free ends of OTHER gutters are targets, its own gutter's other end is not", () => {
    const sc = buildScene(two, opts({ kind: "end", id: "a", end: 1 }));
    const by = (id: string) => sc.caps.find((c) => c.id === id)!;
    expect(by("cap:a:1").lifted).toBe(true);
    expect(by("cap:a:0").lifted).toBeUndefined();
    expect(by("cap:a:0").target).toBeUndefined();
    expect(by("cap:b:0").target).toBe(true);
    expect(by("cap:b:1").target).toBe(true);
  });
  it("nothing held: no cap is lifted or a target; the lift size is a token", () => {
    expect(buildScene(two, opts(null)).caps.every((c) => !c.lifted && !c.target)).toBe(true);
    expect(DT.liftScale).toBeGreaterThan(1);
  });
  it("a downspout held: it is lifted; no end is marked as a target (it only slides along its gutter)", () => {
    const d: Drawing = { ...two, downspouts: [{ ...DEFAULT_DS_ATTRS, id: "d", runId: "a", atIn: 120 } as DrawnDownspout] };
    const sc = buildScene(d, opts({ kind: "ds", id: "d" }));
    expect(sc.ds[0]!.lifted).toBe(true);
    expect(sc.caps.every((c) => !c.target)).toBe(true);
  });
  it("a corner held: it is lifted; the free ends of the other gutters are targets", () => {
    const L: Drawing = { runs: [run("a", [0, 0], [300, 0]), run("b", [300, 0], [300, 300]), run("c", [500, 500], [800, 500])], downspouts: [] };
    const sc = buildScene(L, { ...opts({ kind: "corner", id: "a", cornerId: "c:a:b" }), view: fitView(L.runs.flatMap((r) => [r.a, r.b]), vp, 40) });
    expect(sc.corners[0]!.lifted).toBe(true);
    expect(sc.caps.filter((c) => c.target).map((c) => c.runId)).toContain("c");
  });
});
