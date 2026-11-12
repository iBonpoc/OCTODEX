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
  /** #1189 (code-reviewer №2): the device's writes of this key wait for `p` (the copy of what is about to be written over);
   *  scheduling, a key change and a flush stay as they are — a write is never dropped while it waits, only one made
   *  before a wipe is (its generation) */
  hold: (p: Promise<unknown>) => void;
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
  /** the writes wait for this (hold) */
  let gate: Promise<unknown> | null = null;
  const write = () => {
    const p = pending;
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
    // scheduled before a wipe: the old person's data never lands after it
    if (!p || p.gen !== gen()) return;
    // a refused write is not swallowed (A-02): the hook shows «не сохранено на устройстве» until a write lands
    const my = ++seq;
    const put = () => {
      // waited for a copy and a wipe came meanwhile: nothing lands
      if (p.gen !== gen()) return Promise.resolve();
      try {
        return setItem(p.key, p.raw);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    // in order: a later write waits for the gate too, so it never lands before an earlier one
    const done: Promise<void> = gate ? gate.then(put, put) : put();
    if (gate) gate = done.catch(() => {});
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
    hold: (p) => {
      const g = (gate ?? Promise.resolve()).then(() => p).catch(() => {});
      gate = g;
      void g.then(() => {
        if (gate === g) gate = null;
      });
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
/** #1189 (the director): the copies of one key do not pile up — the newest this many stay */
export const BROKEN_KEEP = 3;
/** #1189 (the director, code-reviewer №3): all copies of caches together stay within this many characters — Android's
 *  AsyncStorage is 6 MB in all, the web's localStorage about 5 MB; the live record and the outbox must still fit */
export const BROKEN_MAX_CHARS = 2_000_000;
/** the keys whose copies are the only trace of what the phone has (the outbox, the queue — `strict`): their copies are
 *  never removed to make room and never cut to BROKEN_KEEP (code-reviewer №4) */
const keptWhole = new Set<string>();
const sourceOf = (copy: string) => copy.slice(BROKEN_PREFIX.length, copy.lastIndexOf("."));
const timeOf = (copy: string) => Number(copy.slice(copy.lastIndexOf(".") + 1));

/**
 * #1189: a record the phone is about to start over (unreadable, not of the expected shape, or read again before the first
 * write after a failed read) is first copied to its own key (`brokenKeyOf`). Of a cache: the newest BROKEN_KEEP copies of
 * a key stay, and all caches' copies together within BROKEN_MAX_CHARS — the oldest go first, each noted in the log; a
 * copy larger than that alone is not kept. A wipe (account deletion) during the copy: nothing stays. `whole` — a strict
 * key's copy (the outbox): only written, nothing removed for it. true — the copy is on the device.
 */
export async function keepBrokenCopy(key: string, raw: string, now = Date.now(), opts: { whole?: boolean; gen?: number } = {}): Promise<boolean> {
  const g = opts.gen ?? deviceGeneration();
  const k = brokenKeyOf(key, now);
  const put = async () => {
    if (g !== deviceGeneration()) return false;
    await AsyncStorage.setItem(k, raw);
    // the wipe came while it was written (its list of keys may be from before): it goes too
    if (g !== deviceGeneration()) {
      await AsyncStorage.removeItem(k).catch(() => {});
      return false;
    }
    return true;
  };
  if (opts.whole) {
    keptWhole.add(key);
    try {
      return await put();
    } catch {
      return false;
    }
  }
  if (raw.length > BROKEN_MAX_CHARS) {
    await noteStorageLoss(key, "a copy too large to keep");
    return false;
  }
  /** the caches' copies there are, the oldest first, with their sizes */
  const caches = async () => {
    try {
      const ks = ((await AsyncStorage.getAllKeys()) as string[]).filter((x) => x.startsWith(BROKEN_PREFIX) && x !== k && !keptWhole.has(sourceOf(x)));
      const out: { key: string; size: number }[] = [];
      for (const x of ks) out.push({ key: x, size: ((await AsyncStorage.getItem(x).catch(() => null)) ?? "").length });
      return out.sort((a, b) => timeOf(a.key) - timeOf(b.key));
    } catch {
      return [];
    }
  };
  const drop = async (xs: { key: string }[], why: string) => {
    if (!xs.length) return;
    try {
      await AsyncStorage.multiRemove(xs.map((x) => x.key));
    } catch {
      return;
    }
    for (const x of xs) await noteStorageLoss(sourceOf(x.key), `${why}: ${x.key}`);
  };
  // room first: this key's older copies past BROKEN_KEEP, then the oldest of all until the new one fits
  let have = await caches();
  const mine = have.filter((x) => sourceOf(x.key) === key);
  const over = mine.slice(0, Math.max(0, mine.length - (BROKEN_KEEP - 1)));
  await drop(over, "an older copy removed (BROKEN_KEEP)");
  have = have.filter((x) => !over.includes(x));
  const gone: typeof have = [];
  let total = have.reduce((n, x) => n + x.size, 0) + raw.length;
  for (const x of have) {
    if (total <= BROKEN_MAX_CHARS) break;
    gone.push(x);
    total -= x.size;
  }
  await drop(gone, "an older copy removed for room");
  try {
    return await put();
  } catch {
    // the device is full all the same: every other cache copy makes room, then once more
    await drop(have.filter((x) => !gone.includes(x)), "an older copy removed: the device was full");
    try {
      return await put();
    } catch {
      return false;
    }
  }
}

/** #1189 (the director): where the phone notes a record it had to start over without a copy — the key, when, why; the
 *  newest STORAGE_LOG_KEEP entries (no data in them, only the key's name) */
export const STORAGE_LOG_KEY = "octo.storageLog.v1";
export const STORAGE_LOG_KEEP = 50;
/** one note at a time: two at once would each read the log and one would lose the other's line (code-reviewer №9) */
let logTail: Promise<void> = Promise.resolve();
export function noteStorageLoss(key: string, what: string, at = new Date().toISOString()): Promise<void> {
  // eslint-disable-next-line no-console
  console.warn(`[storage] ${key}: ${what}`);
  const g = deviceGeneration();
  const run = logTail.then(() => (g === deviceGeneration() ? appendLog(key, what, at, g) : undefined));
  logTail = run.catch(() => {});
  return logTail;
}
async function appendLog(key: string, what: string, at: string, g: number): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_LOG_KEY);
    const list = (() => {
      try {
        const v = raw ? (JSON.parse(raw) as unknown) : [];
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    })();
    // a wipe meanwhile (the log names the deleted person's keys): not written back
    if (g !== deviceGeneration()) return;
    await AsyncStorage.setItem(STORAGE_LOG_KEY, JSON.stringify([...list, { key, at, what }].slice(-STORAGE_LOG_KEEP)));
  } catch {
    /* the device refuses even this: the console line is all there is */
  }
}
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
  /** #1189: the key whose read failed — its record is copied before the first write over it */
  const copyBeforeWrite = useRef<string | null>(null);

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
    const g = deviceGeneration();
    read()
      .then(async (raw) => {
        if (!alive || w !== wiped.current) return;
        // read now: no copy is owed before the first write (code-reviewer №7)
        if (copyBeforeWrite.current === key) copyBeforeWrite.current = null;
        let value = init();
        let fresh = false;
        if (raw != null) {
          try {
            const parsed = JSON.parse(raw) as T;
            if (!validate.current || validate.current(parsed)) value = parsed;
            else fresh = true;
          } catch {
            // the outbox (strict) is never started fresh: what it holds stays on the device, the store shows the error
            if (strict) {
              broken.current = { key, raw };
              return setState({ key, value: init(), loaded: false, readError: "corrupt" });
            }
            fresh = true;
          }
        }
        if (fresh) {
          // #1189: a cache that cannot be read as it is (not JSON, not of the expected shape) is copied before it is started
          // over; the copy refused (the device is full) — the empty start is not written over it until a real change
          const copied = await keepBrokenCopy(key, raw!, Date.now(), { gen: g });
          if (!alive || w !== wiped.current) return;
          if (!copied) {
            void noteStorageLoss(key, "unreadable record: no copy could be kept, started over");
            return setState({ key, value, loaded: true, forgotten: true });
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
        // #1189: before the first write over it, the record is read once more and copied (a passing SQLITE_BUSY)
        if (!strict) copyBeforeWrite.current = key;
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
    const k = state.key;
    const raw = JSON.stringify(state.value);
    // #1189: the first write after a failed read — what the device holds is read once more and copied first; the writes
    // after it wait for the copy (in order). Read again failed: written all the same (the app must not lock, #910/#926)
    // and the loss is noted (the key, when) so it can be found later
    // The writes go to the writer at once (a key change, a flush and the app leaving see them — code-reviewer №2); only
    // the device's write waits for the copy. A wipe during it: neither the copy nor the write lands (№1)
    if (copyBeforeWrite.current === k) {
      copyBeforeWrite.current = null;
      const g = deviceGeneration();
      const at = Date.now();
      writer.current!.hold(
        AsyncStorage.getItem(k).then(
          async (old) => {
            if (old == null || old === raw || g !== deviceGeneration()) return;
            // the person's records, as the device held them: found later by the log (code-reviewer №5)
            // the log is not waited for: the write waits for the copy only
            if (await keepBrokenCopy(k, old, at, { gen: g })) void noteStorageLoss(k, `written over after a failed read: the record before is kept at ${brokenKeyOf(k, at)}`);
            else void noteStorageLoss(k, "written over after a failed read: no copy could be kept");
          },
          () => void noteStorageLoss(k, "written over after a failed read: read again failed, no copy"),
        ),
      );
    }
    writer.current!.schedule(k, raw);
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
    keepBrokenCopy(k, b.raw, Date.now(), { whole: true }).then(
      (ok) => {
        if (!ok) return setWriteFailed(true);
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
 *  docs/specs/03 П4b). Only a mark of when it was made: the demo is never reseeded by itself at midnight (#1182 — the
 *  founder's demo records were lost so); it starts over only by «Сбросить тестовые данные» */
export const todayKey = demoToday;
