/** Rule 5 + docs/specs/03 §4.1: «Отменить» in a toast never returns something the server already has. */
import { describe, expect, it } from "vitest";
import { motion } from "@octo/design-tokens";
import { readyToSend, SEND_AFTER_MS } from "../src/cloud/outboxTiming";

describe("outbox: an op waits while its toast offers «Отменить»", () => {
  it("is not sent before the toast has closed, with a margin", () => {
    expect(SEND_AFTER_MS).toBeGreaterThan(motion.toastUndoMs);
    const at = "2026-11-05T18:00:00.000Z";
    const t0 = new Date(at).getTime();
    expect(readyToSend({ at }, t0)).toBe(false);
    expect(readyToSend({ at }, t0 + motion.toastUndoMs)).toBe(false); // the toast is just closing
    expect(readyToSend({ at }, t0 + SEND_AFTER_MS)).toBe(true);
  });
});
