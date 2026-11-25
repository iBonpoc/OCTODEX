/**
 * unit:sessionStore (#1634) — the sign-in in the phone's protected store: parts by generation (an app killed in the
 * middle reads the value before), one operation at a time per key, the move from AsyncStorage (a copy there is newer),
 * a refused read on iOS throws (auth-js keeps the session), a broken Android entry goes, a reinstall on iOS removes the
 * session the Keychain kept, and a build without the native module keeps AsyncStorage as before.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

import { cut, INSTALL_MARK, KEY_OK, makeSessionStore, nativeSecure, sessionKeys, type SecureKV, type SessionStorage } from "../src/cloud/sessionStore";

const KEY = "sb-abcdefgh-auth-token";
function stores(plainInit: Record<string, string> = { [INSTALL_MARK]: "1" }) {
  const sec = new Map<string, string>();
  const plain = new Map(Object.entries(plainInit));
  const fail = { set: null as null | ((k: string) => boolean), get: null as null | ((k: string) => boolean) };
  const secure: SecureKV = {
    get: async (k) => {
      if (fail.get?.(k)) throw new Error("User interaction is not allowed");
      return sec.get(k) ?? null;
    },
    set: async (k, v) => {
      expect(k).toMatch(KEY_OK);
      expect(new TextEncoder().encode(v).length).toBeLessThanOrEqual(2048);
      if (fail.set?.(k)) throw new Error("errSecInteractionNotAllowed");
      sec.set(k, v);
    },
    del: async (k) => void sec.delete(k),
  };
  const p: SessionStorage = {
    getItem: async (k) => plain.get(k) ?? null,
    setItem: async (k, v) => void plain.set(k, v),
    removeItem: async (k) => void plain.delete(k),
  };
  return { sec, plain, fail, secure, p };
}
const session = (n: number) => JSON.stringify({ access_token: "a".repeat(n), refresh_token: "r", user: { name: "Иван 👷" } });
let g = 0;
const gen = () => `g${++g}`;

describe("unit:sessionStore — parts by generation (#1634)", () => {
  it("cut: never more than the size, never between a surrogate pair, joins back", () => {
    const v = `${"x".repeat(599)}👷${"я".repeat(1300)}`;
    const parts = cut(v, 600);
    expect(parts.join("")).toBe(v);
    expect(parts.every((p) => p.length <= 600)).toBe(true);
    expect(parts[0]!.length).toBe(599);
    expect(cut("", 600)).toEqual([]);
  });
  it("a short value goes as it is; a long one in parts behind a pointer; both read back; a shorter write drops the old parts", async () => {
    const s = stores();
    const st = makeSessionStore({ secure: s.secure, plain: s.p, dropUnreadable: false, newGen: gen });
    await st.setItem(KEY, "short");
    expect(s.sec.get(KEY)).toBe("short");
    const long = session(3000);
    await st.setItem(KEY, long);
    expect(s.sec.get(KEY)).toMatch(/^gen:g\d+:\d+$/);
    expect(await st.getItem(KEY)).toBe(long);
    const longer = session(5000);
    await st.setItem(KEY, longer);
    expect(await st.getItem(KEY)).toBe(longer);
    await st.setItem(KEY, "short2");
    expect([...s.sec.keys()]).toEqual([KEY]);
    expect(await st.getItem(KEY)).toBe("short2");
  });
  it("a write cut off after k parts (the app killed): the value before is read whole — never a mix", async () => {
    const s = stores();
    const st = makeSessionStore({ secure: s.secure, plain: s.p, dropUnreadable: false, newGen: gen });
    const before = session(3000);
    await st.setItem(KEY, before);
    // the new value: two parts written, then the app is killed (no more writes reach either store)
    let n = 0;
    const killed = makeSessionStore({
      secure: { ...s.secure, set: async (k, v) => (n++ < 2 ? void s.sec.set(k, v) : Promise.reject(new Error("killed"))) },
      plain: { ...s.p, setItem: async () => Promise.reject(new Error("killed")) },
      dropUnreadable: false,
      newGen: gen,
    });
    await killed.setItem(KEY, session(4000)).catch(() => {});
    expect(await makeSessionStore({ secure: s.secure, plain: s.p, dropUnreadable: false }).getItem(KEY)).toBe(before);
  });
  it("a pointer to parts that are not all there reads as none", async () => {
    const s = stores();
    s.sec.set(KEY, "gen:zz:3");
    s.sec.set(`${KEY}.zz.0`, "{");
    expect(await makeSessionStore({ secure: s.secure, plain: s.p, dropUnreadable: false }).getItem(KEY)).toBeNull();
  });
  it("one operation at a time per key: a read started during a write sees the new value whole", async () => {
    const s = stores();
    const slow: SecureKV = { ...s.secure, set: async (k, v) => (await new Promise((r) => setTimeout(r, 2)), s.secure.set(k, v)) };
    const st = makeSessionStore({ secure: slow, plain: s.p, dropUnreadable: false, newGen: gen });
    await st.setItem(KEY, session(2000));
    const next = session(3500);
    const w = st.setItem(KEY, next);
    const r = st.getItem(KEY);
    await w;
    expect(await r).toBe(next);
  });
});

describe("unit:sessionStore — the move, refusals, a reinstall (#1634)", () => {
  it("an older version's copy in AsyncStorage moves to the protected store and leaves AsyncStorage", async () => {
    const s = stores({ [KEY]: session(2500) });
    const st = makeSessionStore({ secure: s.secure, plain: s.p, dropUnreadable: false, newGen: gen });
    expect(await st.getItem(KEY)).toBe(session(2500));
    expect(s.plain.has(KEY)).toBe(false);
    expect(s.plain.get(INSTALL_MARK)).toBe("1");
    expect(await st.getItem(KEY)).toBe(session(2500)); // now from the protected store
  });
  it("the protected store refuses a write: the new value stays in AsyncStorage and is read first (not the old one)", async () => {
    const s = stores();
    const st = makeSessionStore({ secure: s.secure, plain: s.p, dropUnreadable: false, newGen: gen });
    await st.setItem(KEY, "old");
    s.fail.set = () => true;
    await st.setItem(KEY, "new");
    expect(s.plain.get(KEY)).toBe("new");
    expect(await st.getItem(KEY)).toBe("new");
    s.fail.set = null;
    await st.setItem(KEY, "newer"); // a write that goes takes the copy away
    expect(s.plain.has(KEY)).toBe(false);
    expect(await st.getItem(KEY)).toBe("newer");
  });
  it("iOS: a refused read (before the first unlock) throws — never «no session»; Android: reads as none, nothing removed", async () => {
    const s = stores();
    await makeSessionStore({ secure: s.secure, plain: s.p, dropUnreadable: false }).setItem(KEY, "v");
    s.fail.get = () => true;
    await expect(makeSessionStore({ secure: s.secure, plain: s.p, dropUnreadable: false }).getItem(KEY)).rejects.toThrow();
    expect(s.sec.get(KEY)).toBe("v");
    expect(await makeSessionStore({ secure: s.secure, plain: s.p, dropUnreadable: true }).getItem(KEY)).toBeNull();
    expect(s.sec.get(KEY)).toBe("v"); // a passing Keystore error never signs the person out for good
    s.fail.get = null;
    expect(await makeSessionStore({ secure: s.secure, plain: s.p, dropUnreadable: true }).getItem(KEY)).toBe("v");
  });
  it("a reinstall on iOS (no mark, no copy): the session the Keychain kept is removed; with the mark it stays", async () => {
    const s = stores({});
    s.sec.set(KEY, "of the person before");
    s.sec.set(`${KEY}-user`, "u");
    expect(await makeSessionStore({ secure: s.secure, plain: s.p, dropUnreadable: false }).getItem(KEY)).toBeNull();
    expect(s.sec.size).toBe(0);
    expect(s.plain.get(INSTALL_MARK)).toBe("1");
    s.sec.set(KEY, "mine");
    expect(await makeSessionStore({ secure: s.secure, plain: s.p, dropUnreadable: false }).getItem(KEY)).toBe("mine");
  });
  it("the copy in AsyncStorage cannot be removed: it is made the newest value (never an older refresh token read first)", async () => {
    const s = stores();
    const st = makeSessionStore({ secure: s.secure, plain: { ...s.p, removeItem: async () => Promise.reject(new Error("busy")) }, dropUnreadable: false, newGen: gen });
    s.plain.set(KEY, "old");
    await st.setItem(KEY, "new");
    expect(s.plain.get(KEY)).toBe("new");
    expect(await st.getItem(KEY)).toBe("new");
  });
  it("a long write the store refuses half way: its parts leave the Keychain (no orphans), the value goes to AsyncStorage", async () => {
    const s = stores();
    const st = makeSessionStore({ secure: s.secure, plain: s.p, dropUnreadable: false, newGen: gen });
    await st.setItem(KEY, "short");
    let n = 0;
    s.fail.set = () => ++n > 2;
    await st.setItem(KEY, session(3000));
    s.fail.set = null;
    expect([...s.sec.keys()]).toEqual([KEY]);
    expect(s.sec.get(KEY)).toBe("short");
    expect(await st.getItem(KEY)).toBe(session(3000)); // the copy is newer: read first, moved now
    expect(s.plain.has(KEY)).toBe(false);
  });
  it("a reinstall: all three keys of the session go whichever is asked first; an old copy of any of them keeps them", async () => {
    expect(sessionKeys(`${KEY}-code-verifier`)).toEqual([KEY, `${KEY}-user`, `${KEY}-code-verifier`]);
    expect(sessionKeys(`${KEY}-user`)).toEqual(sessionKeys(KEY));
    for (const first of [`${KEY}-user`, `${KEY}-code-verifier`]) {
      const s = stores({});
      for (const k of sessionKeys(KEY)) s.sec.set(k, "of the person before");
      await makeSessionStore({ secure: s.secure, plain: s.p, dropUnreadable: false }).getItem(first);
      expect(s.sec.size, first).toBe(0);
    }
    const s = stores({ [`${KEY}-user`]: "old copy" });
    s.sec.set(KEY, "mine");
    expect(await makeSessionStore({ secure: s.secure, plain: s.p, dropUnreadable: false }).getItem(KEY)).toBe("mine");
  });
  it("the mark cannot be read: nothing is wiped", async () => {
    const s = stores({});
    s.sec.set(KEY, "mine");
    const st = makeSessionStore({ secure: s.secure, plain: { ...s.p, getItem: async (k) => (k === INSTALL_MARK ? Promise.reject(new Error("busy")) : s.p.getItem(k)) }, dropUnreadable: false });
    expect(await st.getItem(KEY)).toBe("mine");
  });
  it("the mark cannot be written: nothing is wiped (a later start would wipe a live session)", async () => {
    const s = stores({});
    s.sec.set(KEY, "mine");
    const st = makeSessionStore({ secure: s.secure, plain: { ...s.p, setItem: async () => Promise.reject(new Error("full")) }, dropUnreadable: false });
    expect(await st.getItem(KEY)).toBe("mine");
  });
  it("removeItem and forget (account deletion): both stores, every part", async () => {
    const s = stores();
    const st = makeSessionStore({ secure: s.secure, plain: s.p, dropUnreadable: false, newGen: gen });
    await st.setItem(KEY, session(3000));
    s.plain.set(KEY, "copy");
    await st.removeItem(KEY);
    expect(s.sec.size).toBe(0);
    expect(s.plain.has(KEY)).toBe(false);
    await st.setItem(`${KEY}-user`, session(3000));
    await st.setItem(`${KEY}-code-verifier`, "v");
    await st.forget([KEY, `${KEY}-user`, `${KEY}-code-verifier`]);
    expect(s.sec.size).toBe(0);
  });
  it("no native module (the web, an older build): AsyncStorage exactly as before", async () => {
    const s = stores({});
    const st = makeSessionStore({ secure: null, plain: s.p, dropUnreadable: false });
    await st.setItem(KEY, "v");
    expect(s.plain.get(KEY)).toBe("v");
    expect(await st.getItem(KEY)).toBe("v");
    await st.forget([KEY]);
    expect(s.plain.has(KEY)).toBe(false);
    expect(s.plain.has(INSTALL_MARK)).toBe(false);
  });
  it("the keys auth-js uses fit the store's rule", () => {
    for (const k of [KEY, `${KEY}-user`, `${KEY}-code-verifier`, `${KEY}.g1abc.12`, INSTALL_MARK]) expect(k).toMatch(KEY_OK);
  });
});

describe("unit:sessionStore — which store the app takes (#1634)", () => {
  const S = (secure: Map<string, string>) => ({
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 7,
    getItemAsync: async (k: string, o?: { keychainAccessible?: number }) => (expect(o?.keychainAccessible).toBe(7), secure.get(k) ?? null),
    setItemAsync: async (k: string, v: string, o?: { keychainAccessible?: number }) => (expect(o?.keychainAccessible).toBe(7), void secure.set(k, v)),
    deleteItemAsync: async (k: string) => void secure.delete(k),
  });
  it("a phone with the module: the protected store, «after the first unlock, this device only»", async () => {
    const secure = new Map<string, string>();
    const kv = nativeSecure("ios", () => ({}), () => S(secure) as never);
    expect(kv).not.toBeNull();
    await kv!.set(KEY, "v");
    expect(await kv!.get(KEY)).toBe("v");
    await kv!.del(KEY);
    expect(secure.size).toBe(0);
  });
  it("an older build without the module (JS by air): the package is never loaded — AsyncStorage as before; the web too", () => {
    const load = vi.fn(() => {
      throw new Error("Cannot find native module 'ExpoSecureStore'");
    });
    expect(nativeSecure("ios", () => null, load)).toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(nativeSecure("web", () => ({}), load)).toBeNull();
    // a package that throws anyway: still AsyncStorage, never a crash at start
    expect(nativeSecure("android", () => ({}), load)).toBeNull();
  });
});

describe("unit:sessionStore — the start reads the session again while the store refuses (#1634, review 24.11)", () => {
  it("a refused read (before the first unlock) is tried again, never read as «signed out»; a screen gone stops it", async () => {
    const { readSessionRetrying } = await import("../src/cloud/sessionStore");
    let n = 0;
    const get = async () => {
      n += 1;
      if (n < 3) throw new Error("User interaction is not allowed");
      return { data: { session: "s" } };
    };
    expect(await readSessionRetrying(get, () => true, 1)).toEqual({ data: { session: "s" } });
    expect(n).toBe(3);
    let alive = true;
    const never = async () => {
      alive = false;
      throw new Error("refused");
    };
    expect(await readSessionRetrying(never, () => alive, 1)).toBeNull();
  });
});
