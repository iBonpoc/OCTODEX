/**
 * #1633: a sign-out leaves no copy of the person's company on the phone. What goes: the person's cloud caches
 * (`octo.cloud.v1.<company>.<me>`, the older person-less `octo.cloud.v1.<company>` whose «me» is theirs) and their kept
 * copies (`octo.broken.<key>.<time>`, #1189) — the server has the company, the next sign-in loads it again.
 * What stays (rule 6, nothing only the phone has is lost): the outbox and the refused changes (only their owner sends
 * them, outboxOwner.ts), estimate drafts (#1658), the demo — and a cache that still holds what only the phone knows: a
 * photo or a receipt the cloud refused (its file here and why, photoUpload.ts keepPhotoLocal / keepReceiptLocal: «Повторить»
 * needs them; #1659). Account deletion wipes more (deleteAccount.ts).
 * The mark goes first (before the sign-out): an app killed anywhere after it wipes on the next start — never the
 * caches of the person signed in then. A person signed in again meanwhile stops the wipe (their cache is live).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CLOUD_CACHE_PREFIX } from "@/data/cacheKey";
import { REJECTED_KEY } from "@/data/outboxOwner";
import { BROKEN_PREFIX, forgetPendingWrites } from "@/data/persist";

/** the mark of a sign-out wipe not finished: the person's id */
export const SIGNOUT_WIPE_KEY = "octo.signoutWipe.v1";

/** a cache key of `me` (this version's) — or an older person-less one (`legacy`: whose is read from the record) */
function cacheOf(k: string, me: string): "mine" | "legacy" | null {
  if (!k.startsWith(CLOUD_CACHE_PREFIX) || k === REJECTED_KEY) return null;
  const rest = k.slice(CLOUD_CACHE_PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot < 0) return rest ? "legacy" : null;
  return rest.slice(dot + 1) === me ? "mine" : null;
}

/** the keys of `me`'s caches and their copies; `legacy` — older person-less ones (and their copies): whose is read (pure) */
export function signOutKeys(keys: readonly string[], me: string): { mine: string[]; legacy: string[] } {
  const mine: string[] = [];
  const legacy: string[] = [];
  for (const k of keys) {
    const src = k.startsWith(BROKEN_PREFIX) ? k.slice(BROKEN_PREFIX.length, k.lastIndexOf(".")) : k;
    const c = cacheOf(src, me);
    if (c === "mine") mine.push(k);
    else if (c === "legacy") legacy.push(k);
  }
  return { mine, legacy };
}

interface CacheRecord {
  db?: {
    me?: string;
    visits?: { photos?: { upload?: unknown }[] }[];
    expenses?: { receiptFailed?: unknown }[];
  };
}
/** what only this phone has in a cache: a refused photo or receipt (pure) */
export function holdsLocalOnly(r: CacheRecord): boolean {
  const d = r.db;
  return !!(d?.visits?.some((v) => v.photos?.some((p) => p.upload)) || d?.expenses?.some((x) => x.receiptFailed));
}

export interface WipeStore {
  getAllKeys: () => Promise<readonly string[]>;
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
  removeItem: (k: string) => Promise<void>;
  multiRemove: (ks: string[]) => Promise<void>;
}
const deviceStore = AsyncStorage as unknown as WipeStore;

/** one pass: what waits to be written is dropped, then the keys go. Returns how many of `me`'s keys were found */
async function pass(s: WipeStore, me: string): Promise<number> {
  const keys = await s.getAllKeys();
  const { mine, legacy } = signOutKeys(keys, me);
  const gone: string[] = [];
  for (const k of [...mine, ...legacy]) {
    let rec: CacheRecord | null = null;
    try {
      const raw = await s.getItem(k);
      rec = raw == null ? null : (JSON.parse(raw) as CacheRecord);
    } catch {
      rec = null; // not read (or not JSON): mine goes (the server has it), a person-less one stays — whose is not known
    }
    if (legacy.includes(k) && rec?.db?.me !== me) continue;
    if (rec && holdsLocalOnly(rec)) continue;
    gone.push(k);
  }
  const set = new Set(gone);
  forgetPendingWrites((k) => set.has(k));
  if (gone.length) await s.multiRemove(gone);
  return gone.length;
}

export interface WipeOpts {
  /** who is signed in now (the app's own state): the wipe stops if it is `me` again */
  signedIn: () => string | null;
  s?: WipeStore;
  pauseMs?: number;
}
/**
 * The wipe of `me`'s caches after the sign-out. Repeated until a pass finds nothing (≤ 4): a write of the cache under
 * way when the session went (the store writes the old key once it switches to the demo, persist.ts keyChanged) lands
 * between them. Never throws; anything left keeps the mark for the next start.
 */
export async function wipeAfterSignOut(me: string, o: WipeOpts): Promise<void> {
  const s = o.s ?? deviceStore;
  const pause = o.pauseMs ?? 1000;
  try {
    await s.setItem(SIGNOUT_WIPE_KEY, me);
    for (let i = 0; i < 4; i++) {
      if (o.signedIn() === me) return void (await s.removeItem(SIGNOUT_WIPE_KEY));
      const found = await pass(s, me);
      if (i > 0 && found === 0) return void (await s.removeItem(SIGNOUT_WIPE_KEY));
      await new Promise((r) => setTimeout(r, pause));
    }
  } catch {
    // the mark stays: wipeSignOutIfPending repeats it
  }
}

/** on start: a sign-out wipe that did not finish is repeated — never while that person is signed in (their cache is live) */
export async function wipeSignOutIfPending(signedIn: string | null, s: WipeStore = deviceStore): Promise<void> {
  try {
    const me = await s.getItem(SIGNOUT_WIPE_KEY);
    if (!me) return;
    if (me !== signedIn) await pass(s, me);
    await s.removeItem(SIGNOUT_WIPE_KEY);
  } catch {
    // tried again on the next start
  }
}

/** the same person signed in again: their mark goes (a later start must not wipe a cache they never left) */
export async function forgetSignOutMark(uid: string, s: WipeStore = deviceStore): Promise<void> {
  try {
    if ((await s.getItem(SIGNOUT_WIPE_KEY)) === uid) await s.removeItem(SIGNOUT_WIPE_KEY);
  } catch {
    // kept: the next start sees this person signed in and only takes the mark away
  }
}

/** what the sign-out needs of the auth client (supabase.auth) */
export interface SignOutAuth {
  getSession: () => Promise<{ data: { session: { user: { id: string } } | null } }>;
  signOut: (o?: { scope: "global" | "local" | "others" }) => Promise<{ error: unknown }>;
}
/**
 * The sign-out (#1633). `me` — the person signed in by the app's own state. The mark goes first; offline the global
 * sign-out may fail — the phone forgets the session all the same (scope local). `between` runs once the sign-out is
 * asked (the app forgets the memberships). The wipe itself follows the «signed out» event (auth.tsx), the same for a
 * sign-out on another tab or from another device; a session still on the phone gets no event, and the next start
 * takes the mark away (the person is signed in).
 */
export async function signOutAndMark(auth: SignOutAuth, me: string | null, between: () => void, s: WipeStore = deviceStore): Promise<void> {
  if (me) await s.setItem(SIGNOUT_WIPE_KEY, me).catch(() => {});
  const { error } = await auth.signOut().catch((e: unknown) => ({ error: e }));
  if (error) await auth.signOut({ scope: "local" }).catch(() => ({ error: null }));
  between();
}
