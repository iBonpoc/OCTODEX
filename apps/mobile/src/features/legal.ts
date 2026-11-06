/**
 * Consent to the Terms of Service and the Privacy Policy (clickwrap; wave 7а-1, docs/specs/19 §5,
 * docs/legal/01-founder-protection.md §3.5). Pure (no React) — unit-tested in test/legal.test.ts.
 *
 * The editions here must equal app.legal_current_version() in supabase/migrations/*_legal_acceptance.sql (the test
 * checks). A new edition: a new migration + these dates + the draft text in i18n (legal.*).
 */
export const LEGAL_VERSIONS = { terms: "2026-11-06", privacy: "2026-11-06" } as const;
export type LegalDoc = keyof typeof LEGAL_VERSIONS;
export const LEGAL_DOCS: readonly LegalDoc[] = ["terms", "privacy"];
export const isLegalDoc = (d: string | undefined): d is LegalDoc => d === "terms" || d === "privacy";
export const legalHref = (d: LegalDoc) => `/legal/${d}`;

/** where the person stands: unknown (not asked yet / no network — never blocks), ok, first time, a new edition */
export type LegalState = "unknown" | "ok" | "first" | "changed";
export interface LegalStatus {
  ok: boolean;
  terms?: { current: string; accepted: boolean; ever: boolean };
  privacy?: { current: string; accepted: boolean; ever: boolean };
}
export function legalState(s: LegalStatus | null | undefined): LegalState {
  if (!s || typeof s.ok !== "boolean") return "unknown";
  if (s.ok) return "ok";
  return s.terms?.ever || s.privacy?.ever ? "changed" : "first";
}

/**
 * The tick on the sign-in screen waits through sign-in (a code, a password, the email-confirmation link reopening the
 * app): it is kept on the device and sent once a session exists. Kept with the editions the person saw, the email they
 * typed and the time: only a session of THAT email, within PENDING_LEGAL_TTL_MS, sends it (a shared tablet: someone
 * else's later session never «agrees» by another person's tick — security-check 7а-1). Wiped on a failed sign-in and
 * on sign-out.
 */
export const PENDING_LEGAL_TTL_MS = 30 * 60 * 1000;
export const PENDING_LEGAL_KEY = "octo.legal.pending.v1";
type KV = { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void>; removeItem: (k: string) => Promise<void> };
const normEmail = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
export async function rememberAgreement(store: Pick<KV, "setItem">, email: string, at = new Date().toISOString()) {
  await store.setItem(PENDING_LEGAL_KEY, JSON.stringify({ versions: LEGAL_VERSIONS, email: normEmail(email), at }));
}
/**
 * The remembered tick — only for the editions of this app (an old tick for an old text does not count), for this
 * session's email and not older than the TTL.
 */
export async function peekAgreement(store: Pick<KV, "getItem">, email: string | null | undefined, now = Date.now()): Promise<typeof LEGAL_VERSIONS | null> {
  try {
    const v = JSON.parse((await store.getItem(PENDING_LEGAL_KEY)) ?? "null") as { versions?: Record<string, string>; email?: string; at?: string } | null;
    const age = now - Date.parse(v?.at ?? "");
    if (
      v?.versions?.terms === LEGAL_VERSIONS.terms &&
      v.versions.privacy === LEGAL_VERSIONS.privacy &&
      !!normEmail(email) &&
      v.email === normEmail(email) &&
      age >= 0 &&
      age <= PENDING_LEGAL_TTL_MS
    )
      return LEGAL_VERSIONS;
  } catch {
    /* a broken value is no tick */
  }
  return null;
}

/** a server refusal → the words of the app (rule 7); null — not about the consent */
export type LegalErrorKey = "legal.err.needed" | "legal.err.outdated";
export function legalErrorKey(message: string | null | undefined): LegalErrorKey | null {
  const m = (message ?? "").toLowerCase();
  if (m.includes("legal not accepted")) return "legal.err.needed";
  if (m.includes("legal version outdated")) return "legal.err.outdated";
  return null;
}

/** what the app tells the server about itself (the server checks the shape: ^[0-9A-Za-z.+ _-]{1,40}$) */
export function appVersionTag(version: string, build: number): string {
  const v = `${version}+${build}`.replace(/[^0-9A-Za-z.+ _-]/g, "").slice(0, 40);
  return v || "0";
}
export function platformTag(os: string): "ios" | "android" | "web" {
  return os === "ios" || os === "android" ? os : "web";
}

/** the «Условия изменились» gate stays off these: signing in, the documents themselves, help, the client page */
const GATE_FREE = ["/auth", "/legal", "/help", "/p"];
export const gateFreePath = (path: string) => GATE_FREE.some((p) => path === p || path.startsWith(`${p}/`));

/** «November 6, 2026» — the edition of a document (a calendar date, US format in every language, rule 7) */
export function editionLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
}

/**
 * Answers come back out of order (a slow legal_status started before «Принять» must not overwrite the «ok» the accept
 * gave — review #206 M1): every check and every accept takes a ticket; only the newest ticket's answer is applied.
 */
export function legalTickets() {
  let last = 0;
  return { take: () => ++last, isNewest: (t: number) => t === last };
}

/**
 * Where the person stands after a session appears — the ORDER matters (review #206 V1): a tick remembered on the
 * sign-in screen goes to the server first (accept), and only then may an invitation be accepted. Without a tick — just
 * ask. A failure (no network) is «unknown» and the tick stays for the next try.
 */
export async function resolveLegal(
  email: string | null | undefined,
  deps: {
    store: Pick<KV, "getItem" | "removeItem">;
    accept: () => Promise<LegalStatus>;
    status: () => Promise<LegalStatus>;
    now?: number;
  },
): Promise<LegalState> {
  try {
    if (await peekAgreement(deps.store, email, deps.now)) {
      const s = legalState(await deps.accept());
      await deps.store.removeItem(PENDING_LEGAL_KEY).catch(() => {});
      return s;
    }
    return legalState(await deps.status());
  } catch {
    return "unknown";
  }
}

/** while the answer is unknown (no network), ask again — on coming back to the app, on «online», and every minute */
export const LEGAL_RETRY_MS = 60 * 1000;
