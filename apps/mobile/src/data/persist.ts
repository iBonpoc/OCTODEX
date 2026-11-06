import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { demoToday } from "@/features/zone";

/* ---------- the debounced writer (pure, unit-tested: test/persist.test.ts) ---------- */
export type SetItem = (key: string, raw: string) => Promise<void>;
export interface Writer {
  /** write `raw` to `key` after `ms` (a newer schedule replaces the pending one) */
  schedule: (key: string, raw: string) => void;
  /** the hook's key changed: a pending write of another key is dropped. A write of the old key after the switch
   *  would land after a wipe (sign-out, account deletion) and bring the old company's cache back (store debt, 19 §6.12) */
  keyChanged: (key: string) => void;
  /** the device was wiped: drop the pending write and the next one (the reset to the initial value is not stored) */
  forget: () => void;
}
export function createWriter(setItem: SetItem, ms = 250): Writer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingKey: string | null = null;
  let skipNext = false;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingKey = null;
  };
  return {
    schedule: (key, raw) => {
      cancel();
      if (skipNext) {
        skipNext = false;
        return;
      }
      pendingKey = key;
      timer = setTimeout(() => {
        timer = null;
        pendingKey = null;
        setItem(key, raw).catch(() => {});
      }, ms);
    },
    keyChanged: (key) => {
      if (pendingKey !== null && pendingKey !== key) cancel();
    },
    forget: () => {
      cancel();
      skipNext = true;
    },
  };
}

/** a setter's update, bound to the key it was meant for: a late answer (refresh after `await`) for the company's
 *  cache is dropped once the hook already holds another key (sign-out → «octo.db.v5»), store debt, 19 §6.12 */
export function applyUpdate<T>(s: { key: string; value: T; loaded: boolean }, next: T | ((prev: T) => T), forKey?: string) {
  if (forKey !== undefined && s.key !== forKey) return s;
  return { ...s, value: typeof next === "function" ? (next as (p: T) => T)(s.value) : next };
}

/* ---------- «the device was wiped»: everything held in memory is forgotten too (19 §6.12) ---------- */
type Forget = (isWiped: (key: string) => boolean) => void;
const listeners = new Set<Forget>();
/** subscribe to the wipe; returns the unsubscribe */
export function onDeviceForgotten(cb: Forget): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
/** after the device keys were removed (account deletion): every persistent state whose key was wiped goes back to its
 *  initial value without writing it, and the store drops what it keeps only in memory */
export function forgetDeviceState(isWiped: (key: string) => boolean): void {
  for (const cb of [...listeners]) cb(isWiped);
}

/**
 * State that survives an app restart (offline-first: the phone keeps its copy).
 * Writes are debounced; the stored value is read whenever `key` changes (e.g. demo → a company's cache).
 * `ready` is false until the value for the current key is loaded, and nothing is written before that.
 * The setter takes an optional key: the update is applied only while the state still holds that key.
 */
export function usePersistentState<T>(key: string, initial: T | (() => T), opts?: { validate?: (v: T) => boolean }) {
  const init = () => (typeof initial === "function" ? (initial as () => T)() : initial);
  const [state, setState] = useState<{ key: string; value: T; loaded: boolean }>(() => ({ key, value: init(), loaded: false }));
  const writer = useRef<Writer | null>(null);
  if (!writer.current) writer.current = createWriter((k, raw) => AsyncStorage.setItem(k, raw));
  const validate = useRef(opts?.validate);
  validate.current = opts?.validate;
  const initRef = useRef(init);
  initRef.current = init;
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    let alive = true;
    writer.current!.keyChanged(key);
    setState({ key, value: init(), loaded: false });
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!alive) return;
        let value = init();
        if (raw != null) {
          try {
            const parsed = JSON.parse(raw) as T;
            if (!validate.current || validate.current(parsed)) value = parsed;
          } catch {
            /* corrupted cache: start fresh */
          }
        }
        setState({ key, value, loaded: true });
      })
      .catch(() => alive && setState((s) => ({ ...s, key, loaded: true })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(
    () =>
      onDeviceForgotten((isWiped) => {
        const k = keyRef.current;
        if (!isWiped(k)) return;
        writer.current!.forget();
        setState({ key: k, value: initRef.current(), loaded: true });
      }),
    [],
  );

  const ready = state.loaded && state.key === key;
  useEffect(() => {
    if (!ready) return;
    writer.current!.schedule(state.key, JSON.stringify(state.value));
  }, [state, ready]);

  const setValue = useCallback(
    (next: T | ((prev: T) => T), forKey?: string) => setState((s) => applyUpdate(s, next, forKey)),
    [],
  );
  return [state.value, setValue, ready] as const;
}

/** the day the demo was seeded: the demo company's calendar day (its «today» is built from its midnight, seed.ts —
 *  docs/specs/03 П4b), so the demo is reseeded at midnight in Los Angeles, not at the phone's */
export const todayKey = demoToday;
