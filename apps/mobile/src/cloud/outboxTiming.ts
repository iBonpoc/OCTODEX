/**
 * An op waits on the phone while its toast still offers «Отменить» (rule 5), plus a margin: the toast closes after
 * `toastUndoMs`, the op leaves only after that, so «Отменить» never returns something the server already has
 * (e.g. a cancelled visit, docs/specs/03 §4.1). Undo inside the window simply drops the op from the outbox.
 * Pure — test/outbox.test.ts.
 */
import { motion } from "@octo/design-tokens";

export const SEND_AFTER_MS = motion.toastUndoMs + 1000;
export const readyToSend = (item: { at: string }, now: number) => now - new Date(item.at).getTime() >= SEND_AFTER_MS;
