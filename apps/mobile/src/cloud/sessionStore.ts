/**
 * #1634: the sign-in (access and refresh tokens) is kept in the phone's protected store — the iOS Keychain / the Android
 * Keystore (expo-secure-store, «after the first unlock, this device only»: never in a backup, never on another device) —
 * not as plain text in AsyncStorage. The web keeps localStorage (AsyncStorage) as before.
 * - A build without the native module (JS by air in an older build: runtimeVersion = sdkVersion) keeps AsyncStorage,
 *   as before; the module is looked up before the package is loaded (loading it throws there).
 * - The store holds up to ~2 KB a value: a longer one goes in parts of a new «generation», then one write switches the
 *   pointer to it, then the old parts go — an app killed in the middle reads the whole value before (never a mix, which
 *   would sign the person out: the server has already changed the refresh token).
 * - One operation at a time per key (auth-js reads the session around its own write when it refreshes the token).
 * - The move: a copy in AsyncStorage (an older version's, or a write the protected store refused) is newer — read first,
 *   written to the protected store, then removed (tried again on every write until it goes).
 * - A read the iOS store refuses (before the first unlock after a restart) throws — auth-js keeps the session then; on
 *   Android the module itself removes an entry it can never decrypt (a lost key) — what reaches us is a passing Keystore
 *   error: it reads as none, nothing is removed (the next write replaces it; review №1).
 * - A reinstall on iOS: the Keychain outlives the app, AsyncStorage does not — no install mark and no old copy → the
 *   session left in the Keychain is removed (the next person on the phone never finds it).
 * Rollback by air to a JS before this change: it reads AsyncStorage only — one sign-in again, no data lost (№11, 15.11).
 * Pure core (makeSessionStore): test/sessionStore.test.ts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

/** what supabase-js needs of `auth.storage` */
export interface SessionStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}
/** the protected store (expo-secure-store with the options set) */
export interface SecureKV {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  del: (key: string) => Promise<void>;
}

/** the install mark (AsyncStorage: wiped with the app, unlike the iOS Keychain) */
export const INSTALL_MARK = "octo.installed.v1";
/** a part's length in UTF-16 units: ≤ 3 bytes each in UTF-8 → under the store's 2048 bytes */
export const PART = 600;
const POINTER = "gen:";
/** the store allows [A-Za-z0-9._-] in a key */
export const KEY_OK = /^[A-Za-z0-9._-]+$/;

/** `value` cut in parts of ≤ `size` units, never between the two halves of a surrogate pair (pure) */
export function cut(value: string, size = PART): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < value.length) {
    let end = Math.min(i + size, value.length);
    const c = value.charCodeAt(end - 1);
    if (end < value.length && c >= 0xd800 && c <= 0xdbff) end -= 1;
    out.push(value.slice(i, end));
    i = end;
  }
  return out;
}
const parseGen = (v: string): { gen: string; n: number } | null => {
  const m = /^gen:([A-Za-z0-9]+):(\d+)$/.exec(v);
  return m ? { gen: m[1], n: Number(m[2]) } : null;
};
const partKey = (key: string, gen: string, i: number) => `${key}.${gen}.${i}`;

/** auth-js's keys of one session: «<storageKey>», «-user», «-code-verifier» — from any of them (pure) */
export function sessionKeys(key: string): string[] {
  const base = key.replace(/-(user|code-verifier)$/, "");
  return [base, `${base}-user`, `${base}-code-verifier`];
}

export interface StoreOpts {
  /** null — no native module (web, an older build): AsyncStorage as before */
  secure: SecureKV | null;
  plain: SessionStorage;
  /** Android: a read that fails reads as none, nothing removed (iOS: a refused read throws — the Keychain is locked) */
  dropUnreadable: boolean;
  newGen?: () => string;
  part?: number;
}

export function makeSessionStore(o: StoreOpts): SessionStorage & { forget: (keys: readonly string[]) => Promise<void> } {
  const { plain } = o;
  const secure = o.secure;
  if (!secure) return { ...plain, forget: async (keys) => void (await Promise.all(keys.map((k) => plain.removeItem(k).catch(() => {})))) };
  const size = o.part ?? PART;
  const newGen = o.newGen ?? (() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

  // one operation at a time per key
  const queues = new Map<string, Promise<unknown>>();
  const serial = <T,>(key: string, run: () => Promise<T>): Promise<T> => {
    const prev = queues.get(key) ?? Promise.resolve();
    const next = prev.then(run, run);
    queues.set(
      key,
      next.catch(() => {}),
    );
    return next;
  };

  const rawGet = async (k: string): Promise<string | null> => {
    try {
      return await secure.get(k);
    } catch (e) {
      if (!o.dropUnreadable) throw e;
      return null;
    }
  };
  const readSecure = async (key: string): Promise<string | null> => {
    const head = await rawGet(key);
    if (head == null || !head.startsWith(POINTER)) return head;
    const g = parseGen(head);
    if (!g) return null;
    const parts: string[] = [];
    for (let i = 0; i < g.n; i++) {
      const p = await rawGet(partKey(key, g.gen, i));
      if (p == null) return null; // never written whole (the pointer goes last): not a value
      parts.push(p);
    }
    return parts.join("");
  };
  const dropGen = async (key: string, head: string | null) => {
    const g = head ? parseGen(head) : null;
    if (g) for (let i = 0; i < g.n; i++) await secure.del(partKey(key, g.gen, i)).catch(() => {});
  };
  const writeSecure = async (key: string, value: string) => {
    const head = await rawGet(key).catch(() => null);
    if (value.length <= size && !value.startsWith(POINTER)) {
      await secure.set(key, value);
    } else {
      const gen = newGen();
      const parts = cut(value, size);
      try {
        for (let i = 0; i < parts.length; i++) await secure.set(partKey(key, gen, i), parts[i]);
        await secure.set(key, `${POINTER}${gen}:${parts.length}`);
      } catch (e) {
        // the new parts without a pointer would stay in the Keychain for ever (nothing finds them): taken away now
        for (let i = 0; i < parts.length; i++) await secure.del(partKey(key, gen, i)).catch(() => {});
        throw e;
      }
    }
    await dropGen(key, head);
  };

  // a reinstall on iOS: the Keychain outlived the app — its session is removed once (see the header)
  let installed: Promise<void> | null = null;
  const ensureInstalled = (key: string) =>
    (installed ??= (async () => {
      const mark = await plain.getItem(INSTALL_MARK).catch(() => "?");
      if (mark != null) return;
      // the session's three keys whichever of them is asked first (security-check of #1682)
      const keys = sessionKeys(key);
      let old = false;
      for (const k of keys) if ((await plain.getItem(k).catch(() => "?")) != null) old = true;
      // the mark first: one that cannot be written never wipes (a later start would wipe a live session)
      const ok = await plain.setItem(INSTALL_MARK, "1").then(
        () => true,
        () => false,
      );
      if (!ok || old) return;
      for (const k of keys) {
        const head = await rawGet(k).catch(() => null);
        await secure.del(k).catch(() => {});
        await dropGen(k, head);
      }
    })().catch(() => {}));

  /** the copy in AsyncStorage goes once the protected store has the value; if it cannot go, it is made that value (it
   *  is read first: an older one there would bring back a refresh token the server has already replaced — review №2) */
  const dropCopy = async (key: string, value: string) => {
    await plain.removeItem(key).catch(() => plain.setItem(key, value).catch(() => {}));
  };
  const removeBoth = async (key: string) => {
    const head = await rawGet(key).catch(() => null);
    await secure.del(key).catch(() => {});
    await dropGen(key, head);
    await plain.removeItem(key).catch(() => {});
  };

  return {
    getItem: (key) =>
      serial(key, async () => {
        await ensureInstalled(key);
        const copy = await plain.getItem(key).catch(() => null);
        if (copy != null) {
          // newer than the protected store's: moved there now (left for the next try if refused)
          try {
            await writeSecure(key, copy);
            await dropCopy(key, copy);
          } catch {
            // stays in AsyncStorage: read from there
          }
          return copy;
        }
        return readSecure(key);
      }),
    setItem: (key, value) =>
      serial(key, async () => {
        await ensureInstalled(key);
        try {
          await writeSecure(key, value);
        } catch {
          // the protected store refused: the sign-in is not lost — kept in AsyncStorage, read first, moved later
          await plain.setItem(key, value);
          return;
        }
        await dropCopy(key, value);
      }),
    removeItem: (key) => serial(key, () => removeBoth(key)),
    /** the account is deleted: these keys leave both stores (the Keychain outlives the app on iOS) */
    forget: async (keys) => void (await Promise.all(keys.map((k) => serial(k, () => removeBoth(k))))),
  };
}

type SecureModule = Pick<typeof import("expo-secure-store"), "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY" | "getItemAsync" | "setItemAsync" | "deleteItemAsync">;
/**
 * the native module of this build, or null (web; an older build that got this JS by air). `has` and `load` — the
 * module's lookup and the package (tests); the package is loaded only once the module is known to be there
 */
// react-native and expo are loaded on first use, not when this file is (tests of modules that import it run in node)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const platformOS = () => (require("react-native") as typeof import("react-native")).Platform.OS;
export function nativeSecure(
  os: string = platformOS(),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  has: () => unknown = () => (require("expo") as typeof import("expo")).requireOptionalNativeModule("ExpoSecureStore"),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  load: () => SecureModule = () => require("expo-secure-store") as SecureModule,
): SecureKV | null {
  if (os === "web") return null;
  try {
    if (!has()) return null;
    const S = load();
    const opts = { keychainAccessible: S.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
    return {
      get: (k) => S.getItemAsync(k, opts),
      set: (k, v) => S.setItemAsync(k, v, opts),
      del: (k) => S.deleteItemAsync(k, opts),
    };
  } catch {
    return null;
  }
}

let made: ReturnType<typeof makeSessionStore> | null = null;
const real = () =>
  (made ??= makeSessionStore({ secure: nativeSecure(), plain: AsyncStorage as unknown as SessionStorage, dropUnreadable: platformOS() === "android" }));
/** the app's session store (supabase-js `auth.storage`): which store — decided on first use */
export const sessionStore: ReturnType<typeof makeSessionStore> = {
  getItem: (k) => real().getItem(k),
  setItem: (k, v) => real().setItem(k, v),
  removeItem: (k) => real().removeItem(k),
  forget: (ks) => real().forget(ks),
};

/**
 * the session read at the start, tried again while the protected store refuses (iOS before the first unlock: the read
 * throws — never «no session»); stops when `alive` says the screen is gone (review 24.11: the start never hangs on it)
 */
export async function readSessionRetrying<T>(get: () => Promise<T>, alive: () => boolean, pauseMs = 2000): Promise<T | null> {
  for (;;) {
    try {
      return await get();
    } catch {
      if (!alive()) return null;
      await new Promise((r) => setTimeout(r, pauseMs));
      if (!alive()) return null;
    }
  }
}
