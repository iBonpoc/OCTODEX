import { describe, expect, it } from "vitest";
import { measureAfterKeyboard, type KeyboardLike } from "../src/modules/gutters/draw/afterKeyboard";

/** #923: the unit menu is placed after the keyboard is down, not at the tap (the sheet drops with the keyboard). */
const rig = (visible: boolean) => {
  const log: string[] = [];
  let hidden: (() => void) | null = null;
  let timer: (() => void) | null = null;
  const kb: KeyboardLike = { isVisible: () => visible, dismiss: () => log.push("dismiss"), onHidden: (fn) => { hidden = fn; return () => { hidden = null; }; } };
  const later = (fn: () => void) => { timer = fn; return () => { timer = null; }; };
  return { log, kb, later, hide: () => hidden?.(), fire: () => timer?.() };
};
describe("measureAfterKeyboard", () => {
  it("keyboard down: measured at once, nothing dismissed", () => {
    const r = rig(false);
    measureAfterKeyboard(r.kb, () => r.log.push("measure"), r.later);
    expect(r.log).toEqual(["measure"]);
  });
  it("keyboard up: dismissed first, measured only when it is hidden — once", () => {
    const r = rig(true);
    measureAfterKeyboard(r.kb, () => r.log.push("measure"), r.later);
    expect(r.log).toEqual(["dismiss"]);
    r.hide();
    r.hide();
    r.fire();
    expect(r.log).toEqual(["dismiss", "measure"]);
  });
  it("the hidden news lost: measured after the wait, once", () => {
    const r = rig(true);
    measureAfterKeyboard(r.kb, () => r.log.push("measure"), r.later);
    r.fire();
    r.hide();
    expect(r.log).toEqual(["dismiss", "measure"]);
  });
});
