import { motion } from "@octo/design-tokens";

/**
 * The toast stack (DS Б8, §15.2; #2211, #2214, closes #2213 — moved from the «Графит» pilot): up to `motion.toastStack`
 * toasts, the newest first (on top); a fourth pushes the oldest out. Each toast has its own «Вернуть» and its own clock, so a
 * second action no longer takes away the «Вернуть» of the first. Pure: test/toastStack.test.ts.
 */
export interface StackItem {
  id: number;
  at: number;
}

/** the newest toast — the one a `grow` and `showing` speak of */
export const stackTop = <T extends StackItem>(stack: readonly T[]): T | undefined => stack[0];

/**
 * A `show`: `grow` names the toast on top — while it is still the top one it takes the new text in place (a series of deletions is
 * one toast «Удалено позиций: N»); otherwise the new toast goes on top and the stack keeps at most `max`.
 */
export function stackShow<T extends StackItem>(stack: readonly T[], next: T, grow?: number, max: number = motion.toastStack): T[] {
  const top = stackTop(stack);
  if (grow !== undefined && top?.id === grow) return [{ ...next, id: grow }, ...stack.slice(1)];
  return [next, ...stack.filter((x) => x.id !== next.id)].slice(0, Math.max(1, max));
}

/** a toast changes in place (its «Вернуть» came too late — the same toast says so), the others stay where they are */
export const stackReplace = <T extends StackItem>(stack: readonly T[], id: number, next: T): T[] => stack.map((x) => (x.id === id ? { ...next, id } : x));

/** a toast leaves (its clock ran out, it was acted on); a timer of an older show of a grown toast does not take it (`at` differs) */
export const stackDrop = <T extends StackItem>(stack: readonly T[], id: number, at?: number): T[] =>
  stack.filter((x) => !(x.id === id && (at === undefined || x.at === at)));

/**
 * How long a toast stays (each ≥ 5 s, with an action or without, v2 §2.8). With VoiceOver / TalkBack on a toast with «Вернуть» has
 * no clock (null): it is read out and stays until acted on or pushed out; a plain one stays the longer screen-reader time.
 */
export const stackLife = (hasAction: boolean, reader: boolean): number | null => (reader ? (hasAction ? null : motion.toastUndoA11yMs) : motion.toastUndoMs);
