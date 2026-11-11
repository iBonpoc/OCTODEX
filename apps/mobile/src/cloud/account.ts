/**
 * «Удалить аккаунт» on the server (wave 7а-2b, S22; docs/specs/19 §6.10–§6.12). All of it needs the network and is never
 * queued: it cannot be undone, the server must answer now. The rules (words, the repeat, the last owner, the start
 * check) are in features/deleteAccount.ts. Every request here has a timeout (review #220 №2).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/config/backend";
import {
  deleteWithRepeat, filterMark, lastOwnerCompanies, NOT_ANY, pendingOf, RETRY_CODES, WIPE_DONE_KEY, WIPE_PENDING_KEY, wipeDevice, wipedAlready, wipeMark,
  type AccountState, type DeleteOutcome, type Gone, type MembershipRow, type OwnedCompany, type WipeStore,
} from "@/features/deleteAccount";
import { forgetDeviceState } from "@/data/persist";
import { forgetSharedOps, OUTBOX_KEY, othersOf, REJECTED_KEY, wipedOnDelete, type OwnedItem } from "@/data/outboxOwner";
import { rejectedOthers, type RejectedOp } from "@/data/outboxRejected";
import { supabase } from "./client";

/** a hung request (the line dropped; OkHttp on Android waits for ever) becomes «no answer» */
export const CALL_TIMEOUT_MS = 20_000;
/** the check on start is short: the app must not wait long before it opens */
export const START_CHECK_MS = 8_000;
const timeout = (ms: number) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  return { signal: ctl.signal, done: () => clearTimeout(timer) };
};

/** the code to my own email: a fresh sign-in for this session (the server asks for one ≤ 10 min old) */
export async function sendDeleteCode(email: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  return error?.message ?? null;
}
export async function verifyDeleteCode(email: string, code: string): Promise<string | null> {
  const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
  return error?.message ?? null;
}

/** my companies where I am the last active owner, with their admins (memberships_select shows a member the whole team) */
export async function myLastOwnerCompanies(me: string): Promise<OwnedCompany[]> {
  const t = timeout(CALL_TIMEOUT_MS);
  try {
    const { data: mine, error } = await supabase
      .from("memberships").select("company_id, companies(name)").eq("user_id", me).eq("status", "active").eq("role", "owner").abortSignal(t.signal);
    if (error) throw new Error(error.message);
    const ids = (mine ?? []).map((r: { company_id: string }) => r.company_id);
    if (!ids.length) return [];
    const names: Record<string, string> = {};
    for (const r of (mine ?? []) as { company_id: string; companies: { name: string } | { name: string }[] | null }[])
      names[r.company_id] = Array.isArray(r.companies) ? (r.companies[0]?.name ?? "") : (r.companies?.name ?? "");
    const { data: team, error: e2 } = await supabase
      .from("memberships")
      .select("company_id, user_id, role, status, users!memberships_user_id_fkey(full_name, email)")
      .in("company_id", ids)
      .eq("status", "active")
      .abortSignal(t.signal);
    if (e2) throw new Error(e2.message);
    const rows: MembershipRow[] = (team ?? []).map((r: Record<string, unknown>) => {
      const u = (Array.isArray(r.users) ? r.users[0] : r.users) as { full_name?: string; email?: string } | null;
      return { company_id: String(r.company_id), user_id: String(r.user_id), role: String(r.role), status: String(r.status), name: u?.full_name || u?.email || "" };
    });
    return lastOwnerCompanies(rows, me, names);
  } finally {
    t.done();
  }
}

/** «Передать компанию»: the admin becomes the owner, I become an admin. Lock conflicts → «try again» */
export async function transferOwnership(companyId: string, toUser: string): Promise<void> {
  const t = timeout(CALL_TIMEOUT_MS);
  try {
    const { error } = await supabase.rpc("transfer_ownership", { p_company_id: companyId, p_to_user: toUser }).abortSignal(t.signal);
    if (error) throw new Error(RETRY_CODES.includes(error.code ?? "") ? "try again" : error.message);
  } finally {
    t.done();
  }
}

/** one call of the edge function: the status and the JSON body as they are (supabase.functions.invoke hides the body of a refusal) */
export async function callDelete(confirm: string, closeCompanies: string[], ms: number = CALL_TIMEOUT_MS): Promise<{ status: number | null; body: unknown }> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) return { status: 401, body: { error: "sign in first" } };
  const t = timeout(ms);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(closeCompanies.length ? { confirm, closeCompanies } : { confirm }),
      signal: t.signal,
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } finally {
    t.done();
  }
}

/** users.deleted_at of a person, with a timeout: true / false / null (no answer) */
export async function profileDeleted(uid: string, ms: number = START_CHECK_MS): Promise<Gone> {
  const t = timeout(ms);
  try {
    const { data, error } = await supabase.from("users").select("deleted_at").eq("id", uid).abortSignal(t.signal).maybeSingle();
    if (error || !data) return null;
    return !!(data as { deleted_at: string | null }).deleted_at;
  } catch {
    return null;
  } finally {
    t.done();
  }
}
/** is MY profile deleted — the truth after a lost answer (deleted_at is set by the RPC, in its one transaction) */
export async function myAccountState(ms: number = CALL_TIMEOUT_MS): Promise<AccountState> {
  const { data: s } = await supabase.auth.getSession();
  const me = s.session?.user.id;
  if (!me) return "unknown";
  const g = await profileDeleted(me, ms);
  return g === null ? "unknown" : g ? "gone" : "alive";
}

/** «Удалить навсегда»: the edge function, repeated on a lost answer (§6.12); after success the device is wiped and signed out */
export async function deleteAccount(confirm: string, closeCompanies: string[]): Promise<DeleteOutcome> {
  const out = await deleteWithRepeat(() => callDelete(confirm, closeCompanies), () => myAccountState());
  if (out.ok) await finishOnDevice((await supabase.auth.getSession().catch(() => null))?.data.session?.user.id);
  return out;
}

const deviceStore = AsyncStorage as unknown as WipeStore;
const warn = (m: string) => console.warn(`delete-account: ${m}`);

/** the account is gone: nothing of it stays on this phone (a failed wipe is repeated on the next start) */
export async function finishOnDevice(userId?: string | null): Promise<void> {
  await oneAtATime(() => wipeKeepingOthers(userId));
  // the session is closed on the server already: only forget it here
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
}
/** a wipe failed last time: once more (AuthProvider, on start) */
export function wipeIfPending(): Promise<void> {
  return oneAtATime(repeatPending);
}
/**
 * One wipe at a time (#1013 №4): the repeat on start and a deletion finished on start (goneChecker) read and write the
 * same mark and the same shared keys — one runs after the other, never in between.
 */
let running: Promise<void> | null = null;
function oneAtATime(run: () => Promise<void>): Promise<void> {
  // nothing running: started now, in this turn — the repeat tells the store before it adopts ownerless ops (#911)
  const next = running ? running.then(run, run) : run();
  const settled = next.catch(() => {});
  running = settled;
  void settled.then(() => {
    if (running === settled) running = null;
  });
  return next;
}
async function repeatPending(): Promise<void> {
  const pending = await AsyncStorage.getItem(WIPE_PENDING_KEY).catch(() => null);
  if (!pending) return;
  // the deleted person's id was kept with the mark ("1" — an older version: whose is not known)
  // never the session signed in now: after a failed wipe another person may have signed in (review #244, rule 6)
  const { userId, userIds, filterOnly } = pendingOf(pending);
  // the device was wiped already, only the mark could not be changed then (#1013 №1): never wiped again — the next
  // person's cache, drafts and role live there by now
  const done = filterOnly ? null : await readKey(WIPE_DONE_KEY);
  // «wiped» could not be read: neither wiped nor changed now — the next start asks again (review of #1013 №2)
  if (done === undefined) return warn("«wiped» not read: the repeat waits for the next start");
  const wiped = !filterOnly && wipedAlready(pending, done);
  // only the outbox was not filtered last time: the device keys are another person's by now — never wiped again (#911).
  // The store in memory first (it may hold what the disk has, and would write it back), then the disk
  if (filterOnly || wiped) {
    userIds.forEach(forgetSharedOps);
    const filtered = await filterShared(userIds);
    // «wiped» goes only once the whole-wipe mark it answers is gone for sure (review of #1013 №1): else the start after
    // the next would wipe the next person's data
    const markGone = await tries(() =>
      filtered === "done" ? AsyncStorage.removeItem(WIPE_PENDING_KEY) : wiped ? AsyncStorage.setItem(WIPE_PENDING_KEY, filterMark(userIds)) : Promise.resolve(),
    );
    if (markGone && (filtered === "done" || wiped)) await AsyncStorage.removeItem(WIPE_DONE_KEY).catch(() => {});
    return;
  }
  // the mark read here is handed on, never read again (review of #1029 №2: a second read that failed left «uA,~»
  // with «*» — the whole wipe again on every start)
  await wipeKeepingOthers(userId, false, pending);
}

/* ---------- the shared outbox and the refused changes: filtered in place, never lost (#911) ---------- */
/** a write that must land (the mark): tried again with a pause */
async function tries(write: () => Promise<void>): Promise<boolean> {
  for (let i = 1; i <= READ_TRIES; i++) {
    try {
      await write();
      return true;
    } catch {
      if (i < READ_TRIES) await new Promise((r) => setTimeout(r, READ_PAUSE_MS * i));
    }
  }
  return false;
}
const READ_TRIES = 3;
const READ_PAUSE_MS = 300;
/** the stored text; null — nothing stored; `undefined` — the device did not give it after every try */
async function readKey(key: string): Promise<string | null | undefined> {
  for (let i = 1; ; i++) {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      if (i >= READ_TRIES) return undefined;
      await new Promise((r) => setTimeout(r, READ_PAUSE_MS * i));
    }
  }
}
/**
 * Other people's entries of one shared key stay; the deleted person's (and old ones without an owner) go. Written in
 * place — the key is never removed and written back. «done» — filtered (or nothing to do); «again» — not read or not
 * written: the key is left as it is, the next start filters again; «broken» — not a list: left as it is (the store
 * offers «Сохранить копию и продолжить», #910) and never repeated.
 */
type Filtered = "done" | "again" | "broken";
async function filterKey<T>(key: string, others: (items: T[], me: string | null) => T[], ids: readonly (string | null)[]): Promise<Filtered> {
  const raw = await readKey(key);
  if (raw === undefined) return "again";
  if (raw === null) return "done";
  let items: T[];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return "broken";
    items = v as T[];
  } catch {
    return "broken";
  }
  const kept = ids.reduce((l, id) => others(l, id), items);
  if (kept.length === items.length && kept.length) return "done";
  try {
    // nothing of anyone else: the key goes (what was read is known, nothing can be lost)
    await (kept.length ? AsyncStorage.setItem(key, JSON.stringify(kept)) : AsyncStorage.removeItem(key));
    return "done";
  } catch {
    return "again";
  }
}
async function filterShared(ids: readonly (string | null)[]): Promise<Filtered> {
  const out = await filterKey<OwnedItem>(OUTBOX_KEY, othersOf, ids);
  // the money changes the server refused: other people's stay too (review #263 №2)
  const rej = await filterKey<RejectedOp>(REJECTED_KEY, rejectedOthers, ids);
  if (out === "again" || rej === "again") {
    warn(`the shared outbox was not filtered (${out}, ${rej}): again on the next start`);
    return "again";
  }
  if (out === "broken" || rej === "broken") warn(`a shared record is broken (${out}, ${rej}): left as it is`);
  return "done";
}
/**
 * The store in memory first (review #231): a pending write or a send still running cannot land after the wipe. The
 * outbox is not wiped whole: another person's unsent ops on this phone stay (rule 6) — only the deleted person's go,
 * and old ones without an owner (19 §6.12).
 */
async function wipeKeepingOthers(userId: string | null | undefined, orSession = true, known?: string): Promise<void> {
  // whose account: told by the caller (the start check knows it; the session may be gone already), else — right after
  // the deletion only — the session; unknown → null: only ops without an owner go
  // never waits for ever (a refresh of the sign-in without network): every later wipe waits for this one (#1013 №4)
  const noSession = { data: { session: null } };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const session = orSession
    ? (
        await Promise.race([
          supabase.auth.getSession().catch(() => noSession),
          new Promise<typeof noSession>((r) => (timer = setTimeout(() => r(noSession), START_CHECK_MS))),
        ]).finally(() => clearTimeout(timer))
      ).data.session
    : null;
  const me = userId || session?.user.id || null;
  // an older deletion still to finish («filter:u0», or «u0» whose wipe failed): its people go too, never forgotten
  const prior = known ?? (await readKey(WIPE_PENDING_KEY));
  // the mark could not be read (#1013 №2): what it holds is not known — it is not overwritten unless it must be
  let unknown = prior === undefined;
  const ids = [...new Set([me, ...(prior ? pendingOf(prior).userIds : [])])];
  // an older «wiped» goes right before a new mark is written (#1017 №2): it answered the older mark only — left beside
  // the new one, an app killed before the wipe would take this person's data for wiped already. Not taken away: the
  // new mark is still written, with NOT_ANY — «*» never answers it (condition of the director). No mark written (the
  // one there not read) — «wiped» is left: it may still answer that mark (review of #1017 №4)
  const clearDone = async () => {
    if (!ids.includes(NOT_ANY) && !(await tries(() => AsyncStorage.removeItem(WIPE_DONE_KEY)))) ids.push(NOT_ANY);
  };
  // one mark for all of them, set before the slow part: an app killed (or a wipe that fails) anywhere below wipes
  // again for every person on the next start (reviews of #911 №3, #1010 №3)
  if (!unknown) {
    await clearDone();
    await AsyncStorage.setItem(WIPE_PENDING_KEY, wipeMark(ids)).catch(() => {});
  }
  forgetDeviceState(wipedOnDelete, { userId: me });
  ids.filter((x) => x !== me).forEach(forgetSharedOps);
  // the shared keys are filtered in place, never removed and written back: a failed read or write keeps other
  // people's ops (#911: a read that failed was taken for «empty» and the outbox removed)
  let shared = await filterShared(ids);
  // the mark was not read at first: read once more before the wipe — known now, its people are finished too (review
  // of #1013 №3: an older «u0» left in place would wipe the next person's data)
  if (unknown) {
    const late = await readKey(WIPE_PENDING_KEY);
    if (late !== undefined) {
      unknown = false;
      await clearDone();
      await AsyncStorage.setItem(WIPE_PENDING_KEY, wipeMark([...new Set([...ids, ...(late ? pendingOf(late).userIds : [])])])).catch(() => {});
      const more = (late ? pendingOf(late).userIds : []).filter((x) => !ids.includes(x));
      if (more.length) {
        ids.push(...more);
        more.forEach(forgetSharedOps);
        shared = await filterShared(ids);
      }
    }
  }
  // the rest is gone: the next start only filters the shared keys again (never the next person's cache and drafts) —
  // the whole-wipe mark becomes «filter:» in one write, never taken away first (review of #1010 №4)
  // the mark still not read: a wipe that fails reads it once more and keeps its people in the new mark (#1017 №3)
  const failed = unknown
    ? async () => {
        // read again; still not read — this person's mark all the same (a mark that wipes again beats none; the
        // older people's ops then stay in the shared outbox — the rest of #1017 №3, four failed reads)
        const again = await readKey(WIPE_PENDING_KEY);
        return wipeMark([...new Set([...ids, ...(again ? pendingOf(again).userIds : [])])]);
      }
    : wipeMark(ids);
  await wipeDevice(deviceStore, warn, me, [OUTBOX_KEY, REJECTED_KEY], {
    failed,
    done: shared === "again" ? filterMark(ids) : null,
    leave: unknown,
    wiped: wipeMark(ids),
  });
}

/**
 * The repeat on start / sign-in (§6.9, §6.11 п.4), after goneChecker said «deleted»: the sign-in was not closed
 * («pending», an old session) — finish it quietly (the RPC answers «repeat» before it checks the word), then wipe and
 * sign out. In the background: the app opens without waiting for it.
 */
export async function finishDeletion(userId?: string): Promise<void> {
  await deleteWithRepeat(() => callDelete("DELETE", []), () => myAccountState());
  await finishOnDevice(userId);
}
