/**
 * «Удалить аккаунт» on the server (wave 7а-2b, S22; docs/specs/19 §6.10–§6.12). All of it needs the network and is never
 * queued: it cannot be undone, the server must answer now. The rules (words, the repeat, the last owner) are in
 * features/deleteAccount.ts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/config/backend";
import { deleteWithRepeat, lastOwnerCompanies, RETRY_CODES, wipeDevice, type AccountState, type DeleteOutcome, type MembershipRow, type OwnedCompany } from "@/features/deleteAccount";
import { supabase } from "./client";

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
  const { data: mine, error } = await supabase.from("memberships").select("company_id, companies(name)").eq("user_id", me).eq("status", "active").eq("role", "owner");
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
    .eq("status", "active");
  if (e2) throw new Error(e2.message);
  const rows: MembershipRow[] = (team ?? []).map((r: Record<string, unknown>) => {
    const u = (Array.isArray(r.users) ? r.users[0] : r.users) as { full_name?: string; email?: string } | null;
    return { company_id: String(r.company_id), user_id: String(r.user_id), role: String(r.role), status: String(r.status), name: u?.full_name || u?.email || "" };
  });
  return lastOwnerCompanies(rows, me, names);
}

/** «Передать компанию»: the admin becomes the owner, I become an admin. Lock conflicts → «try again» */
export async function transferOwnership(companyId: string, toUser: string): Promise<void> {
  const { error } = await supabase.rpc("transfer_ownership", { p_company_id: companyId, p_to_user: toUser });
  if (error) throw new Error(RETRY_CODES.includes(error.code ?? "") ? "try again" : error.message);
}

/** one call of the edge function: the status and the JSON body as they are (supabase.functions.invoke hides the body of a refusal) */
async function callDelete(confirm: string, closeCompanies: string[]): Promise<{ status: number | null; body: unknown }> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) return { status: 401, body: { error: "sign in first" } };
  // a hung request (the line dropped mid-answer; OkHttp on Android waits for ever) becomes «no answer» → verify, repeat
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(closeCompanies.length ? { confirm, closeCompanies } : { confirm }),
      signal: ctl.signal,
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}
const CALL_TIMEOUT_MS = 20_000;

/** is my profile deleted on the server — the truth after a lost answer (deleted_at is set by the RPC, in one transaction) */
async function myAccountState(): Promise<AccountState> {
  const { data: s } = await supabase.auth.getSession();
  const me = s.session?.user.id;
  if (!me) return "unknown";
  const { data, error } = await supabase.from("users").select("deleted_at").eq("id", me).maybeSingle();
  if (error || !data) return "unknown";
  return (data as { deleted_at: string | null }).deleted_at ? "gone" : "alive";
}

/** «Удалить навсегда»: the edge function, repeated on a lost answer (§6.12); after success the device is wiped and signed out */
export async function deleteAccount(confirm: string, closeCompanies: string[]): Promise<DeleteOutcome> {
  const out = await deleteWithRepeat(() => callDelete(confirm, closeCompanies), myAccountState);
  if (out.ok) await finishOnDevice();
  return out;
}

/** the account is gone: nothing of it stays on this phone */
export async function finishOnDevice(): Promise<void> {
  await wipeDevice(AsyncStorage as unknown as Parameters<typeof wipeDevice>[0]);
  // the session is closed on the server already: only forget it here
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
}

/**
 * The repeat on sign-in (§6.9, §6.11 п.4): the profile is deleted, but the sign-in was not closed (auth «pending», or an
 * old session). Then the deletion is finished quietly: the RPC answers «repeat» before it checks the word.
 * true — the account was deleted and the device is wiped.
 */
export async function finishDeletedAccount(me: string): Promise<boolean> {
  const { data, error } = await supabase.from("users").select("deleted_at").eq("id", me).maybeSingle();
  if (error || !data || !(data as { deleted_at: string | null }).deleted_at) return false;
  await deleteWithRepeat(() => callDelete("DELETE", []), myAccountState);
  await finishOnDevice();
  return true;
}
