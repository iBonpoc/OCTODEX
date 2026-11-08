/**
 * «Приём заявок» on the server (step 16, docs/specs/34-lead-intake.md §3, §3а). Pure: no Deno, no network — the Deno entry
 * (index.ts) passes the real clients; vitest passes fakes (apps/mobile/test/leadIntakeFn.test.ts).
 *
 * Three doors, one function (verify_jwt = false: a homeowner and Zapier have no JWT):
 * - GET  ?t=<form token>  → what the request page shows (company name, its kinds of work, the switches); an unknown or
 *   switched-off token gets the same empty answer.
 * - POST {t, …fields}     → a request from the page /f/<token> (only from the app's own origins). The answer is ALWAYS the
 *   same {ok: true} after a minimum time, whatever the database decided (spec §3а п.1, п.9: a homeowner learns nothing about
 *   the company's leads).
 * - POST with `Authorization: Bearer gxk_…` → a webhook (Zapier / Make): no CORS, the key only in the header.
 * The database finds the company by the hash of the token (sha256); the body never names a company. The IP is taken from
 * one trusted header and kept only as an HMAC with the function's secret. Nothing of the request is logged.
 */

export interface Req {
  method: string;
  url: string;
  header: (name: string) => string | null;
  text: () => Promise<string>;
}
export interface Res {
  status: number;
  body: string;
  headers: Record<string, string>;
}
export interface IntakeCall {
  kind: "form" | "webhook";
  tokenHash: string;
  eventKey: string;
  payloadHash: string;
  ipHash: string | null;
  payload: Payload;
  checks: Checks;
}
export interface Checks {
  bot: "true" | "false";
  captcha: "ok" | "fail" | "none";
  consent: "true" | "false";
  consent_version?: string;
}
export interface Payload {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  service?: string;
  category_id?: string;
  message?: string;
  language?: string;
  provider?: string;
  provider_ref?: string;
  cost_cents?: string;
  utm?: Record<string, string>;
}
export interface IntakeDeps {
  /** public.intake_submit → {status, …}; throws on a database error */
  submit: (c: IntakeCall) => Promise<{ status?: string } | null>;
  /** public.intake_form → {} or {company, language, captcha, sms_consent, categories} */
  formInfo: (tokenHash: string) => Promise<Record<string, unknown>>;
  /** Cloudflare Turnstile siteverify; null when no secret is configured */
  verifyCaptcha: ((token: string, ip: string | null) => Promise<{ success: boolean; hostname?: string; action?: string }>) | null;
  sha256: (s: string) => Promise<string>;
  /** HMAC-SHA256 with the function's secret INTAKE_IP_SECRET; null when it is missing (then no IP is kept) */
  hmac: ((s: string) => Promise<string>) | null;
  /** origins the page may post from: the production site and the PR previews */
  allowedOrigin: (origin: string) => boolean;
  /** hostnames Turnstile must report (the page's own) */
  captchaHosts: string[];
  /** the request headers that hold the client's IP, in order (cf-connecting-ip, then x-forwarded-for); see clientIp */
  ipHeaders: string[];
  now: () => number;
  wait: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

/** the body is cut here before anything is parsed (the database refuses more than 16 KB of fields) */
export const MAX_BODY = 16 * 1024;
/** every answer to the page comes after at least this long, so time tells nothing either */
export const MIN_ANSWER_MS = 300;
/** a person needs at least this long to fill the form (the page sends when it was opened) */
export const MIN_FILL_MS = 3000;
/** the version of the SMS consent text on the page (kept with the consent record; change it with the text) */
export const CONSENT_VERSION = "sms-v1";

export const FORM_TOKEN = /^f[0-9a-f]{32}$/;
export const HOOK_KEY = /^gxk_[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMITS: Record<keyof Omit<Payload, "utm">, number> = {
  name: 120, phone: 40, email: 254, address: 200, city: 80, state: 2, zip: 10, service: 120, category_id: 36,
  message: 2000, language: 5, provider: 30, provider_ref: 120, cost_cents: 12,
};
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "landing_page", "referrer"];

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Res => ({
  status,
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
});
export function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, x-client-info, authorization",
    Vary: "Origin",
  };
}

/** a text field: a string (or a number), control characters out, trimmed, cut; anything else → absent */
function field(v: unknown, max: number): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) v = String(v);
  if (typeof v !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
  return s || undefined;
}
/** only the known fields, each a short string; utm only its known keys */
export function cleanPayload(raw: Record<string, unknown>, kind: "form" | "webhook"): Payload {
  const out: Payload = {};
  for (const [k, max] of Object.entries(LIMITS) as [keyof typeof LIMITS, number][]) {
    if (kind === "form" && (k === "provider" || k === "provider_ref" || k === "cost_cents")) continue; // a page sets no price
    const v = field(raw[k], max);
    if (v !== undefined) out[k] = v;
  }
  if (out.category_id && !UUID.test(out.category_id)) delete out.category_id;
  const st = field(raw.state, 3);
  if (st && /^[A-Za-z]{2}$/.test(st)) out.state = st.toUpperCase();
  else delete out.state; // «California» is not a state code: dropped, not cut to «Ca»
  const utm = raw.utm;
  if (utm && typeof utm === "object" && !Array.isArray(utm)) {
    const u: Record<string, string> = {};
    for (const k of UTM_KEYS) {
      const v = field((utm as Record<string, unknown>)[k], 200);
      if (v !== undefined) u[k] = v;
    }
    if (Object.keys(u).length) out.utm = u;
  }
  return out;
}
/** the same fields always give the same text (key order fixed) — the hash of a repeat matches */
export function canonical(p: Payload): string {
  const keys = Object.keys(p).sort() as (keyof Payload)[];
  return JSON.stringify(keys.map((k) => [k, k === "utm" ? Object.entries(p.utm ?? {}).sort() : p[k]]));
}
/**
 * The client's IP. cf-connecting-ip is set by Cloudflare in front of Supabase (a forged one is refused there); without it,
 * the LAST address of x-forwarded-for — the gateway appends the real one, the first can be anything the client wrote.
 */
export function clientIp(req: Req, headers: string[]): string | null {
  for (const h of headers) {
    const v = req.header(h);
    if (!v) continue;
    const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
    const ip = parts[parts.length - 1];
    if (ip && ip.length <= 45 && /^[0-9a-fA-F:.]+$/.test(ip)) return ip;
  }
  return null;
}

async function readBody(req: Req): Promise<Record<string, unknown> | null> {
  const len = Number(req.header("content-length") ?? "0");
  if (len > MAX_BODY) return null;
  const raw = await req.text();
  if (raw.length > MAX_BODY) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function handleIntake(req: Req, d: IntakeDeps): Promise<Res> {
  const origin = req.header("origin");
  const auth = req.header("authorization") ?? "";
  const bearer = /^Bearer\s+(\S+)$/i.exec(auth)?.[1] ?? "";
  const isHook = HOOK_KEY.test(bearer);
  const pageCors = origin && d.allowedOrigin(origin) ? cors(origin) : null;

  if (req.method === "OPTIONS") return pageCors ? { status: 204, body: "", headers: pageCors } : json(403, { ok: false, code: "origin" });

  // ---- the page reads what to show ------------------------------------------------------------------------
  if (req.method === "GET") {
    if (!pageCors) return json(403, { ok: false, code: "origin" });
    const t = new URL(req.url).searchParams.get("t") ?? "";
    let info: Record<string, unknown> = {};
    if (FORM_TOKEN.test(t)) {
      try {
        info = await d.formInfo(await d.sha256(t));
      } catch {
        d.log?.("intake: form info failed");
        return json(503, { ok: false, code: "busy" }, pageCors);
      }
    }
    return json(200, { ok: true, form: info && Object.keys(info).length ? info : null }, pageCors);
  }
  if (req.method !== "POST") return json(405, { ok: false, code: "method" });

  // ---- a webhook: the key in the header, no browser ---------------------------------------------------------
  if (isHook) {
    if (origin) return json(403, { ok: false, code: "origin" }); // a browser never carries a webhook key
    const body = await readBody(req);
    if (!body) return json(400, { ok: false, code: "bad_request" });
    const payload = cleanPayload(body, "webhook");
    const payloadHash = await d.sha256(canonical(payload));
    const given = field(body.event_id, 200);
    try {
      const r = await d.submit({
        kind: "webhook", tokenHash: await d.sha256(bearer), eventKey: given ? `e:${given}` : `h:${payloadHash}`, payloadHash,
        ipHash: null, payload, checks: { bot: "false", captcha: "none", consent: "false" },
      });
      const s = r?.status;
      if (s === "unknown") return json(401, { ok: false, code: "unauthorized" });
      if (s === "invalid") return json(422, { ok: false, code: "invalid" });
      return json(200, { ok: true }); // accepted / merged / held — the company's own key: it may know it was taken
    } catch {
      d.log?.("intake: webhook submit failed");
      return json(503, { ok: false, code: "busy" });
    }
  }
  if (bearer.startsWith("gxk_")) return json(401, { ok: false, code: "unauthorized" });

  // ---- a request from the page ----------------------------------------------------------------------------
  if (!pageCors) return json(403, { ok: false, code: "origin" });
  const started = d.now();
  const body = await readBody(req);
  const t = typeof body?.t === "string" ? body.t : "";
  if (!body || !FORM_TOKEN.test(t)) return json(400, { ok: false, code: "bad_request" }, pageCors);
  const payload = cleanPayload(body, "form");
  const ip = clientIp(req, d.ipHeaders);
  const ipHash = ip && d.hmac ? await d.hmac(ip) : null;
  const openedAt = typeof body.opened_at === "number" ? body.opened_at : 0;
  const bot = (typeof body.website === "string" && body.website.trim() !== "") || !openedAt || started - openedAt < MIN_FILL_MS;
  let captcha: Checks["captcha"] = "none";
  const ct = typeof body.captcha === "string" ? body.captcha.slice(0, 2048) : "";
  if (ct && d.verifyCaptcha) {
    try {
      const v = await d.verifyCaptcha(ct, ip);
      captcha = v.success && (!v.hostname || d.captchaHosts.includes(v.hostname)) && (!v.action || v.action === "lead") ? "ok" : "fail";
    } catch {
      captcha = "fail";
    }
  }
  const consent = body.consent === true;
  const payloadHash = await d.sha256(canonical(payload));
  // the key is built here, never taken from the page: the page's nonce only tells a retry of the same send apart
  const nonce = typeof body.nonce === "string" && UUID.test(body.nonce) ? body.nonce.toLowerCase() : "";
  const eventKey = `f:${await d.sha256(`${payloadHash}|${nonce || ct || String(openedAt)}`)}`;
  try {
    await d.submit({
      kind: "form", tokenHash: await d.sha256(t), eventKey, payloadHash, ipHash, payload,
      checks: { bot: bot ? "true" : "false", captcha, consent: consent ? "true" : "false", ...(consent ? { consent_version: CONSENT_VERSION } : {}) },
    });
  } catch {
    d.log?.("intake: form submit failed");
    await d.wait(Math.max(0, MIN_ANSWER_MS - (d.now() - started)));
    return json(503, { ok: false, code: "busy" }, pageCors);
  }
  await d.wait(Math.max(0, MIN_ANSWER_MS - (d.now() - started)));
  return json(200, { ok: true }, pageCors);
}
