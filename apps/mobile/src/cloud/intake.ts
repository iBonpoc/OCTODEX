/**
 * The request page /f/<token> (step 16, docs/specs/34-lead-intake.md §3): a homeowner opens it from a contractor's site,
 * Google Business Profile or a QR code, without the app and without signing in. It talks only to the edge function
 * lead-intake: GET what to show, POST the request. The answer to a request is always the same {ok: true} — the page never
 * learns what the company's database decided.
 */
import type { DocLang } from "@/i18n/translate";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/config/backend";

export const INTAKE_URL = `${SUPABASE_URL}/functions/v1/lead-intake`;
export const FORM_TOKEN = /^f[0-9a-f]{32}$/;

export interface IntakeForm {
  company: string;
  language: DocLang;
  smsConsent: boolean;
  categories: { id: string; key?: string; name?: string }[];
}
export interface IntakeFields {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  categoryId?: string;
  message: string;
  language: DocLang;
  consent: boolean;
  /** the hidden field people never see (bots fill it) */
  website: string;
}

const headers = { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY };
const lang = (v: unknown): DocLang => (v === "es" || v === "ru" ? v : "en");

/** what the page shows; null — unknown or switched off (the server answers both the same) */
export async function fetchIntakeForm(token: string): Promise<IntakeForm | null> {
  if (!FORM_TOKEN.test(token)) return null;
  const r = await fetch(`${INTAKE_URL}?t=${encodeURIComponent(token)}`, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const f = ((await r.json()) as { form?: Record<string, unknown> | null }).form;
  if (!f || typeof f.company !== "string") return null;
  const cats = Array.isArray(f.categories) ? (f.categories as { id: string; key?: string; name?: string }[]) : [];
  return { company: f.company, language: lang(f.language), smsConsent: f.sms_consent === true, categories: cats.filter((c) => typeof c?.id === "string") };
}

/** the browser's language, if it is one of the client languages */
export function browserLang(): DocLang | null {
  const n = typeof navigator !== "undefined" ? (navigator.language ?? "").slice(0, 2).toLowerCase() : "";
  return n === "en" || n === "es" || n === "ru" ? n : null;
}

/** the marks of where the visitor came from (?utm_source=… on the page's link) and the page that sent them */
export function attribution(search: Record<string, string | string[] | undefined>, referrer?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"]) {
    const v = search[k];
    const s = Array.isArray(v) ? v[0] : v;
    if (s) out[k] = String(s).slice(0, 200);
  }
  if (referrer) out.referrer = referrer.slice(0, 200);
  return out;
}

/** a request; the same nonce for a retry of the same send (the server then knows it is one request) */
export async function submitIntake(token: string, f: IntakeFields, o: { openedAt: number; nonce: string; utm: Record<string, string> }): Promise<void> {
  const body = {
    t: token, name: f.name, phone: f.phone, email: f.email, address: f.address, city: f.city, state: f.state, zip: f.zip,
    category_id: f.categoryId, message: f.message, language: f.language, consent: f.consent, website: f.website,
    opened_at: o.openedAt, nonce: o.nonce, utm: o.utm,
  };
  const r = await fetch(INTAKE_URL, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const a = (await r.json().catch(() => null)) as { ok?: boolean } | null;
  if (a?.ok !== true) throw new Error("not taken");
}

/** enough to answer: a US phone (10 digits) or an email */
export function canSend(f: Pick<IntakeFields, "phone" | "email">): boolean {
  return f.phone.replace(/\D/g, "").length >= 10 || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim());
}

export function newNonce(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}
