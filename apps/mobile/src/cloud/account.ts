/**
 * «Удалить аккаунт» on the server (wave 7а-2b, S22; docs/specs/19 §6.10–§6.12). All of it needs the network and is never
 * queued: it cannot be undone, the server must answer now. The rules (words, the repeat, the last owner, the start
 * check) are in features/deleteAccount.ts. Every request here has a timeout (review #220 №2).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/config/backend";
import {
  deleteWithRepeat, isDeviceKey, lastOwnerCompanies, RETRY_CODES, WIPE_PENDING_KEY, wipeDevice,
  type AccountState, type DeleteOutcome, type Gone, type MembershipRow, type OwnedCompany, type WipeStore,
} from "@/features/deleteAccount";
import { forgetDeviceState } from "@/data/persist";
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
  if (out.ok) await finishOnDevice();
  return out;
}

const deviceStore = AsyncStorage as unknown as WipeStore;
const warn = (m: string) => console.warn(`delete-account: ${m}`);

/** the account is gone: nothing of it stays on this phone (a failed wipe is repeated on the next start) */
export async function finishOnDevice(): Promise<void> {
  await wipeDevice(deviceStore, warn);
  // the store in memory too: the outbox, the role, the company's cache are not written back (19 §6.12)
  forgetDeviceState(isDeviceKey);
  // the session is closed on the server already: only forget it here
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
}
/** a wipe failed last time: once more (AuthProvider, on start) */
export async function wipeIfPending(): Promise<void> {
  if (!(await AsyncStorage.getItem(WIPE_PENDING_KEY).catch(() => null))) return;
  await wipeDevice(deviceStore, warn);
  forgetDeviceState(isDeviceKey);
}

/**
 * The repeat on start / sign-in (§6.9, §6.11 п.4), after goneChecker said «deleted»: the sign-in was not closed
 * («pending», an old session) — finish it quietly (the RPC answers «repeat» before it checks the word), then wipe and
 * sign out. In the background: the app opens without waiting for it.
 */
export async function finishDeletion(): Promise<void> {
  await deleteWithRepeat(() => callDelete("DELETE", []), () => myAccountState());
  await finishOnDevice();
}
