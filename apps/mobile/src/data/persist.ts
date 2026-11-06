import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * State that survives an app restart (offline-first: the phone keeps its copy).
 * Writes are debounced; the stored value is read whenever `key` changes (e.g. demo → a company's cache).
 * `ready` is false until the value for the current key is loaded, and nothing is written before that.
 */
export function usePersistentState<T>(key: string, initial: T | (() => T), opts?: { validate?: (v: T) => boolean }) {
  const init = () => (typeof initial === "function" ? (initial as () => T)() : initial);
  const [state, setState] = useState<{ key: string; value: T; loaded: boolean }>(() => ({ key, value: init(), loaded: false }));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const validate = useRef(opts?.validate);
  validate.current = opts?.validate;

  useEffect(() => {
    let alive = true;
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

  const ready = state.loaded && state.key === key;
  useEffect(() => {
    if (!ready) return;
    if (timer.current) clearTimeout(timer.current);
    const { key: k, value } = state;
    timer.current = setTimeout(() => {
      AsyncStorage.setItem(k, JSON.stringify(value)).catch(() => {});
    }, 250);
  }, [state, ready]);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) =>
      setState((s) => ({ ...s, value: typeof next === "function" ? (next as (p: T) => T)(s.value) : next })),
    [],
  );
  return [state.value, setValue, ready] as const;
}

/** the day the demo was seeded (the phone's: the demo builds «today» from the phone's midnight; both move to the
 *  company's midnight together in П4b-3 — docs/specs/03) */
export const todayKey = () => new Date().toDateString();
