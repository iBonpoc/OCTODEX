/** «Графит» (пилот #2254): the toast stack's arithmetic, apart from the view so it is unit-tested */
import { graphite } from "@octo/design-tokens";

/** a new toast on top; never more than 3 — the oldest goes */
export function toastPush<T>(stack: T[], t: T): T[] {
  return [t, ...stack].slice(0, graphite.motion.toastStack);
}
