import { useCallback, useRef, useState } from "react";

/**
 * A sheet whose owner mounts it by data (`{x ? <XSheet x={x} /> : null}`, `if (!x) return null`) would vanish at once
 * when the data goes: the owner's unmount is a cut, not the way out (DS Б1, #1163). `useHeldSheet(x)` keeps the last
 * non-empty `x` until the sheet has really left: pass `held.value` to the body, `held.visible` to `<Sheet visible>`
 * and `held.onExited` to `<Sheet onExited>`.
 */
export function useHeldSheet<T>(value: T | null | undefined): { value: T | null; visible: boolean; onExited: () => void } {
  const [held, setHeld] = useState<T | null>(value ?? null);
  const now = useRef<T | null>(value ?? null);
  now.current = value ?? null;
  if (value != null && value !== held) setHeld(value);
  // the sheet is gone: let go of the data, unless it has come back meanwhile
  const onExited = useCallback(() => {
    if (now.current == null) setHeld(null);
  }, []);
  return { value: value ?? held, visible: value != null, onExited };
}
