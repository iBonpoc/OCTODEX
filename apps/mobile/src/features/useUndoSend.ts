import { useEffect, useRef, useState } from "react";
import { createUndoSend, type SendPhase, type UndoSend } from "@/features/sendUndo";

/**
 * The send button with «Отменить · 5» (#2218) for a screen: `start` puts the send into the store's queue and returns its undo,
 * `finish` runs once the 5 s are over. Leaving the screen while counting finishes the send (it is already in the queue).
 * The latest `start` / `finish` are used (the screen's data may change while counting).
 */
export function useUndoSend(start: () => () => unknown, finish?: () => void): { phase: SendPhase; left: number; press: () => void; cancel: () => boolean } {
  const fns = useRef({ start, finish });
  fns.current = { start, finish };
  const [s, setS] = useState<{ phase: SendPhase; left: number }>({ phase: "idle", left: 0 });
  const ctl = useRef<UndoSend | null>(null);
  if (!ctl.current) ctl.current = createUndoSend({ start: () => fns.current.start(), finish: () => fns.current.finish?.(), onChange: setS });
  useEffect(() => () => ctl.current?.flush(), []);
  return { ...s, press: () => ctl.current!.press(), cancel: () => ctl.current!.cancel() };
}
