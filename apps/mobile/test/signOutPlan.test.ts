/**
 * #1662 (the director\'s review of #1693): the sign-out window\'s two lines. Each case and both at once; nothing unsent — no window;
 * the exit button erases only when there are drafts to erase.
 */
import { describe, expect, it } from "vitest";
import { signOutPlan } from "../src/features/signOutAsk";

describe("unit:signOutPlan — what the sign-out window says", () => {
  it("nothing unsent: no window", () => {
    expect(signOutPlan(0, 0)).toEqual({ ask: false, queue: 0, drafts: 0, exit: "leave" });
  });
  it("only the queue: its line, no drafts line, a plain «Выйти» (the queue stays on the phone)", () => {
    expect(signOutPlan(3, 0)).toEqual({ ask: true, queue: 3, drafts: 0, exit: "leave" });
  });
  it("only drafts: their line, no queue line, «Выйти и стереть»", () => {
    expect(signOutPlan(0, 2)).toEqual({ ask: true, queue: 0, drafts: 2, exit: "wipe" });
  });
  it("both: two lines, «Выйти и стереть» (about the drafts)", () => {
    expect(signOutPlan(3, 2)).toEqual({ ask: true, queue: 3, drafts: 2, exit: "wipe" });
  });
  it("nonsense numbers never make a window or a negative line", () => {
    expect(signOutPlan(-1, -5).ask).toBe(false);
    expect(signOutPlan(1.9, 0).queue).toBe(1);
  });
});
