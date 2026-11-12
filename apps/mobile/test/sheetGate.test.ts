import { beforeEach, describe, expect, it } from "vitest";
import { sheetGate, sheetMayShow } from "../src/ui/sheetGate";
import { heldStep } from "../src/ui/heldSheet";

/** a sheet's view of the gate, as Sheet reads it: asked at the beat, armed one tick later */
function sheet() {
  let ticket = 0;
  return {
    /** the arming tick: the earlier effects of the beat have run */
    arm() {
      if (!ticket) ticket = sheetGate.queue();
    },
    mayShow(selfLeaving = false) {
      return sheetMayShow({ gate: true, leavingAll: sheetGate.count(), selfLeaving, first: ticket === sheetGate.first() });
    },
    opened() {
      sheetGate.unqueue(ticket);
      ticket = 0;
    },
  };
}

/** #1163, #743: on iOS a sheet opened while another goes out waits; elsewhere nothing waits */
describe("sheets going out and the sheet that comes next", () => {
  beforeEach(() => sheetGate.reset());
  it("the gate counts the sheets that go out and tells the listeners", () => {
    let n = 0;
    const off = sheetGate.subscribe(() => n++);
    sheetGate.enter();
    sheetGate.leave();
    sheetGate.leave(); // never below zero
    expect(sheetGate.count()).toBe(0);
    expect(n).toBe(3);
    off();
    sheetGate.enter();
    expect(n).toBe(3);
  });
  it("chain «A closes, B opens in the same beat»: B asked first, then A registers — B still waits (the order of reading)", () => {
    const b = sheet();
    // the beat: B is rendered visible (asked) — A has not registered that it leaves yet (its effect comes after the commit)
    sheetGate.enter(); // …A's effect of the same beat
    b.arm(); // B arms one tick later and now sees A
    expect(b.mayShow()).toBe(false);
    sheetGate.leave(); // A's Modal is dismissed
    expect(b.mayShow()).toBe(true);
  });
  it("a sheet mounted already open while another goes out waits too", () => {
    sheetGate.enter();
    const b = sheet();
    b.arm(); // mounted visible: armed at once, not shown at once
    expect(b.mayShow()).toBe(false);
  });
  it("without the gate nothing waits", () => {
    expect(sheetMayShow({ gate: false, leavingAll: 3, selfLeaving: false, first: false })).toBe(true);
  });
  it("a sheet that comes back while it is going out does not wait for itself, but for the others", () => {
    sheetGate.enter();
    const a = sheet();
    a.arm();
    expect(a.mayShow(true)).toBe(true);
    sheetGate.enter(); // another one is going out too
    expect(a.mayShow(true)).toBe(false);
  });
  it("several wait: one opens at a time, in the order asked", () => {
    sheetGate.enter();
    const b = sheet();
    const c = sheet();
    b.arm();
    c.arm();
    sheetGate.leave();
    expect(b.mayShow()).toBe(true);
    expect(c.mayShow()).toBe(false);
    b.opened();
    expect(c.mayShow()).toBe(true);
  });
});

/** the data of a sheet that is led out by its owner (#1163) */
describe("useHeldSheet: what it holds", () => {
  it("keeps the last data while the owner has none, and counts a new opening only after emptiness", () => {
    let st = { held: null as string | null, opening: 1 };
    st = heldStep(st, "a", false);
    expect(st).toEqual({ held: "a", opening: 1 });
    st = heldStep(st, null, false); // the owner emptied it: the sheet goes out with "a"
    expect(st.held).toBe("a");
    st = heldStep(st, "a", true); // it came back after emptiness: a new opening — the form starts fresh
    expect(st).toEqual({ held: "a", opening: 2 });
    st = heldStep(st, "b", false); // another value in a row: the same opening
    expect(st).toEqual({ held: "b", opening: 2 });
  });
});

/** how Sheet reads the gate (the order is what the chain depends on) — a change that shows at once is red */
describe("Sheet reads the gate in the right order", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src", "ui", "overlays.tsx"), "utf8") as string;
  it("a sheet is armed one tick after it is asked, not at its first render (a sheet mounted already open is gated too)", () => {
    expect(src).toMatch(/const \[armed, setArmed\] = useState\(false\)/);
    expect(src).toMatch(/setTimeout\(\(\) => \{\s*if \(!ticket\.current\) ticket\.current = sheetGate\.queue\(\);\s*setArmed\(true\);\s*\}, 0\)/);
    expect(src).toMatch(/\(armed && sheetMayShow\(/);
  });
  it("the gate opens at the Modal's onDismiss, with a timer as the net — not in the same beat the sheet is taken off", () => {
    expect(src).toMatch(/onDismiss=\{uncount\}/);
    expect(src).toMatch(/if \(counted\.current\) setTimeout\(uncount, motion\.durSlow \+ motion\.durFast\)/);
  });
  it("a sheet asked and closed before it showed lets the owner's data go", () => {
    expect(src).toMatch(/if \(waited && !presentNow\.current\) live\.current\.onExited/);
  });
});
