import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The swipe hint of the first estimates (DS §8.11, spec 39 §7): the first line, once it is wholly on the screen, slides LEFT by
 * 1.4 of a swipe button (part of «Заменить», «Удалить» shows), back, then RIGHT by 0.8 («Скрыть»), back — each move `durSlow`.
 * Only in the first three estimates on the device, and only until the person has swiped a line once; never under «уменьшить
 * движение»; no vibration. The device remembers it (not the estimate, not the company).
 */
/** how far the hint slides left, in swipe buttons: more than one, so the second button is seen to be there */
export const HINT_LEFT = 1.4;
/** how far it slides right: most of the one button there («Скрыть») */
export const HINT_RIGHT = 0.8;
/** the hint plays in this many estimates on a device, then never again */
export const HINT_ESTIMATES = 3;

export const SWIPE_HINT_KEY = "octo.est.swipeHint.v1";

export interface SwipeHintState {
  /** in how many estimates the hint has played */
  shown: number;
  /** the person has swiped a line themselves: they know */
  swiped: boolean;
}
export const NO_HINTS_YET: SwipeHintState = { shown: 0, swiped: false };

export function parseSwipeHint(raw: string | null): SwipeHintState {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<SwipeHintState>) : null;
    if (!v || typeof v !== "object") return NO_HINTS_YET;
    return { shown: Number.isFinite(v.shown) ? Math.max(0, Math.floor(v.shown as number)) : 0, swiped: v.swiped === true };
  } catch {
    return NO_HINTS_YET;
  }
}

/** does the hint play in this estimate */
export const swipeHintDue = (s: SwipeHintState, reduceMotion: boolean): boolean => !reduceMotion && !s.swiped && s.shown < HINT_ESTIMATES;

/** the device's state, read once; `null` until read (nothing plays before the device has answered) */
export function useSwipeHint(): { state: SwipeHintState | null; played: () => void } {
  const [state, setState] = useState<SwipeHintState | null>(null);
  const once = useRef(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(SWIPE_HINT_KEY)
      .then((raw) => live && setState(parseSwipeHint(raw)))
      .catch(() => live && setState(NO_HINTS_YET));
    return () => {
      live = false;
    };
  }, []);
  // played in this estimate: counted once per opening of the editor
  const played = useCallback(() => {
    if (once.current) return;
    once.current = true;
    void bump((s) => ({ ...s, shown: s.shown + 1 }));
  }, []);
  return { state, played };
}

/** the person swiped a line: no more hints on this device */
export const swipedByHand = (): void => void bump((s) => (s.swiped ? s : { ...s, swiped: true }));

async function bump(f: (s: SwipeHintState) => SwipeHintState): Promise<void> {
  try {
    const now = parseSwipeHint(await AsyncStorage.getItem(SWIPE_HINT_KEY));
    const next = f(now);
    if (next !== now) await AsyncStorage.setItem(SWIPE_HINT_KEY, JSON.stringify(next));
  } catch {
    // the hint is a nicety: a device that cannot keep it shows it again
  }
}
