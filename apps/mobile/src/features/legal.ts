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
 * app): it is kept on the device and sent once a session exists. Kept with the editions the person saw.
 */
export const PENDING_LEGAL_KEY = "octo.legal.pending.v1";
type KV = { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void>; removeItem: (k: string) => Promise<void> };
export async function rememberAgreement(store: Pick<KV, "setItem">, at = new Date().toISOString()) {
  await store.setItem(PENDING_LEGAL_KEY, JSON.stringify({ versions: LEGAL_VERSIONS, at }));
}
/** the remembered tick, only if it is for the editions of this app (an old tick for an old text does not count) */
export async function peekAgreement(store: Pick<KV, "getItem">): Promise<typeof LEGAL_VERSIONS | null> {
  try {
    const v = JSON.parse((await store.getItem(PENDING_LEGAL_KEY)) ?? "null") as { versions?: Record<string, string> } | null;
    if (v?.versions?.terms === LEGAL_VERSIONS.terms && v.versions.privacy === LEGAL_VERSIONS.privacy) return LEGAL_VERSIONS;
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
