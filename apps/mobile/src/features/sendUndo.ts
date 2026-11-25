/**
 * «Отменить» in the send button itself (#2218, rule 5): «Отправить клиенту» is pressed — the send goes into the store's queue AT
 * ONCE (`useStore().queue` / the outbox, rule 6: it waits there `SEND_AFTER_MS` before it leaves, so it survives a closed screen
 * and no network), and the same button counts «Отменить · 5 … 1». A press in those 5 seconds takes it back out of the queue (the
 * store's own undo — nothing has left the phone); after them the send is final and what goes to the client goes (`finish`: the
 * SMS / mail with the link). The screen closed while counting — the send is not lost: it is in the queue, and `flush` finishes it.
 * Pure, with the clock passed in — test/sendUndo.test.ts.
 */
import { motion } from "@octo/design-tokens";

/** the window of «Отменить», the same 5 s as the toast's (rule 5) */
export const UNDO_SEND_MS: number = motion.toastUndoMs;
const SEC = 1000;

export type SendPhase = "idle" | "counting" | "sent" | "cancelled";

/** the whole seconds left to cancel, as the button says them: 5, 4, 3, 2, 1 — then 0 (sent) */
export function secondsLeft(startedAt: number, now: number, ms = UNDO_SEND_MS): number {
  return Math.max(0, Math.ceil((ms - (now - startedAt)) / SEC));
}

export interface UndoSendClock {
  now: () => number;
  setTimeout: (f: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  setInterval: (f: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
}

const realClock: UndoSendClock = {
  now: () => Date.now(),
  setTimeout: (f, ms) => setTimeout(f, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  setInterval: (f, ms) => setInterval(f, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
};

export interface UndoSend {
  readonly phase: SendPhase;
  /** seconds left while counting, else 0 */
  readonly left: number;
  /** «Отправить клиенту»: puts the send in the queue (`start` returns the store's undo) and starts the count; a second press while
   *  counting is the cancel (the same button) */
  press: () => void;
  /** «Отменить · N»: takes the send back out of the queue; false when it is too late (already sent) */
  cancel: () => boolean;
  /** the screen goes away while counting: the send stays (it is in the queue) — finish it now */
  flush: () => void;
}

/**
 * The button's state machine. `start` — the store's send (into the queue), returns its undo; `finish` — what happens once it is
 * final (open the SMS / mail); `onChange` — the button redraws (each second while counting).
 */
export function createUndoSend(p: { start: () => () => unknown; finish?: () => void; onChange?: (s: { phase: SendPhase; left: number }) => void; ms?: number; clock?: UndoSendClock }): UndoSend {
  const ms = p.ms ?? UNDO_SEND_MS;
  const clock = p.clock ?? realClock;
  let phase: SendPhase = "idle";
  let startedAt = 0;
  let undo: (() => unknown) | null = null;
  let timer: unknown = null;
  let tick: unknown = null;
  const left = () => (phase === "counting" ? secondsLeft(startedAt, clock.now(), ms) : 0);
  const emit = () => p.onChange?.({ phase, left: left() });
  const stop = () => {
    if (timer !== null) clock.clearTimeout(timer);
    if (tick !== null) clock.clearInterval(tick);
    timer = tick = null;
  };
  const done = () => {
    if (phase !== "counting") return;
    stop();
    phase = "sent";
    undo = null;
    p.finish?.();
    emit();
  };
  const cancel = () => {
    if (phase !== "counting") return false;
    stop();
    undo?.();
    undo = null;
    phase = "cancelled";
    emit();
    return true;
  };
  return {
    get phase() {
      return phase;
    },
    get left() {
      return left();
    },
    press: () => {
      if (phase === "counting") return void cancel();
      undo = p.start();
      startedAt = clock.now();
      phase = "counting";
      timer = clock.setTimeout(done, ms);
      tick = clock.setInterval(emit, SEC);
      emit();
    },
    cancel,
    flush: done,
  };
}
