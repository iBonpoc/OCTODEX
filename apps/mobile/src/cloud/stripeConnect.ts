/**
 * «Онлайн-оплата» on the server (step 20b, docs/specs/35-stripe.md): the edge function stripe-connect (owner / admin) and
 * the company's Stripe state (public.stripe_accounts — the office reads it too). Needs the network: Stripe makes the
 * account and the form — never queued offline (like «Приём заявок»).
 */
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/config/backend";
import { stateFromRow, type OnlinePayState } from "@/features/onlinePay";
import { supabase } from "./client";

const CALL_MS = 20_000;

/** one call of the edge function: the status and the JSON body as they are */
export async function callConnect(action: "status" | "start", companyId: string): Promise<{ status: number | null; body: unknown }> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) return { status: 401, body: null };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CALL_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-connect`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ action, companyId }),
      signal: ctl.signal,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch {
    return { status: null, body: null };
  } finally {
    clearTimeout(timer);
  }
}

/** what the server last heard from Stripe; null — no account; throws when it cannot read */
export async function readOnlinePay(companyId: string): Promise<OnlinePayState | null> {
  const { data, error } = await supabase
    .from("stripe_accounts")
    .select("charges_enabled, payouts_enabled, details_submitted, requirements_due, disabled_reason, livemode")
    .eq("company_id", companyId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? stateFromRow(data as Record<string, unknown>) : null;
}
