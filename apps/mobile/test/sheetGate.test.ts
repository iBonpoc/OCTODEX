import { beforeEach, describe, expect, it } from "vitest";
import { sheetGate, sheetMayShow } from "../src/ui/sheetGate";

/** #1163, #743: on iOS a sheet opened while another goes out waits; elsewhere nothing waits */
describe("sheets going out and the sheet that comes next", () => {
  beforeEach(() => sheetGate.reset());
  it("the gate counts the sheets that go out and tells the listeners", () => {
    let n = 0;
    const off = sheetGate.subscribe(() => n++);
    sheetGate.enter();
    sheetGate.enter();
    expect(sheetGate.count()).toBe(2);
    sheetGate.leave();
    sheetGate.leave();
    sheetGate.leave(); // never below zero
    expect(sheetGate.count()).toBe(0);
    expect(n).toBe(5);
    off();
    sheetGate.enter();
    expect(n).toBe(5);
  });
  it("chain «A closes, B opens in the same moment»: on iOS B waits for A, and shows when A has left", () => {
    sheetGate.enter(); // A starts to go out
    expect(sheetMayShow({ gate: true, leavingAll: sheetGate.count(), selfLeaving: false })).toBe(false); // B waits
    sheetGate.leave(); // A has left
    expect(sheetMayShow({ gate: true, leavingAll: sheetGate.count(), selfLeaving: false })).toBe(true); // B shows
  });
  it("not on iOS: nothing waits", () => {
    expect(sheetMayShow({ gate: false, leavingAll: 3, selfLeaving: false })).toBe(true);
  });
  it("a sheet that comes back while it is going out is the same sheet: it does not wait for itself", () => {
    expect(sheetMayShow({ gate: true, leavingAll: 1, selfLeaving: true })).toBe(true);
    expect(sheetMayShow({ gate: true, leavingAll: 2, selfLeaving: true })).toBe(false); // another one is going out too
  });
});
