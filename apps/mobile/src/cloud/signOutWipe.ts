/**
 * #1633: a sign-out leaves no copy of the person's company on the phone. What goes: the person's cloud caches
 * (`octo.cloud.v1.<company>.<me>`, the older person-less `octo.cloud.v1.<company>` whose «me» is theirs) and their kept
 * copies (`octo.broken.<key>.<time>`, #1189) — the server has the company, the next sign-in loads it again.
 * The person's estimate drafts (`octo.drafts.v1.<company>.<me>`, #1662: the client's data is in them) go only when the
 * person said so: «Выйти и стереть» in the sign-out window (countUnsentDrafts — its «Не отправлено: N») sets the mark
 * SIGNOUT_DRAFTS_KEY. Any other sign-out (another device, an expired session, a removal from the company) asks nothing,
 * so the drafts stay (the director's review of #1689).
 * What stays (rule 6, nothing only the phone has is lost): the outbox and the refused changes (only their owner sends
 * them, outboxOwner.ts), the demo (and its drafts) — and a cache that still holds what only the phone knows: a
 * photo or a receipt the cloud refused (its file here and why, photoUpload.ts keepPhotoLocal / keepReceiptLocal: «Повторить»
 * needs them; #1659). Account deletion wipes more (deleteAccount.ts).
 * The mark goes first (before the sign-out): an app killed anywhere after it wipes on the next start — never the
 * caches of the person signed in then. A person signed in again meanwhile stops the wipe (their cache is live).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CLOUD_CACHE_PREFIX } from "@/data/cacheKey";
import { REJECTED_KEY } from "@/data/outboxOwner";
import { BROKEN_PREFIX, forgetPendingWrites } from "@/data/persist";
import { DRAFT_DAYS, DRAFTS_PREFIX, draftWorthKeeping, isEditCtx, type EstimateDraft } from "@/features/estimateDraft";

/** the mark of a sign-out wipe not finished: the person's id */
export const SIGNOUT_WIPE_KEY = "octo.signoutWipe.v1";
/** #1662: the person chose «Выйти и стереть» — their drafts go with the wipe (the person's id) */
export const SIGNOUT_DRAFTS_KEY = "octo.signoutDrafts.v1";

/** a cache key of `me` (this version's) — or an older person-less one (`legacy`: whose is read from the record) */
function cacheOf(k: string, me: string, gone: (companyId: string) => boolean, drafts: boolean): "mine" | "legacy" | null {
  // #1662: my drafts of the company (`<company>.<me>`) — only when the person chose to wipe them; never the demo's
  if (k.startsWith(DRAFTS_PREFIX)) return drafts && draftsCompany(k, me) !== null && gone(draftsCompany(k, me)!) ? "mine" : null;
  if (!k.startsWith(CLOUD_CACHE_PREFIX) || k === REJECTED_KEY) return null;
  const rest = k.slice(CLOUD_CACHE_PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot < 0) return rest && gone(rest) ? "legacy" : null;
  return rest.slice(dot + 1) === me && gone(rest.slice(0, dot)) ? "mine" : null;
}

/** the company of `me`'s drafts key (`octo.drafts.v1.<company>.<me>`); null — not mine, or the demo's */
function draftsCompany(k: string, me: string): string | null {
  const rest = k.slice(DRAFTS_PREFIX.length);
  const dot = rest.indexOf(".");
  return dot > 0 && rest.slice(dot + 1) === me ? rest.slice(0, dot) : null;
}

/**
 * #1662: how many of `me`'s estimate drafts are not saved (in every company — the sign-out takes them all): a fresh one
 * with a line or a title (estimateDraft.ts findDraft: a saved estimate takes its draft out). Never throws: a draft list
 * that cannot be read counts as one (asked rather than wiped silently).
 */
export async function countUnsentDrafts(
  me: string,
  s: WipeStore = deviceStore,
  now = Date.now(),
  /** an estimate already saved (its draft is not «unsent»: findDraft leaves it out the same way) */
  saved: (estimateId: string) => boolean = () => false,
  /** #2381 Ж1: an edit of an estimate deleted on another phone (only what the caller KNOWS: this company, its store loaded) — not asked */
  orphan: (draftsKey: string, estimateId: string) => boolean = () => false,
): Promise<number> {
  let n = 0;
  try {
    for (const k of await s.getAllKeys()) {
      if (!k.startsWith(DRAFTS_PREFIX) || draftsCompany(k, me) === null) continue;
      try {
        const list = JSON.parse((await s.getItem(k)) ?? "[]") as EstimateDraft[];
        // #2381 Б2: the edits of a saved estimate (edit|<id>) are unsent whatever their age and though the estimate is saved —
        // asked about, never wiped silently; a new estimate's draft — fresh, worth keeping and not saved yet, as before
        n += Array.isArray(list) ? list.filter((d) => (isEditCtx(d.ctx) ? draftWorthKeeping(d) && !orphan(k, d.estimateId) : now - Date.parse(d.at) < DRAFT_DAYS * 86_400_000 && draftWorthKeeping(d) && !saved(d.estimateId))).length : 1;
      } catch {
        n += 1;
      }
    }
  } catch {
    return n;
  }
  return n;
}

/**
 * the keys of `me`'s caches and their copies; `legacy` — older person-less ones (and their copies): whose is read (pure).
 * `gone` — which companies (A2: only those the person is no longer in; the sign-out: every one); `drafts` — the person's
 * estimate drafts too (only after «Выйти и стереть»)
 */
export function signOutKeys(
  keys: readonly string[],
  me: string,
  gone: (companyId: string) => boolean = () => true,
  drafts = false,
): { mine: string[]; legacy: string[] } {
  const mine: string[] = [];
  const legacy: string[] = [];
  for (const k of keys) {
    const src = k.startsWith(BROKEN_PREFIX) ? k.slice(BROKEN_PREFIX.length, k.lastIndexOf(".")) : k;
    const c = cacheOf(src, me, gone, drafts);
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
async function pass(s: WipeStore, me: string, companies?: (companyId: string) => boolean, drafts = false): Promise<number> {
  const keys = await s.getAllKeys();
  const { mine, legacy } = signOutKeys(keys, me, companies, drafts);
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
    const drafts = (await s.getItem(SIGNOUT_DRAFTS_KEY).catch(() => null)) === me;
    for (let i = 0; i < 4; i++) {
      if (o.signedIn() === me) return void (await dropMarks(s));
      const found = await pass(s, me, undefined, drafts);
      if (i > 0 && found === 0) return void (await dropMarks(s));
      await new Promise((r) => setTimeout(r, pause));
    }
  } catch {
    // the mark stays: wipeSignOutIfPending repeats it
  }
}

/** the wipe is over: its mark and the drafts mark go (the drafts mark last: a crash between keeps the question answered) */
async function dropMarks(s: WipeStore): Promise<void> {
  await s.removeItem(SIGNOUT_WIPE_KEY);
  await s.removeItem(SIGNOUT_DRAFTS_KEY);
}

/** on start: a sign-out wipe that did not finish is repeated — never while that person is signed in (their cache is live) */
export async function wipeSignOutIfPending(signedIn: string | null, s: WipeStore = deviceStore): Promise<void> {
  try {
    const me = await s.getItem(SIGNOUT_WIPE_KEY);
    if (!me) return;
    const drafts = (await s.getItem(SIGNOUT_DRAFTS_KEY)) === me;
    if (me !== signedIn) await pass(s, me, undefined, drafts);
    await dropMarks(s);
  } catch {
    // tried again on the next start
  }
}

/** the same person signed in again: their mark goes (a later start must not wipe a cache they never left) */
export async function forgetSignOutMark(uid: string, s: WipeStore = deviceStore): Promise<void> {
  try {
    if ((await s.getItem(SIGNOUT_WIPE_KEY)) === uid) await s.removeItem(SIGNOUT_WIPE_KEY);
    if ((await s.getItem(SIGNOUT_DRAFTS_KEY)) === uid) await s.removeItem(SIGNOUT_DRAFTS_KEY);
  } catch {
    // kept: the next start sees this person signed in and only takes the mark away
  }
}

export interface LeftOpts {
  /** who is signed in now (the app's own state): the wipe stops if it is not `me` any more */
  signedIn: () => string | null;
  /** the companies `me` is in now (the newest confirmed answer): never wiped — read on every pass (back in meanwhile) */
  active: () => ReadonlySet<string>;
  s?: WipeStore;
  pauseMs?: number;
}
/**
 * #1633 A2: a confirmed answer of the memberships — `me`'s caches (and their copies, the person-less one whose «me» is
 * theirs) of every company they are no longer in leave the phone; what only the phone has stays (holdsLocalOnly). Read
 * from the device, not from what the app knew before: a removal while the app was closed is wiped on the next start too.
 * The company the person just left may still be written once by the store switching away (persist.ts keyChanged): passes
 * repeat until one finds nothing (≤ 4). The open company is always active, so its cache is never touched. Never throws:
 * anything left goes with the next confirmed answer.
 */
export async function wipeLeftCompanies(me: string, o: LeftOpts): Promise<void> {
  const s = o.s ?? deviceStore;
  const pause = o.pauseMs ?? 1000;
  const gone = (c: string) => !o.active().has(c);
  try {
    for (let i = 0; i < 4; i++) {
      if (o.signedIn() !== me) return;
      const found = await pass(s, me, gone);
      // the second pass at least: the store's last write of a company just left lands after the first
      if (i > 0 && found === 0) return;
      await new Promise((r) => setTimeout(r, pause));
    }
  } catch {
    // the next confirmed answer tries again
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
export async function signOutAndMark(
  auth: SignOutAuth,
  me: string | null,
  between: () => void,
  s: WipeStore = deviceStore,
  /** #1662: «Выйти и стереть» — the person's drafts go too; otherwise they stay */
  o: { wipeDrafts?: boolean } = {},
): Promise<void> {
  if (me && o.wipeDrafts) await s.setItem(SIGNOUT_DRAFTS_KEY, me).catch(() => {});
  else await s.removeItem(SIGNOUT_DRAFTS_KEY).catch(() => {});
  if (me) await s.setItem(SIGNOUT_WIPE_KEY, me).catch(() => {});
  const { error } = await auth.signOut().catch((e: unknown) => ({ error: e }));
  if (error) await auth.signOut({ scope: "local" }).catch(() => ({ error: null }));
  between();
}
