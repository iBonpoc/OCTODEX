import { useCallback, useState } from "react";

/** the pure part of `useHeldSheet`: what it has seen, what it holds, how many openings there have been */
export interface HeldState<T> {
  /** the owner's value at the last render (null: none) */
  seen: T | null;
  /** the last value that was not empty — shown while the sheet goes out */
  held: T | null;
  /** +1 each time the data comes back while the sheet was still held (a new opening: the form starts fresh) */
  opening: number;
}
export function heldStep<T>(prev: HeldState<T>, value: T | null | undefined): HeldState<T> {
  const v = value ?? null;
  if (v === prev.seen) return prev;
  const cameBack = v !== null && prev.seen === null && prev.held !== null;
  return { seen: v, held: v ?? prev.held, opening: cameBack ? prev.opening + 1 : prev.opening };
}

/**
 * A sheet whose owner mounts it by data (`{x ? <XSheet x={x} /> : null}`, `if (!x) return null`) would vanish at once
 * when the data goes: the owner's unmount is a cut, not the way out (DS Б1, #1163). `useHeldSheet(x)` keeps the last
 * non-empty `x` until the sheet has really left: pass `held.value` to the body, `held.visible` to `<Sheet visible>` and
 * `held.onExited` to `<Sheet onExited>`; `held.opening` goes into the body's `key`, so each opening starts a fresh form.
 * What it remembers is state, updated while rendering from what it saw last (React's «derived state» — no ref is written).
 */
export function useHeldSheet<T>(value: T | null | undefined): { value: T | null; visible: boolean; opening: number; onExited: () => void } {
  const [st, setSt] = useState<HeldState<T>>({ seen: value ?? null, held: value ?? null, opening: 1 });
  const cur = heldStep(st, value);
  if (cur !== st) setSt(cur);
  // the sheet is gone: let go of the data, unless it has come back meanwhile
  const onExited = useCallback(() => setSt((p) => (p.seen === null && p.held !== null ? { ...p, held: null } : p)), []);
  return { value: value ?? cur.held, visible: value != null, opening: cur.opening, onExited };
}

/** +1 each time `open` turns on: a key for a sheet that stays mounted, so its form starts fresh without a remount at close */
export function useOpening(open: boolean): number {
  const [st, setSt] = useState({ seen: open, n: open ? 1 : 0 });
  let cur = st;
  if (open !== st.seen) {
    cur = { seen: open, n: open ? st.n + 1 : st.n };
    setSt(cur);
  }
  return cur.n;
}
