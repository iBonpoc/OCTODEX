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

/* ---------- what the phone could not keep (#756, audit A-01/A-02): the sync badge says «Не сохранено на устройстве» ---------- */
/** «read» — the stored value could not be read (it is held: not written over); «write» — a write failed (full storage) */
export type StorageProblem = "read" | "write";
const problems = new Map<string, StorageProblem>();
const problemListeners = new Set<() => void>();
/** set (or clear with null) the problem of a key; the listeners hear a change only */
export function reportStorage(key: string, problem: StorageProblem | null, only?: StorageProblem): void {
  const was = problems.get(key);
  if (only && was !== only && problem === null) return;
  if (problem) problems.set(key, problem);
  else problems.delete(key);
  if (was !== (problem ?? undefined)) for (const cb of [...problemListeners]) cb();
}
export const storageProblems = (): ReadonlyMap<string, StorageProblem> => problems;
export function onStorageProblems(cb: () => void): () => void {
  problemListeners.add(cb);
  return () => {
    problemListeners.delete(cb);
  };
}
/** true while something the phone holds is not saved on it (the sync badge) */
export function useStorageTrouble(): boolean {
  const [n, setN] = useState(problems.size);
  useEffect(() => {
    setN(problems.size);
    return onStorageProblems(() => setN(problems.size));
  }, []);
  return n > 0;
}

/** the timings of the retries (tests make them short) */
export const persistTiming = {
  /** a failed read is tried again after these; then the state is held (or written over: overwriteOnReadError) */
  read: [100, 500, 2000] as number[],
  /** a held state is read again after this (the n-th time) */
  held: (n: number) => Math.min(30_000, 5_000 * n),
  /** a failed write is tried again after this (the n-th failure in a row) */
  write: (n: number) => Math.min(30_000, 1_000 * 2 ** (n - 1)),
};

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
 * A failed write (full storage, #756 A-02) is never dropped silently: the key is reported («write») and the same value
 * is tried again later, until it is written or a newer change takes its place.
 */
export function createWriter(setItem: SetItem, ms = 250, gen: () => number = deviceGeneration): Writer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { key: string; raw: string; gen: number } | null = null;
  let fails = 0;
  const write = () => {
    const p = pending;
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
    // scheduled before a wipe: the old person's data never lands after it
    if (!p || p.gen !== gen()) return;
    let done: Promise<void>;
    try {
      done = setItem(p.key, p.raw);
    } catch (e) {
      done = Promise.reject(e);
    }
    done.then(
      () => {
        fails = 0;
        reportStorage(p.key, null);
      },
      () => {
        if (p.gen !== gen()) return; // wiped meanwhile: nothing to keep
        reportStorage(p.key, "write");
        if (pending) return; // a newer change waits: it is written instead (and reports itself)
        fails += 1;
        pending = p;
        timer = setTimeout(write, persistTiming.write(fails));
      },
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
      fails = 0;
    },
    flush: () => {
      if (pending) write();
    },
  };
}

/* ---------- reading the stored value (pure, unit-tested: test/persist.test.ts) ---------- */
export interface KV {
  getItem: (key: string) => Promise<string | null>;
  setItem: SetItem;
}
/** where a value that is not JSON is kept before the state starts over (wiped with the account: deleteAccount.ts) */
export const corruptKey = (key: string) => `octo.corrupt.v1.${key}`;
/** `ok: false` — not read (the storage failed, or a broken value could not be kept aside): never write over it */
export type Loaded<T> = { ok: true; value: T | undefined } | { ok: false };
export async function loadStored<T>(kv: KV, key: string, validate?: (v: T) => boolean): Promise<Loaded<T>> {
  let raw: string | null;
  try {
    raw = await kv.getItem(key);
  } catch {
    return { ok: false };
  }
  if (raw == null) return { ok: true, value: undefined };
  let parsed: T;
  try {
    parsed = JSON.parse(raw) as T;
  } catch {
    // broken (#756): its raw copy is kept first; only then the state starts fresh
    try {
      await kv.setItem(corruptKey(key), raw);
    } catch {
      return { ok: false };
    }
    return { ok: true, value: undefined };
  }
  // not valid (the demo of another day, the cache of an older shape): starts fresh, as before
  return { ok: true, value: !validate || validate(parsed) ? parsed : undefined };
}
/**
 * A held state was read at last: what the phone stored meets what it did meanwhile in memory. Not changed — the stored
 * value. A list (the queue, the outbox) — the stored items, then the new ones that are not among them (by id). Anything
 * else — the latest choice, in memory.
 */
export function recoverHeld<T>(stored: T | undefined, mine: T, dirty: boolean): T | undefined {
  if (!dirty) return stored;
  if (stored === undefined) return mine;
  if (Array.isArray(stored) && Array.isArray(mine)) {
    const idOf = (x: unknown) => (x !== null && typeof x === "object" && "id" in x ? (x as { id: unknown }).id : undefined);
    const have = new Set<unknown>((stored as unknown[]).map(idOf).filter((id) => id !== undefined));
    return [...stored, ...mine.filter((m) => idOf(m) === undefined || !have.has(idOf(m)))] as T;
  }
  return mine;
}

/* ---------- «the app is leaving»: every pending write now (review #263, the lost 250 ms) ---------- */
const live = new Set<Writer>();
/** the writers of the persistent states that are mounted */
export const liveWriters = (): ReadonlySet<Writer> => live;
/** the app goes to the background / the tab is hidden or closed: write what waits (the store calls it, appActive.ts) */
export function flushAllWriters(): void {
  for (const w of [...live]) w.flush();
}

/** the hook's state; `forgotten` — reset by a wipe: not written until the next real change; `held` — the stored value
 *  could not be read (#756): the state works in memory and is never written over the stored one; `dirty` — changed
 *  while held */
export interface Slot<T> {
  key: string;
  value: T;
  loaded: boolean;
  forgotten?: boolean;
  held?: boolean;
  dirty?: boolean;
}
/** a setter's update, bound to the key it was meant for: an update for another key (a late answer for the company's
 *  cache once the hook holds «octo.db.v5») is dropped (19 §6.12) */
export function applyUpdate<T>(s: Slot<T>, next: T | ((prev: T) => T), forKey?: string): Slot<T> {
  if (forKey !== undefined && s.key !== forKey) return s;
  const value = typeof next === "function" ? (next as (p: T) => T)(s.value) : next;
  return s.held ? { key: s.key, loaded: s.loaded, value, held: true, dirty: true } : { key: s.key, loaded: s.loaded, value };
}

/**
 * State that survives an app restart (offline-first: the phone keeps its copy).
 * Writes are debounced; the stored value is read whenever `key` changes (e.g. demo → a company's cache).
 * `ready` is false until the value for the current key is loaded, and nothing is written before that.
 * The setter takes an optional key: the update is applied only while the state still holds that key.
 * A failed read is retried; still failing, the state is held — ready, in memory, never written over what is stored —
 * and read again in the background (#756 A-01). `overwriteOnReadError`: a cache the server fills again (the company,
 * the demo) is written anew instead — an unreadable one (too big for Android) would be held for ever.
 * Unit-tested with its effects: test/persistHook.test.ts.
 */
export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
  opts?: { validate?: (v: T) => boolean; immediate?: boolean; overwriteOnReadError?: boolean },
) {
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
  const overwrite = useRef(opts?.overwriteOnReadError);
  overwrite.current = opts?.overwriteOnReadError;
  const initRef = useRef(init);
  initRef.current = init;
  const keyRef = useRef(key);
  keyRef.current = key;
  /** grows when this state is wiped: a read still running for it is dropped */
  const wiped = useRef(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    const w = wiped.current;
    const current = () => alive && w === wiped.current;
    writer.current!.keyChanged(key);
    setState({ key, value: init(), loaded: false });
    const attempt = () => {
      timer = null;
      void loadStored<T>(AsyncStorage, key, validate.current).then((res) => {
        if (!current()) return;
        if (res.ok) {
          reportStorage(key, null, "read");
          setState((s) => {
            if (s.key !== key) return s;
            const value = s.held ? recoverHeld(res.value, s.value, !!s.dirty) : res.value;
            return { key, value: value === undefined ? initRef.current() : value, loaded: true };
          });
          return;
        }
        failures += 1;
        const retry = persistTiming.read[failures - 1];
        if (retry !== undefined) {
          timer = setTimeout(attempt, retry);
          return;
        }
        if (overwrite.current) {
          // a cache: start it anew (the next good write clears the problem)
          reportStorage(key, "read");
          setState((s) => (s.key !== key ? s : { key, value: initRef.current(), loaded: true }));
          return;
        }
        reportStorage(key, "read");
        setState((s) => (s.key !== key || s.held ? s : { key, value: initRef.current(), loaded: true, held: true }));
        timer = setTimeout(attempt, persistTiming.held(failures - persistTiming.read.length));
      });
    };
    attempt();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      reportStorage(key, null, "read"); // not held any more: the badge does not speak of it
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
        reportStorage(k, null);
        setState({ key: k, value: initRef.current(), loaded: true, forgotten: true });
      }),
    [],
  );

  const ready = state.loaded && state.key === key;
  useEffect(() => {
    if (!ready || state.forgotten || state.held) return;
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
