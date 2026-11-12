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
    expect(liftTarget(one, [300, 0], TOL)).toEqual({ kind: "end", id: "a" });
    expect(liftTarget(one, [3, 4], TOL)).toEqual({ kind: "end", id: "a" });
    expect(liftTarget(one, [150, 0], TOL)).toBeNull(); // a line
    expect(liftTarget(one, [150, 200], TOL)).toBeNull(); // the air
  });
  it("a corner that can be moved → picked up", () => {
    const L: Drawing = { runs: [run("a", [0, 0], [300, 0]), run("b", [300, 0], [300, 300])], downspouts: [] };
    expect(liftTarget(L, [300, 0], TOL)).toMatchObject({ kind: "corner" });
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
