/**
 * #1272 (review of the director): the order of events of the hold that picks something up, as a state machine.
 */
import { describe, expect, it } from "vitest";
import { holdBegin, holdCancel, holdFire, holdIsTap, holdMove, type Hold } from "../src/modules/gutters/canvas/holdLift";

describe("the hold that picks up", () => {
  it("held still on something takeable: `light` at the end of the hold — BEFORE any move", () => {
    const b = holdBegin();
    expect(b).toEqual({ hold: "armed", light: false }); // the touch itself: no tick
    const f = holdFire(b.hold, true);
    expect(f).toEqual({ hold: "lifted", light: true });
  });
  it("the drag after it has no second «взял»", () => {
    const f = holdFire("armed", true);
    expect(holdMove(f.hold, false)).toEqual({ hold: "lifted", light: false });
    expect(holdMove(f.hold, true)).toEqual({ hold: "lifted", light: false }); // even a downspout (it is dragged at once)
  });
  it("moved before the time: ordinary drawing, no `light` (a downspout, dragged at once, has its tick at the first move)", () => {
    expect(holdMove("armed", false)).toEqual({ hold: "idle", light: false });
    expect(holdMove("armed", true)).toEqual({ hold: "idle", light: true });
    // and the timer, if it still runs, finds nothing to do
    expect(holdFire("idle", true)).toEqual({ hold: "idle", light: false });
  });
  it("the time ran out on nothing takeable (a line, the air, a joint of three ends): nothing is lifted, no tick", () => {
    expect(holdFire("armed", false)).toEqual({ hold: "idle", light: false });
  });
  it("let go without a move, or a second finger (the pan is cancelled): the timer is off — a late fire does nothing", () => {
    const c = holdCancel("armed");
    expect(c).toEqual({ hold: "idle", light: false });
    expect(holdFire(c.hold, true).light).toBe(false);
  });
  it("let go without a move after the lift: no `light`, no `medium`; the touch stays lifted until the next one", () => {
    const f = holdFire("armed", true);
    const c = holdCancel(f.hold);
    expect(c).toEqual({ hold: "lifted", light: false });
    expect(holdBegin().hold).toBe("armed"); // the next touch starts again
  });
  it("a touch that picked something up is not a tap (an end cap is not flipped by the release of a hold); any other is", () => {
    expect(holdIsTap("lifted")).toBe(false);
    for (const h of ["idle", "armed"] as Hold[]) expect(holdIsTap(h)).toBe(true);
  });
  it("one tick per touch whatever the order: hold → move → hold again is one", () => {
    let ticks = 0;
    let h: Hold = holdBegin().hold;
    for (const step of [() => holdFire(h, true), () => holdMove(h, true), () => holdFire(h, true), () => holdCancel(h)]) {
      const r = step();
      h = r.hold;
      if (r.light) ticks++;
    }
    expect(ticks).toBe(1);
  });
});
