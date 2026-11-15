/**
 * A gesture config made ONCE for a gesture whose callbacks run on the JS thread (`runOnJS: true`) (#1403). RNGH 3 keys its handler on
 * the config object (useClonedAndRemappedConfig → useGesture's effect): a new object on every render sends the config to the native
 * handler and registers the gesture again — on every render of the drawing screen, in the middle of a pinch too («пальцы отлипают»).
 * Here the object stays the same until `deps` change; its callbacks call the ones of the latest render through a ref, so they never see
 * stale state. Only for `runOnJS` gestures: a worklet callback cannot read a ref of the JS thread.
 */
import { useMemo, useRef } from "react";

export function useJsGestureConfig<T extends { runOnJS?: unknown }>(config: T, deps: readonly unknown[]): T {
  if (config.runOnJS !== true) throw new Error("useJsGestureConfig: only for runOnJS gestures");
  const latest = useRef(config);
  latest.current = config;
  return useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      out[key] = typeof value === "function" ? (...args: unknown[]) => (latest.current as unknown as Record<string, (...a: unknown[]) => unknown>)[key]!(...args) : value;
    }
    return out as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
