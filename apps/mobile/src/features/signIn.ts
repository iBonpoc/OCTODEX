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
  | "auth.err.mailDown"
  | "auth.err.blocked"
  | "auth.err.other";

export interface SignInErr {
  key: SignInErrKey;
  /** «через N с»: the server's own wait (`only request this after N seconds`) */
  seconds?: number;
}

/** digits of the email code — equals `otp_length` in supabase/config.toml and the hosted project (spec 52 Р3; guard: authEmails.test.ts) */
export const CODE_LENGTH = 6;
/**
 * the fewest digits «Войти» sends — the code is exactly CODE_LENGTH since the founder's decision of 18.11 (6 digits,
 * 10 minutes); the hosted project's «Email OTP Length» is set to 6 BEFORE this build goes out (an 8-digit code cannot be
 * typed into a 6-digit field)
 */
export const CODE_MIN = 6;

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
  // the mail service refused (SMTP down, the provider's quota): nothing the person can fix
  if (m.includes("error sending")) return { key: "auth.err.mailDown" };
  if (m.includes("banned")) return { key: "auth.err.blocked" };
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

/** where the screen shows a refusal: under its field (DS §11 п.2), or under the button */
export function errPlace(key: SignInErrKey): "code" | "email" | "form" {
  if (key === "auth.err.code") return "code";
  // the address is what to change: under the email field (review PR-1 №8)
  if (key === "auth.err.badEmail" || key === "auth.err.notAllowed") return "email";
  return "form";
}
/** a refusal with no way on but a person: «Написать в поддержку» next to it */
export function needsSupport(key: SignInErrKey): boolean {
  return key === "auth.err.notAllowed" || key === "auth.err.mailDown" || key === "auth.err.blocked";
}
/** the code as typed or pasted: digits only, at most CODE_LENGTH («1234 5678» from a paste works) */
export function codeDigits(s: string): string {
  return s.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

/**
 * what the code field does after a refused check (spec 52 §6, С1): a wrong or old code stays with its digits selected —
 * the person sees what was typed, the next code is typed over it; any other refusal (network, limits) keeps the digits as
 * they are, so «Войти» checks them again
 */
export function codeAfterFail(key: SignInErrKey): "select" | "keep" {
  return key === "auth.err.code" ? "select" : "keep";
}
