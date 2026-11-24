/**
 * #2218 — «Отменить · 5» in the send button (rule 5): the send is in the queue at once, a press in 5 s takes it back, after 5 s it
 * is final (the SMS / mail opens); a closed screen does not lose it (flush). The 5 s window is shorter than the outbox's wait
 * (SEND_AFTER_MS), so a cancel never takes back something the server already has.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUndoSend, secondsLeft, UNDO_SEND_MS } from "../src/features/sendUndo";
import { SEND_AFTER_MS } from "../src/cloud/outboxTiming";

describe("secondsLeft", () => {
  it("counts 5, 4, 3, 2, 1, then 0", () => {
    expect(secondsLeft(0, 0, 5000)).toBe(5);
    expect(secondsLeft(0, 1, 5000)).toBe(5);
    expect(secondsLeft(0, 1000, 5000)).toBe(4);
    expect(secondsLeft(0, 4001, 5000)).toBe(1);
    expect(secondsLeft(0, 5000, 5000)).toBe(0);
    expect(secondsLeft(0, 9000, 5000)).toBe(0);
  });
  it("the window is the toast's 5 s and ends before the outbox sends", () => {
    expect(UNDO_SEND_MS).toBe(5000);
    expect(UNDO_SEND_MS).toBeLessThan(SEND_AFTER_MS);
  });
});

describe("createUndoSend", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const make = () => {
    const queue: string[] = [];
    const finished: string[] = [];
    const seen: { phase: string; left: number }[] = [];
    const ctl = createUndoSend({
      start: () => {
        queue.push("estimate.send");
        return () => queue.pop();
      },
      finish: () => finished.push("sms"),
      onChange: (s) => seen.push(s),
    });
    return { ctl, queue, finished, seen };
  };

  it("press: in the queue at once, counting from 5", () => {
    const { ctl, queue, finished } = make();
    ctl.press();
    expect(queue).toEqual(["estimate.send"]);
    expect(ctl.phase).toBe("counting");
    expect(ctl.left).toBe(5);
    expect(finished).toEqual([]);
  });

  it("the button redraws each second: 5 → 1", () => {
    const { ctl, seen } = make();
    ctl.press();
    vi.advanceTimersByTime(4000);
    expect(seen.map((s) => s.left)).toEqual([5, 4, 3, 2, 1]);
  });

  it("cancel inside the window takes it out of the queue; nothing goes to the client", () => {
    const { ctl, queue, finished } = make();
    ctl.press();
    vi.advanceTimersByTime(4900);
    expect(ctl.cancel()).toBe(true);
    expect(queue).toEqual([]);
    expect(ctl.phase).toBe("cancelled");
    vi.advanceTimersByTime(10_000);
    expect(finished).toEqual([]);
  });

  it("a second press of the same button is the cancel", () => {
    const { ctl, queue } = make();
    ctl.press();
    ctl.press();
    expect(queue).toEqual([]);
    expect(ctl.phase).toBe("cancelled");
  });

  it("after 5 s it is final: finish once, cancel too late, the queue keeps it", () => {
    const { ctl, queue, finished } = make();
    ctl.press();
    vi.advanceTimersByTime(5000);
    expect(ctl.phase).toBe("sent");
    expect(finished).toEqual(["sms"]);
    expect(ctl.cancel()).toBe(false);
    expect(queue).toEqual(["estimate.send"]);
    vi.advanceTimersByTime(10_000);
    expect(finished).toEqual(["sms"]);
  });

  it("the screen closes while counting: flush finishes it, the send stays in the queue", () => {
    const { ctl, queue, finished } = make();
    ctl.press();
    vi.advanceTimersByTime(2000);
    ctl.flush();
    expect(ctl.phase).toBe("sent");
    expect(queue).toEqual(["estimate.send"]);
    expect(finished).toEqual(["sms"]);
    vi.advanceTimersByTime(10_000);
    expect(finished).toEqual(["sms"]);
  });

  it("flush with nothing counting does nothing", () => {
    const { ctl, finished } = make();
    ctl.flush();
    expect(ctl.phase).toBe("idle");
    expect(finished).toEqual([]);
  });

  it("after a cancel it can be sent again", () => {
    const { ctl, queue } = make();
    ctl.press();
    ctl.cancel();
    ctl.press();
    expect(queue).toEqual(["estimate.send"]);
    expect(ctl.left).toBe(5);
  });
});
