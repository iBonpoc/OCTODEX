/**
 * Sign-in by the email code (#1756): what the screen says when Supabase Auth refuses, and the «send again» timer.
 * Words say what happened and what to do — never «ошибка / не удалось» (the director, 16.11.2026).
 * GoTrue answers a wrong code and an old code alike («Token has expired or is invalid», code otp_expired): one key.
 */
export type SignInErrKey =
  | "auth.err.notAllowed"
  | "auth.err.mailLimit"
  | "auth.err.wait"
  | "auth.err.tooMany"
  | "auth.err.code"
  | "auth.err.password"
  | "auth.err.notConfirmed"
  | "auth.err.badEmail"
  | "auth.err.network"
  | "auth.err.other";

export interface SignInErr {
  key: SignInErrKey;
  /** «через N с»: the server's own wait (`only request this after N seconds`) */
  seconds?: number;
}

/** the pause before «Отправить ещё раз» — the hosted project's minimum between two emails to one address */
export const RESEND_S = 60;

export function signInError(message: string | null | undefined): SignInErr {
  const m = (message ?? "").toLowerCase();
  const after = /only request this after (\d+) second/.exec(m);
  if (after) return { key: "auth.err.wait", seconds: Number(after[1]) };
  // the built-in Supabase mail sends only to the project's team (email_address_not_authorized)
  // «Signups not allowed for otp» — new accounts are switched off in the project: not a code problem (review #1756 №1)
  if (m.includes("not authorized") || m.includes("signups not allowed") || m.includes("signup is disabled")) return { key: "auth.err.notAllowed" };
  if (m.includes("email rate limit")) return { key: "auth.err.mailLimit" };
  if (m.includes("rate limit") || m.includes("too many")) return { key: "auth.err.tooMany" };
  if (m.includes("token has expired") || m.includes("otp_expired") || (m.includes("invalid") && m.includes("token"))) return { key: "auth.err.code" };
  if (m.includes("invalid login credentials")) return { key: "auth.err.password" };
  if (m.includes("email not confirmed")) return { key: "auth.err.notConfirmed" };
  if (m.includes("email address") && m.includes("invalid")) return { key: "auth.err.badEmail" };
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("fetch failed") || m.includes("load failed")) return { key: "auth.err.network" };
  return { key: "auth.err.other" };
}

/** whole seconds left before «Отправить ещё раз» (0 — the button is on) */
export function resendLeft(readyAt: number, now: number): number {
  return Math.max(0, Math.ceil((readyAt - now) / 1000));
}

/** when the next code may be asked: a refusal with the server's own wait moves it; otherwise RESEND_S from now */
export function nextReadyAt(now: number, err?: SignInErr | null): number {
  return now + (err?.key === "auth.err.wait" && err.seconds ? err.seconds : RESEND_S) * 1000;
}
