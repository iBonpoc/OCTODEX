import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { demoToday } from "@/features/zone";

/* ---------- «the device was wiped»: a generation number (19 §6.12, store debt) ---------- */
let generation = 0;
/** grows on every wipe: async code (a send, a reload) takes it before `await` and drops its result when it changed */
export const deviceGeneration = () => generation;

/** whose account is deleted (when known): the store drops their ops from the shared outbox, review #240 №2 */
export interface ForgetInfo {
  userId?: string | null;
}
type Forget = (isWiped: (key: string) => boolean, info: ForgetInfo) => void;
const listeners = new Set<Forget>();
/** subscribe to the wipe; returns the unsubscribe */
export function onDeviceForgotten(cb: Forget): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
/**
 * Called BEFORE the device keys are removed (account deletion): the generation grows (a pending write, a read or a send
 * that is still running drops its result), every persistent state whose key is wiped goes back to its initial value
 * without writing it, and the store drops what it keeps only in memory.
 */
export function forgetDeviceState(isWiped: (key: string) => boolean, info: ForgetInfo = {}): void {
  generation += 1;
  for (const cb of [...listeners]) cb(isWiped, info);
}

/* ---------- the debounced writer (pure, unit-tested: test/persist.test.ts) ---------- */
export type SetItem = (key: string, raw: string) => Promise<void>;
export interface Writer {
  /** write `raw` to `key` after `ms` (a newer schedule replaces the pending one) */
  schedule: (key: string, raw: string) => void;
  /** the hook's key changed: a pending write of the OLD key is written now (the last change is never lost, e.g. the
   *  memberships went empty without the network and the store fell back to the demo) */
  keyChanged: (key: string) => void;
  /** the device is being wiped: the pending write is dropped */
  forget: () => void;
  /** the app is leaving (background, the tab hidden or closed): the pending write is written now (rule 6) */
  flush: () => void;
}
/**
 * `ms` — how long a change waits for the next one before it is written (one write for a burst of changes). 0 — written
 * at once, in the same turn (the outbox: a change the phone has only there must survive a crash, review #263).
 */
export function createWriter(setItem: SetItem, ms = 250, gen: () => number = deviceGeneration): Writer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { key: string; raw: string; gen: number } | null = null;
  const write = () => {
    const p = pending;
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
    // scheduled before a wipe: the old person's data never lands after it
    if (p && p.gen === gen()) setItem(p.key, p.raw).catch(() => {});
  };
  return {
    schedule: (key, raw) => {
      if (timer) clearTimeout(timer);
      pending = { key, raw, gen: gen() };
      if (ms <= 0) write();
      else timer = setTimeout(write, ms);
    },
    keyChanged: (key) => {
      if (pending && pending.key !== key) write();
    },
    forget: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
    flush: () => {
      if (pending) write();
    },
  };
}

/* ---------- «the app is leaving»: every pending write now (review #263, the lost 250 ms) ---------- */
const live = new Set<Writer>();
/** the writers of the persistent states that are mounted */
export const liveWriters = (): ReadonlySet<Writer> => live;
/** the app goes to the background / the tab is hidden or closed: write what waits (the store calls it, appActive.ts) */
export function flushAllWriters(): void {
  for (const w of [...live]) w.flush();
}

/** the hook's state; `forgotten` — reset by a wipe: not written until the next real change */
export interface Slot<T> {
  key: string;
  value: T;
  loaded: boolean;
  forgotten?: boolean;
}
/** a setter's update, bound to the key it was meant for: an update for another key (a late answer for the company's
 *  cache once the hook holds «octo.db.v5») is dropped (19 §6.12) */
export function applyUpdate<T>(s: Slot<T>, next: T | ((prev: T) => T), forKey?: string): Slot<T> {
  if (forKey !== undefined && s.key !== forKey) return s;
  return { key: s.key, loaded: s.loaded, value: typeof next === "function" ? (next as (p: T) => T)(s.value) : next };
}

/**
 * State that survives an app restart (offline-first: the phone keeps its copy).
 * Writes are debounced; the stored value is read whenever `key` changes (e.g. demo → a company's cache).
 * `ready` is false until the value for the current key is loaded, and nothing is written before that.
 * The setter takes an optional key: the update is applied only while the state still holds that key.
 * Unit-tested with its effects: test/persistHook.test.ts.
 */
export function usePersistentState<T>(key: string, initial: T | (() => T), opts?: { validate?: (v: T) => boolean; immediate?: boolean }) {
  const init = () => (typeof initial === "function" ? (initial as () => T)() : initial);
  const [state, setState] = useState<Slot<T>>(() => ({ key, value: init(), loaded: false }));
  const writer = useRef<Writer | null>(null);
  // `immediate`: written in the same turn — for small state the phone must not lose (the outbox); else after 250 ms
  if (!writer.current) writer.current = createWriter((k, raw) => AsyncStorage.setItem(k, raw), opts?.immediate ? 0 : 250);
  useEffect(() => {
    const w = writer.current!;
    live.add(w);
    return () => {
      // unmounted: what waits is written now (a screen left within 250 ms of a change)
      w.flush();
      live.delete(w);
    };
  }, []);
  const validate = useRef(opts?.validate);
  validate.current = opts?.validate;
  const initRef = useRef(init);
  initRef.current = init;
  const keyRef = useRef(key);
  keyRef.current = key;
  /** grows when this state is wiped: a read still running for it is dropped */
  const wiped = useRef(0);

  useEffect(() => {
    let alive = true;
    const w = wiped.current;
    writer.current!.keyChanged(key);
    setState({ key, value: init(), loaded: false });
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!alive || w !== wiped.current) return;
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
      .catch(() => alive && w === wiped.current && setState((s) => ({ ...s, key, loaded: true })));
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
        wiped.current += 1;
        writer.current!.forget();
        setState({ key: k, value: initRef.current(), loaded: true, forgotten: true });
      }),
    [],
  );

  const ready = state.loaded && state.key === key;
  useEffect(() => {
    if (!ready || state.forgotten) return;
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
