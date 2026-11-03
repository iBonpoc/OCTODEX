import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * State that survives an app restart (offline-first: the phone is the source until sync in wave 5).
 * Writes are debounced; reads happen once on mount. `ready` is false until the stored value is loaded.
 */
export function usePersistentState<T>(key: string, initial: T | (() => T), opts?: { validate?: (v: T) => boolean }) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!alive || raw == null) return;
        const parsed = JSON.parse(raw) as T;
        if (!opts?.validate || opts.validate(parsed)) setValue(parsed);
      })
      .catch(() => {})
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
    }, 250);
  }, [key, value, ready]);
  return [value, setValue, ready] as const;
}

export const todayKey = () => new Date().toDateString();
