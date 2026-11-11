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
export function createWriter(
  setItem: SetItem,
  ms = 250,
  gen: () => number = deviceGeneration,
  /** each write's outcome (A-02): false — the device refused it (full storage), true — it landed */
  onResult?: (ok: boolean) => void,
): Writer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { key: string; raw: string; gen: number } | null = null;
  const write = () => {
    const p = pending;
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
    // scheduled before a wipe: the old person's data never lands after it
    if (!p || p.gen !== gen()) return;
    // a refused write is not swallowed (A-02): the hook shows «не сохранено на устройстве» until a write lands
    let done: Promise<void>;
    try {
      done = setItem(p.key, p.raw);
    } catch (e) {
      done = Promise.reject(e);
    }
    done.then(
      () => onResult?.(true),
      () => onResult?.(false),
    );
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

/** the hook's state; `forgotten` — reset by a wipe: not written until the next real change; `readError` — the device
 *  did not give the stored value (A-01): not loaded, never written, until a retry reads it */
export interface Slot<T> {
  key: string;
  value: T;
  loaded: boolean;
  forgotten?: boolean;
  readError?: ReadError;
}
/** «read» — getItem failed every try; «corrupt» — a strict key (the outbox) holds what is not JSON: kept as it is */
export type ReadError = "read" | "corrupt";
/** what the hook says about the device storage (A-01, A-02) */
export interface StorageHealth {
  readError: ReadError | null;
  /** the last write of this state was refused by the device; the next write that lands clears it */
  writeFailed: boolean;
  /** read the stored value again (after a read error) */
  retry: () => void;
}
/** a failed read is tried again this many times in all, with a growing pause (A-01) */
export const READ_TRIES = 3;
export const READ_PAUSE_MS = 300;
/** a setter's update, bound to the key it was meant for: an update for another key (a late answer for the company's
 *  cache once the hook holds «octo.db.v5») is dropped (19 §6.12) */
export function applyUpdate<T>(s: Slot<T>, next: T | ((prev: T) => T), forKey?: string): Slot<T> {
  if (forKey !== undefined && s.key !== forKey) return s;
  const value = typeof next === "function" ? (next as (p: T) => T)(s.value) : next;
  return s.readError ? { key: s.key, loaded: s.loaded, readError: s.readError, value } : { key: s.key, loaded: s.loaded, value };
}

/**
 * State that survives an app restart (offline-first: the phone keeps its copy).
 * Writes are debounced; the stored value is read whenever `key` changes (e.g. demo → a company's cache).
 * `ready` is false until the value for the current key is loaded, and nothing is written before that.
 * The setter takes an optional key: the update is applied only while the state still holds that key.
 * Unit-tested with its effects: test/persistHook.test.ts.
 */
export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
  /** `strict`: a stored value that is not JSON is an error, not «start fresh» — for what the phone has only there (the outbox) */
  opts?: { validate?: (v: T) => boolean; immediate?: boolean; strict?: boolean },
) {
  const init = () => (typeof initial === "function" ? (initial as () => T)() : initial);
  const [state, setState] = useState<Slot<T>>(() => ({ key, value: init(), loaded: false }));
  const [writeFailed, setWriteFailed] = useState(false);
  const [readTry, setReadTry] = useState(0);
  const writer = useRef<Writer | null>(null);
  // `immediate`: written in the same turn — for small state the phone must not lose (the outbox); else after 250 ms
  if (!writer.current)
    writer.current = createWriter((k, raw) => AsyncStorage.setItem(k, raw), opts?.immediate ? 0 : 250, deviceGeneration, (ok) => setWriteFailed(!ok));
  const strict = !!opts?.strict;
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
    // a failed read is tried again; when every try fails the state stays NOT loaded, so nothing is written over
    // what the device holds (A-01: the outbox was overwritten with [] after one failed read)
    const read = async (): Promise<string | null> => {
      for (let i = 1; ; i++) {
        try {
          return await AsyncStorage.getItem(key);
        } catch (e) {
          if (i >= READ_TRIES) throw e;
          await new Promise((r) => setTimeout(r, READ_PAUSE_MS * i));
          if (!alive || w !== wiped.current) throw e;
        }
      }
    };
    read()
      .then((raw) => {
        if (!alive || w !== wiped.current) return;
        let value = init();
        if (raw != null) {
          try {
            const parsed = JSON.parse(raw) as T;
            if (!validate.current || validate.current(parsed)) value = parsed;
          } catch {
            // the outbox (strict) is never started fresh: what it holds stays on the device, the store shows the error
            if (strict) return setState({ key, value: init(), loaded: false, readError: "corrupt" });
            /* corrupted cache: start fresh */
          }
        }
        setState({ key, value, loaded: true });
      })
      .catch(() => alive && w === wiped.current && setState({ key, value: init(), loaded: false, readError: "read" }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, readTry]);

  useEffect(
    () =>
      onDeviceForgotten((isWiped) => {
        const k = keyRef.current;
        if (!isWiped(k)) return;
        wiped.current += 1;
        writer.current!.forget();
        setWriteFailed(false);
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
  const retry = useCallback(() => setReadTry((n) => n + 1), []);
  const health: StorageHealth = { readError: state.key === key ? (state.readError ?? null) : null, writeFailed, retry };
  return [state.value, setValue, ready, health] as const;
}

/** the day the demo was seeded: the demo company's calendar day (its «today» is built from its midnight, seed.ts —
 *  docs/specs/03 П4b), so the demo is reseeded at midnight in Los Angeles, not at the phone's */
export const todayKey = demoToday;
