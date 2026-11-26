/**
 * #2853: a «back» that is not the header's (the iOS swipe, the Android system «Назад», the browser's back) does not drop the
 * unsaved edits of an editor — src/ui/templates/leaveGuard.ts, used by EditorScreen.
 */
import { describe, expect, it } from "vitest";
import { guardOn, leaveNow, stepLeaves } from "../src/ui/templates/leaveGuard";

describe("leaveGuard — the editor's removal is held only over unsaved edits (#2853)", () => {
  it("held: edits on the screen in front", () => {
    expect(guardOn(true, true, false)).toBe(true);
  });
  it("not held: no edits — the swipe and the back go at once", () => {
    expect(guardOn(false, true, false)).toBe(false);
  });
  it("not held: the form lies under another card (the tab bar asks for it), or it is the showcase frame", () => {
    expect(guardOn(true, false, false)).toBe(false);
    expect(guardOn(true, true, true)).toBe(false);
  });
});

describe("stepLeaves — a ready save leaves the screen past the guard", () => {
  it("ready: no reason, not off", () => {
    expect(stepLeaves({})).toBe(true);
    expect(stepLeaves({ disabled: false, reason: undefined })).toBe(true);
  });
  it("held back: a reason is said or the step is off — the tap only shows what is missing, the guard stays", () => {
    expect(stepLeaves({ reason: "Enter the phone" })).toBe(false);
    expect(stepLeaves({ disabled: true })).toBe(false);
  });
});

describe("leaveNow — «Выйти» in the question", () => {
  it("a held back (a swipe, the system back) goes on as asked; the screen's own back is not called a second time", () => {
    const calls: string[] = [];
    leaveNow(() => calls.push("repeat"), () => calls.push("lift"), () => calls.push("back"));
    expect(calls).toEqual(["repeat"]);
  });
  it("the header's «×»: the guard is lifted first, then the screen goes back (else its own back would be held again)", () => {
    const calls: string[] = [];
    leaveNow(null, () => calls.push("lift"), () => calls.push("back"));
    expect(calls).toEqual(["lift", "back"]);
  });
});
