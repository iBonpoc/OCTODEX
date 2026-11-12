import { useCallback, useRef, useState } from "react";

/** the pure part of `useHeldSheet`: what it holds and how many openings there have been */
export interface HeldState<T> {
  held: T | null;
  /** +1 each time the data comes after nothing: a new opening (the form starts empty, not from the last one) */
  opening: number;
}
export function heldStep<T>(prev: HeldState<T>, value: T | null | undefined, wasEmpty: boolean): HeldState<T> {
  if (value == null) return prev;
  return { held: value, opening: wasEmpty ? prev.opening + 1 : prev.opening };
}

/**
 * A sheet whose owner mounts it by data (`{x ? <XSheet x={x} /> : null}`, `if (!x) return null`) would vanish at once
 * when the data goes: the owner's unmount is a cut, not the way out (DS Б1, #1163). `useHeldSheet(x)` keeps the last
 * non-empty `x` until the sheet has really left: pass `held.value` to the body, `held.visible` to `<Sheet visible>` and
 * `held.onExited` to `<Sheet onExited>`; `held.opening` goes into the body's `key`, so each opening starts a fresh form.
 */
export function useHeldSheet<T>(value: T | null | undefined): { value: T | null; visible: boolean; opening: number; onExited: () => void } {
  const [st, setSt] = useState<HeldState<T>>({ held: value ?? null, opening: 1 });
  const wasEmpty = useRef(value == null); // the last render had no data (or this is the first and it has none)
  const now = useRef<T | null>(value ?? null);
  now.current = value ?? null;
  if (value != null && (value !== st.held || wasEmpty.current)) {
    const next = heldStep(st, value, wasEmpty.current && st.held !== null);
    if (next.held !== st.held || next.opening !== st.opening) setSt(next);
  }
  wasEmpty.current = value == null;
  // the sheet is gone: let go of the data, unless it has come back meanwhile
  const onExited = useCallback(() => {
    if (now.current == null) setSt((p) => ({ ...p, held: null }));
  }, []);
  return { value: value ?? st.held, visible: value != null, opening: st.opening, onExited };
}

/** +1 each time `open` turns on: a key for a sheet that stays mounted, so its form starts fresh without a remount at close */
export function useOpening(open: boolean): number {
  const [n, setN] = useState(open ? 1 : 0);
  const was = useRef(open);
  if (open && !was.current) setN(n + 1);
  was.current = open;
  return n;
}
