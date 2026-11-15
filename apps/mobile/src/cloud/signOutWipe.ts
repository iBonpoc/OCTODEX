/**
 * #1633: a sign-out leaves no copy of the person's company on the phone. What goes: the person's cloud caches
 * (`octo.cloud.v1.<company>.<me>`, the older person-less `octo.cloud.v1.<company>` whose «me» is theirs) and their kept
 * copies (`octo.broken.<key>.<time>`, #1189) — the server has all of it, the next sign-in loads it again.
 * What stays (rule 6, nothing unsent is lost): the outbox and the refused changes (only their owner sends them,
 * outboxOwner.ts), estimate drafts (only on the phone, #1658), the demo. Account deletion wipes more (deleteAccount.ts).
 * Wiped only once the session is gone from the phone (an offline sign-out that failed keeps the person signed in,
 * and their cache with them). A mark is set first: an app killed in the middle wipes again on the next start.
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

/** the keys a sign-out of `me` removes for sure, and the older person-less caches to check (pure, unit-tested) */
export function signOutKeys(keys: readonly string[], me: string): { mine: string[]; legacy: string[] } {
  const mine: string[] = [];
  const legacy: string[] = [];
  for (const k of keys) {
    const c = cacheOf(k, me);
    if (c === "mine") mine.push(k);
    else if (c === "legacy") legacy.push(k);
    else if (k.startsWith(BROKEN_PREFIX)) {
      // a kept copy of my cache (`octo.broken.<key>.<time>`); a copy of a person-less cache — whose is not known, kept
      const src = k.slice(BROKEN_PREFIX.length, k.lastIndexOf("."));
      if (cacheOf(src, me) === "mine") mine.push(k);
    }
  }
  return { mine, legacy };
}

export interface WipeStore {
  getAllKeys: () => Promise<readonly string[]>;
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
  removeItem: (k: string) => Promise<void>;
  multiRemove: (ks: string[]) => Promise<void>;
}

const store = AsyncStorage as unknown as WipeStore;

async function legacyOfMe(s: WipeStore, k: string, me: string): Promise<boolean> {
  try {
    const raw = await s.getItem(k);
    return raw != null && (JSON.parse(raw) as { db?: { me?: string } }).db?.me === me;
  } catch {
    return false; // not read: kept (the next person's sign-in removes it, cacheKey.ts othersCaches)
  }
}

/** one pass: what waits to be written is dropped, then the keys go. true — nothing of `me` is left */
async function pass(s: WipeStore, me: string): Promise<boolean> {
  const keys = await s.getAllKeys();
  const { mine, legacy } = signOutKeys(keys, me);
  for (const k of legacy) if (await legacyOfMe(s, k, me)) mine.push(k);
  const set = new Set(mine);
  forgetPendingWrites((k) => set.has(k));
  if (mine.length) await s.multiRemove(mine);
  return mine.length === 0;
}

/**
 * The wipe of `me`'s caches after the sign-out. Twice: a write of the cache already under way when the session went
 * (the store writes the old key once it switches to the demo, persist.ts keyChanged) lands before the second pass.
 * Never throws; a failure leaves the mark for the next start.
 */
export async function wipeAfterSignOut(me: string, s: WipeStore = store, pauseMs = 1000): Promise<void> {
  try {
    await s.setItem(SIGNOUT_WIPE_KEY, me);
    await pass(s, me);
    await new Promise((r) => setTimeout(r, pauseMs));
    await pass(s, me);
    await s.removeItem(SIGNOUT_WIPE_KEY);
  } catch {
    // the mark stays: wipeSignOutIfPending repeats it
  }
}

/** on start: a sign-out wipe that did not finish is repeated — unless that person is signed in again (their cache is live) */
export async function wipeSignOutIfPending(signedIn: string | null, s: WipeStore = store): Promise<void> {
  try {
    const me = await s.getItem(SIGNOUT_WIPE_KEY);
    if (!me) return;
    if (me === signedIn) return void (await s.removeItem(SIGNOUT_WIPE_KEY));
    await pass(s, me);
    await s.removeItem(SIGNOUT_WIPE_KEY);
  } catch {
    // tried again on the next start
  }
}

/** what the sign-out needs of the auth client (supabase.auth) */
export interface SignOutAuth {
  getSession: () => Promise<{ data: { session: { user: { id: string } } | null } }>;
  signOut: (o?: { scope: "local" }) => Promise<{ error: unknown }>;
}
/**
 * The sign-out (#1633): offline the global sign-out fails and keeps the session — the phone forgets it all the same
 * (scope local). `between` runs once the sign-out is asked (the app forgets the memberships). The person's caches go
 * (in the background) only when the session is gone from the phone: one still there keeps its cache.
 */
export async function signOutThenWipe(auth: SignOutAuth, between: () => void, wipe: (me: string) => Promise<void> = wipeAfterSignOut): Promise<void> {
  const sess = async () => (await auth.getSession().catch(() => null))?.data.session ?? null;
  const me = (await sess())?.user.id ?? null;
  const { error } = await auth.signOut().catch((e: unknown) => ({ error: e }));
  if (error) await auth.signOut({ scope: "local" }).catch(() => ({ error: null }));
  between();
  if (me && !(await sess())) void wipe(me);
}
