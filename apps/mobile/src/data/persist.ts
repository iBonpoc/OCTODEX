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
  /** the latest write: an older write's answer that comes after it says nothing about what is on the device now */
  let seq = 0;
  const write = () => {
    const p = pending;
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
    // scheduled before a wipe: the old person's data never lands after it
    if (!p || p.gen !== gen()) return;
    // a refused write is not swallowed (A-02): the hook shows «не сохранено на устройстве» until a write lands
    const my = ++seq;
    let done: Promise<void>;
    try {
      done = setItem(p.key, p.raw);
    } catch (e) {
      done = Promise.reject(e);
    }
    const told = (ok: boolean) => my === seq && p.gen === gen() && onResult?.(ok);
    done.then(
      () => told(true),
      () => told(false),
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
      seq += 1; // a write still running before the wipe tells nothing after it
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

/** the hook's state; `forgotten` — reset by a wipe, or a cache started empty after a failed read (#926): not written until the next real change; `readError` — the device
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
  /** «corrupt» only: the broken record is copied to its own key (`brokenKeyOf`), then the state starts empty and is
   *  written as usual (review of #910 №1: «Повторить» alone reads the same broken bytes forever) */
  salvage: (() => void) | null;
}
/** where a broken record is kept (never sent, wiped with the account — DEVICE_PREFIXES) */
export const BROKEN_PREFIX = "octo.broken.";
export const brokenKeyOf = (key: string, at: number) => `${BROKEN_PREFIX}${key}.${at}`;
/** a failed read is tried again this many times in all, with a growing pause (A-01) */
export const READ_TRIES = 3;
export const READ_PAUSE_MS = 300;
/**
 * A cache with `patient` (the company's data, store.tsx) is tried longer, ~8 s, before it starts empty (#926, review of #1037): a passing SQLITE_BUSY ends
 * meanwhile, and the store is not shown yet — nothing is changed on an empty base (the store writes whole values, so a
 * change made on the empty start could never be put onto the copy afterwards)
 */
export const CACHE_READ_TRIES = 7;
const pauseOf = (patient: boolean, i: number) => (patient ? Math.min(READ_PAUSE_MS * 2 ** (i - 1), 2000) : READ_PAUSE_MS * i);
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
  opts?: {
    validate?: (v: T) => boolean;
    immediate?: boolean;
    strict?: boolean;
    /** a cache whose empty start would show an empty company: tried ~8 s before it starts empty (#926). Not for the
     *  theme, the language, filters: the providers wait for them one after the other (review of #1037, round 2) */
    patient?: boolean;
    /** nothing under `key` yet: an older key's value is taken if `ok` says it is this state's (#864: the person-less
     *  cloud cache of an older version — the same person's only), written under `key` at once (the old one stays) */
    adopt?: { from: string; ok: (v: T) => boolean };
  },
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
  const patient = !strict && !!opts?.patient;
  /** the raw record a strict key could not parse: copied by «Сохранить копию и продолжить» */
  const broken = useRef<{ key: string; raw: string } | null>(null);
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
  const adopt = useRef(opts?.adopt);
  adopt.current = opts?.adopt;
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
    // «Повторить»: the error stays on screen while the read is tried again (no blank screen)
    setState((s) => (s.key === key && s.readError ? { key, value: init(), loaded: false, readError: s.readError } : { key, value: init(), loaded: false }));
    // a failed read is tried again; when every try fails the state stays NOT loaded, so nothing is written over
    // what the device holds (A-01: the outbox was overwritten with [] after one failed read)
    const read = async (): Promise<string | null> => {
      for (let i = 1; ; i++) {
        try {
          const raw = await AsyncStorage.getItem(key);
          const a = adopt.current;
          if (raw != null || !a) return raw;
          // an older key's copy (#864): taken only when it is this state's, and stored under the new key first
          const old = await AsyncStorage.getItem(a.from);
          if (old == null) return null;
          try {
            const v = JSON.parse(old) as T;
            if ((validate.current && !validate.current(v)) || !a.ok(v)) return null;
          } catch {
            return null;
          }
          await AsyncStorage.setItem(key, old).catch(() => {});
          return old;
        } catch (e) {
          if (i >= (patient ? CACHE_READ_TRIES : READ_TRIES)) throw e;
          await new Promise((r) => setTimeout(r, pauseOf(patient, i)));
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
            if (strict) {
              broken.current = { key, raw };
              return setState({ key, value: init(), loaded: false, readError: "corrupt" });
            }
            /* corrupted cache: start fresh */
          }
        }
        setState({ key, value, loaded: true });
      })
      .catch(() => {
        if (!alive || w !== wiped.current) return;
        // what the phone has only here (strict) waits for «Повторить»; a cache (the server's copy, the demo, a role)
        // starts fresh as before — a cache the device can never read (Android: a row over 2 MB) must not lock the app
        // for good (review of #910, second round №2)
        // — but its empty start is never written over the copy the device may still hold (#926: one SQLITE_BUSY without
        // the network wiped the company's data until the network came back): only the next real change is
        setState(strict ? { key, value: init(), loaded: false, readError: "read" } : { key, value: init(), loaded: true, forgotten: true });
      });
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
        // what could not be read is not «forgotten» into an empty value the store could write over the device (the
        // outbox keeps other people's ops): it stays not loaded until «Повторить» reads what is left
        setState((s) => (s.readError ? { key: k, value: initRef.current(), loaded: false, readError: s.readError } : { key: k, value: initRef.current(), loaded: true, forgotten: true }));
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
  const salvage = useCallback(() => {
    const b = broken.current;
    const k = keyRef.current;
    if (!b || b.key !== k) return;
    const w = wiped.current;
    // the copy first: the broken record is overwritten only once its copy is on the device
    AsyncStorage.setItem(brokenKeyOf(k, Date.now()), b.raw).then(
      () => {
        if (w !== wiped.current || keyRef.current !== k || broken.current !== b) return;
        broken.current = null;
        setState((s) => (s.key === k && s.readError === "corrupt" ? { key: k, value: initRef.current(), loaded: true } : s));
      },
      () => setWriteFailed(true),
    );
  }, []);
  const readError = state.key === key ? (state.readError ?? null) : null;
  const health: StorageHealth = { readError, writeFailed, retry, salvage: readError === "corrupt" ? salvage : null };
  return [state.value, setValue, ready, health] as const;
}

/** the day the demo was seeded: the demo company's calendar day (its «today» is built from its midnight, seed.ts —
 *  docs/specs/03 П4b), so the demo is reseeded at midnight in Los Angeles, not at the phone's */
export const todayKey = demoToday;
